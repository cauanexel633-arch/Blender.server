import { abrirNavegador } from "../render/renderizar.js";

const LIMITE_LADO_PX = 8000;

/**
 * Rasteriza o SVG em PNG com o Chromium. A página não faz requisições de rede:
 * imagens já chegam como data URI.
 */
export async function rasterizarSvg(
  svg: string,
  largura: number,
  altura: number,
  escala: number,
  fundoTransparente: boolean,
): Promise<Buffer> {
  if (largura * escala > LIMITE_LADO_PX || altura * escala > LIMITE_LADO_PX) {
    throw new Error(`Imagem grande demais (${largura * escala}x${altura * escala}px). O limite é ${LIMITE_LADO_PX}px por lado.`);
  }
  const navegador = await abrirNavegador(largura, altura);
  try {
    const pagina = await navegador.newPage();
    await pagina.setRequestInterception(true);
    pagina.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url === "about:blank") void req.continue();
      else void req.abort("blockedbyclient");
    });
    await pagina.setViewport({ width: largura, height: altura, deviceScaleFactor: escala });
    const html =
      `<!doctype html><html><head><meta charset="utf-8"><style>` +
      `html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}` +
      `</style></head><body>${svg}</body></html>`;
    await pagina.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const imagem = await pagina.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: largura, height: altura },
      omitBackground: fundoTransparente,
    });
    return Buffer.from(imagem);
  } finally {
    await navegador.close();
  }
}
