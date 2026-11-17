import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core";
import { gerarGlbDaCena, malhasDaCena } from "../geometria/exportar.js";
import type { Cena } from "../geometria/tipos.js";

export type Camera = "frente" | "topo" | "lado" | "isometrica";

// Direções de visão em Y-up (convenção do glTF). A câmera olha para o centro do modelo.
const DIRECOES: Record<Camera, [number, number, number]> = {
  frente: [0, 0.25, 1],
  topo: [0, 1, 0.001],
  lado: [1, 0.25, 0],
  isometrica: [1, 0.8, 1],
};

// O three.js vem do próprio node_modules do projeto, servido pela página através de uma origem falsa.
// Assim o render não depende de CDN nem de internet além da própria função.
const ORIGEM_THREE = "https://three.local";
let raizThree: string | undefined;
function obterRaizThree(): string {
  raizThree ??= dirname(dirname(createRequire(import.meta.url).resolve("three")));
  return raizThree;
}

export async function abrirNavegador(largura: number, altura: number): Promise<Browser> {
  const naVercel = Boolean(process.env.VERCEL);
  const executavel = process.env.CHROME_PATH ?? (await chromium.executablePath());
  const args = naVercel ? chromium.args : ["--no-sandbox", "--disable-dev-shm-usage"];
  return puppeteer.launch({
    executablePath: executavel,
    headless: true,
    args: [...args, "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    defaultViewport: { width: largura, height: altura },
  });
}

/** Responde só ao three.js local; qualquer outra requisição de rede é abortada. */
async function atenderRequisicao(req: HTTPRequest, raiz: string): Promise<void> {
  const url = req.url();
  if (url.startsWith("data:") || url === "about:blank") return void req.continue();
  if (!url.startsWith(`${ORIGEM_THREE}/`)) return void req.abort("blockedbyclient");

  const relativo = decodeURIComponent(url.slice(ORIGEM_THREE.length + 1).split("?")[0]);
  const arquivo = resolve(raiz, relativo);
  if (!arquivo.startsWith(raiz + sep)) return void req.respond({ status: 403 });
  try {
    const corpo = await readFile(arquivo);
    return void req.respond({
      status: 200,
      contentType: "text/javascript",
      headers: { "access-control-allow-origin": "*" },
      body: corpo,
    });
  } catch {
    return void req.respond({ status: 404 });
  }
}

/**
 * Página que carrega o GLB (com animação, se houver), ajusta uma câmera fixa que enquadra todos os
 * quadros pedidos e expõe __render(quadro) e __pixels(quadro) para o servidor.
 */
function paginaRender(
  glbBase64: string,
  camera: Camera,
  largura: number,
  altura: number,
  fps: number,
  quadros: number[],
  enquadrar: number[],
): string {
  // Só valores controlados pelo servidor entram no HTML: base64 do GLB, direção, números e quadros inteiros.
  const dir = JSON.stringify(DIRECOES[camera]);
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#f2f2f2;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"${ORIGEM_THREE}/build/three.module.js","three/addons/":"${ORIGEM_THREE}/examples/jsm/"}}</script>
</head><body>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const W = ${largura}, H = ${altura};
const DIR = ${dir};
const B64 = "${glbBase64}";
const FPS = ${fps};
const QUADROS = ${JSON.stringify(quadros)};
const ENQUADRAR = ${JSON.stringify(enquadrar)};
try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);
  const cena = new THREE.Scene();
  cena.background = new THREE.Color("#f2f2f2");
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environmentIntensity = 0.55;
  const bytes = Uint8Array.from(atob(B64), (c) => c.charCodeAt(0));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
  cena.add(gltf.scene);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) mixer.clipAction(clip).play();

  // Câmera única para toda a sequência: enquadra a união das caixas de todos os quadros.
  const caixa = new THREE.Box3();
  for (const q of ENQUADRAR) {
    mixer.setTime(q / FPS);
    gltf.scene.updateMatrixWorld(true);
    caixa.expandByObject(gltf.scene);
  }
  if (caixa.isEmpty()) caixa.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const centro = caixa.getCenter(new THREE.Vector3());
  const raio = Math.max(caixa.getSize(new THREE.Vector3()).length() / 2, 0.5);
  const camera = new THREE.PerspectiveCamera(35, W / H, raio * 0.01, raio * 100);
  const direcao = new THREE.Vector3(...DIR).normalize();
  camera.position.copy(centro).addScaledVector(direcao, raio * 2.6);
  camera.lookAt(centro);
  const luz = new THREE.DirectionalLight(0xffffff, 1.2);
  luz.position.copy(centro).addScaledVector(direcao, raio * 5);
  cena.add(luz);

  window.__render = (q) => {
    mixer.setTime(q / FPS);
    renderer.render(cena, camera);
  };
  window.__pixels = (q) => {
    window.__render(q);
    const tela = document.createElement("canvas");
    tela.width = W;
    tela.height = H;
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(renderer.domElement, 0, 0, W, H);
    const dados = ctx.getImageData(0, 0, W, H).data;
    let texto = "";
    for (let i = 0; i < dados.length; i += 0x8000) texto += String.fromCharCode(...dados.subarray(i, i + 0x8000));
    return btoa(texto);
  };
  window.__render(QUADROS[0]);
  window.__estado = "pronto";
} catch (e) {
  window.__estado = "erro";
  window.__erro = String((e && e.stack) || e);
}
</script></body></html>`;
}

export interface ResultadoRender {
  png: Buffer;
  camera: Camera;
  largura: number;
  altura: number;
}

/** Abre a cena numa página pronta para renderizar os quadros pedidos. O chamador fecha o navegador. */
async function abrirCena(
  cena: Cena,
  camera: Camera,
  largura: number,
  altura: number,
  quadros: number[],
): Promise<{ navegador: Browser; pagina: Page }> {
  const glb = await gerarGlbDaCena(cena);
  // A câmera enquadra a animação inteira, para que quadros diferentes saiam com o mesmo enquadramento.
  const enquadrar = Array.from({ length: cena.animacao?.duracao_quadros ?? 1 }, (_, i) => i);
  const html = paginaRender(glb.toString("base64"), camera, largura, altura, cena.animacao?.fps ?? 24, quadros, enquadrar);

  const navegador = await abrirNavegador(largura, altura);
  const diagnostico: string[] = [];
  try {
    const pagina = await navegador.newPage();
    pagina.on("pageerror", (e) => diagnostico.push(String(e)));
    pagina.on("console", (m) => {
      if (m.type() === "error") diagnostico.push(m.text());
    });
    await pagina.setRequestInterception(true);
    const raiz = obterRaizThree();
    pagina.on("request", (req) => void atenderRequisicao(req, raiz));
    await pagina.setViewport({ width: largura, height: altura, deviceScaleFactor: 1 });
    await pagina.setContent(html, { waitUntil: "load", timeout: 30_000 });

    try {
      await pagina.waitForFunction("window.__estado !== undefined", { timeout: 45_000, polling: 250 });
    } catch {
      throw new Error(`Tempo esgotado ao renderizar. Diagnóstico: ${diagnostico.slice(0, 3).join(" | ") || "sem erros"}`);
    }

    const estado = await pagina.evaluate(() => (window as unknown as { __estado: string }).__estado);
    if (estado === "erro") {
      const erro = await pagina.evaluate(() => (window as unknown as { __erro?: string }).__erro);
      throw new Error(`Falha ao renderizar: ${erro}`);
    }
    return { navegador, pagina };
  } catch (erro) {
    await navegador.close();
    throw erro;
  }
}

/**
 * Renderiza a cena em PNG num Chromium headless (WebGL por software), sem GPU nem computador local.
 * Com `quadro`, mostra a pose da animação naquele quadro; sem ele, a pose do quadro 0.
 */
export async function renderizarCena(
  cena: Cena,
  camera: Camera,
  largura: number,
  altura: number,
  quadro?: number,
): Promise<ResultadoRender> {
  if (malhasDaCena(cena).length === 0) throw new Error("A cena não tem objetos visíveis para renderizar");
  const q = quadro ?? 0;
  const { navegador, pagina } = await abrirCena(cena, camera, largura, altura, [q]);
  try {
    await pagina.evaluate((quadroPagina: number) => {
      (window as unknown as { __render: (n: number) => void }).__render(quadroPagina);
    }, q);
    const png = (await pagina.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: largura, height: altura },
    })) as Buffer;
    return { png, camera, largura, altura };
  } finally {
    await navegador.close();
  }
}

/** Pixels RGBA (sem compressão) de cada quadro pedido, com a mesma câmera para toda a sequência. */
export async function renderizarQuadrosCena(
  cena: Cena,
  camera: Camera,
  largura: number,
  altura: number,
  quadros: number[],
): Promise<Buffer[]> {
  if (malhasDaCena(cena).length === 0) throw new Error("A cena não tem objetos visíveis para renderizar");
  const { navegador, pagina } = await abrirCena(cena, camera, largura, altura, quadros);
  try {
    const saida: Buffer[] = [];
    for (const q of quadros) {
      const base64 = await pagina.evaluate((quadroPagina: number) => {
        return (window as unknown as { __pixels: (n: number) => string }).__pixels(quadroPagina);
      }, q);
      saida.push(Buffer.from(base64, "base64"));
    }
    return saida;
  } finally {
    await navegador.close();
  }
}
