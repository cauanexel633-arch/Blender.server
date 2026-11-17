import { abrirNavegador } from "../render/renderizar.js";
import type { QuadroGif } from "./gif.js";

export const LIMITE_QUADROS = 120;
/** Pixels totais (largura × altura × quadros) permitidos numa exportação. Mantém o tráfego entre o Chromium e o servidor viável. */
export const LIMITE_PIXELS_TOTAIS = 12_000_000;

/** Ajusta o tamanho declarado do SVG para a resolução de saída, para o desenho sair nítido (vetor, não escalado). */
export function dimensionarSvg(svg: string, largura: number, altura: number): string {
  return svg.replace(/^<svg([^>]*?)width="\d+" height="\d+"/, `<svg$1width="${largura}" height="${altura}"`);
}

/**
 * Desenha cada SVG num canvas do Chromium e devolve os quadros indexados.
 * A quantização é feita na página: cores exatas quando há até 255, senão um cubo de 216 cores.
 */
export async function renderizarQuadros(
  svgs: string[],
  largura: number,
  altura: number,
  transparente: boolean,
): Promise<QuadroGif[]> {
  const navegador = await abrirNavegador(largura, altura);
  try {
    const pagina = await navegador.newPage();
    await pagina.setRequestInterception(true);
    pagina.on("request", (req) => {
      if (req.url().startsWith("data:") || req.url() === "about:blank") void req.continue();
      else void req.abort("blockedbyclient");
    });
    await pagina.setContent("<!doctype html><html><body></body></html>");
    const brutos = await pagina.evaluate(
      async (svgsPagina: string[], w: number, h: number, usarTransparencia: boolean) => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const saida: { paleta: number[][]; indices: string; transparente: number }[] = [];
        const quantizar = (dados: Uint8ClampedArray, n: number) => {
          for (const modo of ["exato", "cubo"]) {
            const mapa = new Map<number, number>();
            const paleta: number[][] = [];
            const indices = new Uint8Array(n);
            const transparentePixel = new Uint8Array(n);
            let couberam = true;
            for (let i = 0; i < n; i++) {
              const o = i * 4;
              if (dados[o + 3] < 128) {
                transparentePixel[i] = 1;
                continue;
              }
              const r = dados[o];
              const g = dados[o + 1];
              const b = dados[o + 2];
              let chave: number;
              let cor: number[];
              if (modo === "exato") {
                chave = (r << 16) | (g << 8) | b;
                cor = [r, g, b];
              } else {
                const r6 = Math.round(r / 51);
                const g6 = Math.round(g / 51);
                const b6 = Math.round(b / 51);
                chave = r6 * 36 + g6 * 6 + b6;
                cor = [r6 * 51, g6 * 51, b6 * 51];
              }
              let slot = mapa.get(chave);
              if (slot === undefined) {
                if (paleta.length >= 255) {
                  couberam = false;
                  break;
                }
                slot = paleta.length;
                mapa.set(chave, slot);
                paleta.push(cor);
              }
              indices[i] = slot;
            }
            if (!couberam) continue;
            let transparenteIdx = -1;
            if (transparentePixel.some((v) => v === 1)) {
              transparenteIdx = paleta.length;
              paleta.push([0, 0, 0]);
              for (let i = 0; i < n; i++) if (transparentePixel[i]) indices[i] = transparenteIdx;
            }
            return { paleta, indices, transparenteIdx };
          }
          throw new Error("Quantização falhou");
        };
        const base64 = (bytes: Uint8Array) => {
          let texto = "";
          for (let i = 0; i < bytes.length; i += 0x8000) {
            texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          }
          return btoa(texto);
        };

        for (const svg of svgsPagina) {
          const img = new Image();
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          await img.decode();
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const q = quantizar(ctx.getImageData(0, 0, w, h).data, w * h);
          saida.push({ paleta: q.paleta, indices: base64(q.indices), transparente: usarTransparencia ? q.transparenteIdx : -1 });
        }
        return saida;
      },
      svgs.map((s) => dimensionarSvg(s, largura, altura)),
      largura,
      altura,
      transparente,
    );

    return brutos.map((b) => ({
      largura,
      altura,
      indices: Uint8Array.from(Buffer.from(b.indices, "base64")),
      paleta: b.paleta as [number, number, number][],
      transparente: b.transparente,
    }));
  } finally {
    await navegador.close();
  }
}

/** Folha de sprites: todos os quadros lado a lado numa grade quase quadrada, em PNG. */
export async function renderizarFolhaPng(svgs: string[], largura: number, altura: number): Promise<Buffer> {
  const colunas = Math.ceil(Math.sqrt(svgs.length));
  const linhas = Math.ceil(svgs.length / colunas);
  const navegador = await abrirNavegador(largura, altura);
  try {
    const pagina = await navegador.newPage();
    await pagina.setRequestInterception(true);
    pagina.on("request", (req) => {
      if (req.url().startsWith("data:") || req.url() === "about:blank") void req.continue();
      else void req.abort("blockedbyclient");
    });
    await pagina.setContent("<!doctype html><html><body></body></html>");
    const base64 = await pagina.evaluate(
      async (svgsPagina: string[], w: number, h: number, c: number, l: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = w * c;
        canvas.height = h * l;
        const ctx = canvas.getContext("2d")!;
        for (let i = 0; i < svgsPagina.length; i++) {
          const img = new Image();
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgsPagina[i]);
          await img.decode();
          ctx.drawImage(img, (i % c) * w, Math.floor(i / c) * h, w, h);
        }
        return canvas.toDataURL("image/png").split(",")[1];
      },
      svgs.map((s) => dimensionarSvg(s, largura, altura)),
      largura,
      altura,
      colunas,
      linhas,
    );
    return Buffer.from(base64, "base64");
  } finally {
    await navegador.close();
  }
}
