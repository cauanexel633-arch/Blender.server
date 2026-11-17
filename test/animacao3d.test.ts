import { beforeEach, describe, expect, it } from "vitest";
import { definirLoja, obterLoja } from "../src/armazenamento/loja.js";
import { poseNoQuadro, propriedadesAnimadas } from "../src/animacao/cena3d.js";
import { gerarGlbDaCena } from "../src/geometria/exportar.js";
import type { ChaveObjeto, Cena } from "../src/geometria/tipos.js";
import { renderizarQuadrosCena } from "../src/render/renderizar.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";

async function chamar(nome: string, args: Record<string, unknown> = {}): Promise<any> {
  const f = todasFerramentas.find((t) => t.nome === nome);
  if (!f) throw new Error(`ferramenta ${nome} não existe`);
  const conteudo: Conteudo[] = await f.executar(args);
  const texto = conteudo.find((c) => c.type === "text") as { text: string } | undefined;
  try {
    return JSON.parse(texto?.text ?? "null");
  } catch {
    return texto?.text;
  }
}

async function cenaComCubo(): Promise<{ cena_id: string; objeto_id: string }> {
  const { cena_id } = await chamar("criar_cena", { nome: "Teste" });
  await chamar("criar_primitiva", { cena_id, forma: "cubo", tamanho: 1, nome: "Cubo" });
  const cena = await obterLoja().obter(cena_id);
  return { cena_id, objeto_id: cena!.objetos[0].id };
}

/** Lê o JSON de um GLB (primeiro chunk) para conferir a estrutura. */
function jsonDoGlb(glb: Buffer): any {
  const tamanhoJson = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + tamanhoJson).toString("utf8").trimEnd());
}

describe("pose 3D por quadro", () => {
  const cenaBase = (chaves: ChaveObjeto[]): Cena => ({
    id: "c",
    nome: "c",
    objetos: [
      {
        id: "o",
        nome: "o",
        origem: { tipo: "primitiva", primitiva: { forma: "cubo", tamanho: 1 } },
        transformacao: { posicao: [9, 9, 9], rotacao_graus: [0, 0, 0], escala: [1, 1, 1] },
        material: { cor: "#cccccc", metalico: 0, rugosidade: 0.5, opacidade: 1 },
        visivel: true,
      },
    ],
    animacao: { fps: 10, duracao_quadros: 20, chaves },
    criada_em: "",
    atualizada_em: "",
  });

  const objeto = (c: Cena) => c.objetos[0];

  it("interpola a posição linearmente entre dois keyframes", () => {
    const c = cenaBase([
      { objeto_id: "o", propriedade: "posicao", quadro: 0, valor: [0, 0, 0], interpolacao: "linear" },
      { objeto_id: "o", propriedade: "posicao", quadro: 10, valor: [10, 0, 4], interpolacao: "linear" },
    ]);
    expect(poseNoQuadro(c, objeto(c), 5).posicao).toEqual([5, 0, 2]);
  });

  it("propriedade sem keyframes mantém a transformação guardada", () => {
    const c = cenaBase([
      { objeto_id: "o", propriedade: "posicao", quadro: 0, valor: [0, 0, 0], interpolacao: "linear" },
    ]);
    expect(poseNoQuadro(c, objeto(c), 3).escala).toEqual([1, 1, 1]);
  });

  it("constante mantém o valor até o próximo keyframe", () => {
    const c = cenaBase([
      { objeto_id: "o", propriedade: "rotacao_graus", quadro: 0, valor: [0, 0, 0], interpolacao: "constante" },
      { objeto_id: "o", propriedade: "rotacao_graus", quadro: 10, valor: [0, 90, 0], interpolacao: "linear" },
    ]);
    expect(poseNoQuadro(c, objeto(c), 9).rotacao_graus).toEqual([0, 0, 0]);
    expect(poseNoQuadro(c, objeto(c), 10).rotacao_graus).toEqual([0, 90, 0]);
  });

  it("lista as propriedades animadas de cada objeto", () => {
    const c = cenaBase([
      { objeto_id: "o", propriedade: "escala", quadro: 0, valor: [1, 1, 1], interpolacao: "linear" },
    ]);
    expect(propriedadesAnimadas(c, "o")).toEqual(["escala"]);
  });
});

describe("ferramentas de animação 3D", () => {
  beforeEach(() => definirLoja(undefined));

  it("keyframe no mesmo quadro substitui o anterior e a duração cresce sozinha", async () => {
    const { cena_id, objeto_id } = await cenaComCubo();
    await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 0, valor: [0, 0, 0] });
    const r1 = await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 0, valor: [1, 0, 0] });
    expect(r1.chaves_do_objeto).toBe(1);
    const r2 = await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 60, valor: [2, 0, 0] });
    expect(r2.duracao_aumentou).toBe(true);
    expect(r2.duracao_quadros).toBe(61);
  });

  it("recusa animar operando de booleana", async () => {
    const { cena_id, objeto_id } = await cenaComCubo();
    const cena = (await obterLoja().obter(cena_id))!;
    cena.objetos.push({
      id: "b",
      nome: "Furo",
      origem: { tipo: "booleana", operacao: "subtracao", a: objeto_id, b: objeto_id },
      transformacao: { posicao: [0, 0, 0], rotacao_graus: [0, 0, 0], escala: [1, 1, 1] },
      material: { cor: "#cccccc", metalico: 0, rugosidade: 0.5, opacidade: 1 },
      visivel: true,
    });
    await obterLoja().salvar(cena);
    await expect(
      chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 0, valor: [0, 0, 0] }),
    ).rejects.toThrow(/operando de uma booleana/);
  });

  it("exportar sem keyframes avisa para criar animação antes", async () => {
    const { cena_id } = await cenaComCubo();
    await expect(chamar("exportar_animacao_3d", { cena_id, formato: "glb" })).rejects.toThrow(/não tem keyframes/);
  });

  it("apagar_chaves_objeto remove só a propriedade pedida", async () => {
    const { cena_id, objeto_id } = await cenaComCubo();
    await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 0, valor: [0, 0, 0] });
    await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "escala", quadro: 0, valor: [2, 2, 2] });
    const r = await chamar("apagar_chaves_objeto", { cena_id, objeto_id, propriedade: "posicao" });
    expect(r).toEqual({ removidas: 1, chaves_restantes: 1 });
  });
});

describe("GLB animado", () => {
  beforeEach(() => definirLoja(undefined));

  it("escreve canais de animação, tempos por quadro e nó raiz com escala", async () => {
    const { cena_id, objeto_id } = await cenaComCubo();
    await chamar("configurar_animacao_3d", { cena_id, fps: 10, duracao_quadros: 5 });
    await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 0, valor: [0, 0, 0] });
    await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 4, valor: [4, 0, 0] });
    await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "escala", quadro: 2, valor: [2, 2, 2], interpolacao: "suave" });

    const cena = (await obterLoja().obter(cena_id))!;
    const glb = await gerarGlbDaCena(cena, { escala: 0.001, baseNoChao: false });
    expect(glb.toString("ascii", 0, 4)).toBe("glTF");
    const json = jsonDoGlb(glb);

    expect(json.animations).toHaveLength(1);
    const canais = json.animations[0].channels.map((c: { target: { path: string } }) => c.target.path).sort();
    expect(canais).toEqual(["scale", "translation"]);

    // Os tempos são um por quadro: 5 quadros a 10 fps.
    const acessorTempo = json.accessors[json.animations[0].samplers[0].input];
    expect(acessorTempo.count).toBe(5);
    expect(acessorTempo.max[0]).toBeCloseTo(0.4);

    // Escala 0.001 vira um nó raiz com essa escala.
    const raiz = json.nodes.find((n: { name?: string }) => n.name === "raiz");
    expect(raiz.scale[0]).toBeCloseTo(0.001);
  });

  it("uma cena sem animação continua com o GLB estático de antes", async () => {
    const { cena_id } = await cenaComCubo();
    const cena = (await obterLoja().obter(cena_id))!;
    const json = jsonDoGlb(await gerarGlbDaCena(cena));
    expect(json.animations).toBeUndefined();
    expect(json.nodes.find((n: { name?: string }) => n.name === "raiz")).toBeUndefined();
  });
});

describe.skipIf(!process.env.CHROME_PATH)("render 3D animado com Chromium", () => {
  beforeEach(() => definirLoja(undefined));

  it("quadros diferentes geram imagens diferentes e o GIF tem o cabeçalho certo", async () => {
    const { cena_id, objeto_id } = await cenaComCubo();
    await chamar("configurar_animacao_3d", { cena_id, fps: 8, duracao_quadros: 4 });
    await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 0, valor: [-2, 0, 0] });
    await chamar("animar_objeto", { cena_id, objeto_id, propriedade: "posicao", quadro: 3, valor: [2, 0, 0] });

    const cena = (await obterLoja().obter(cena_id))!;
    const [primeiro, segundo] = await renderizarQuadrosCena(cena, "frente", 120, 90, [0, 1]);
    expect(primeiro.length).toBe(120 * 90 * 4);
    expect(Buffer.compare(primeiro, segundo)).not.toBe(0);

    const r = await todasFerramentas.find((f) => f.nome === "exportar_animacao_3d")!.executar({
      cena_id,
      formato: "gif",
      camera: "frente",
      largura: 120,
      altura: 100,
      quadro_inicial: 0,
      quadro_final: 3,
      escala: 1,
      base_no_chao: false,
    });
    const img = r.find((c) => c.type === "image") as { data: string; mimeType: string };
    expect(img.mimeType).toBe("image/gif");
    expect(Buffer.from(img.data, "base64").toString("ascii", 0, 6)).toBe("GIF89a");
  }, 90_000);
});
