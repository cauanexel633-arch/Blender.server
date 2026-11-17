import type { Desenho, Elemento } from "./tipos.js";

const CORES_PADRAO = { preenchimento: "#cccccc", contorno: "nenhum", textoCor: "#000000", linha: "#000000" };
const FONTE = "Arial, Helvetica, sans-serif";

const num = (v: number) => String(Math.round(v * 1000) / 1000);

function escaparXml(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Atributos de pintura: "nenhum" vira fill/stroke "none". */
function pintura(e: Elemento) {
  const preench = e.preenchimento ?? CORES_PADRAO.preenchimento;
  const contorno = e.contorno ?? CORES_PADRAO.contorno;
  const espessura = e.espessura ?? 1;
  const cor = (c: string) => (c === "nenhum" ? "none" : c);
  return `fill="${cor(preench)}" stroke="${cor(contorno)}" stroke-width="${num(espessura)}"`;
}

/** Centro geométrico do elemento, usado como eixo de rotação. */
function centro(e: Elemento): [number, number] {
  if (e.tipo === "linha") return [((e.x + (e.x2 ?? e.x)) / 2), ((e.y + (e.y2 ?? e.y)) / 2)];
  if (e.tipo === "poligono" && e.pontos?.length) {
    const xs = e.pontos.map((p) => p[0]);
    const ys = e.pontos.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }
  if (e.tipo === "texto") return [e.x, e.y];
  return [e.x + (e.largura ?? 0) / 2, e.y + (e.altura ?? 0) / 2];
}

function transformacao(e: Elemento): string {
  if (!e.rotacao) return "";
  const [cx, cy] = centro(e);
  return ` transform="rotate(${num(e.rotacao)} ${num(cx)} ${num(cy)})"`;
}

function opacidade(e: Elemento): string {
  return e.opacidade === undefined ? "" : ` opacity="${num(e.opacidade)}"`;
}

/** Pixel art: cada linha vira corridas horizontais de um mesmo símbolo, para manter o SVG enxuto. */
function pixelart(e: Elemento): string {
  const tamanho = e.tamanho_pixel ?? 1;
  const cores = new Map((e.paleta ?? []).map((p) => [p.simbolo, p.cor]));
  const partes: string[] = [];
  (e.grade ?? []).forEach((linha, r) => {
    let c = 0;
    while (c < linha.length) {
      const simbolo = linha[c];
      const cor = cores.get(simbolo);
      let fim = c + 1;
      while (fim < linha.length && linha[fim] === simbolo) fim++;
      if (cor) {
        partes.push(
          `<rect x="${num(e.x + c * tamanho)}" y="${num(e.y + r * tamanho)}" width="${num((fim - c) * tamanho)}" height="${num(tamanho)}" fill="${cor}"/>`,
        );
      }
      c = fim;
    }
  });
  return `<g${transformacao(e)}${opacidade(e)} shape-rendering="crispEdges">${partes.join("")}</g>`;
}

function texto(e: Elemento): string {
  const tamanho = e.tamanho_fonte ?? 16;
  const anchor = { esquerda: "start", centro: "middle", direita: "end" }[e.alinhamento ?? "esquerda"];
  const cor = e.preenchimento && e.preenchimento !== "nenhum" ? e.preenchimento : CORES_PADRAO.textoCor;
  const linhas = (e.texto ?? "").split("\n");
  const tspans = linhas
    .map((linha, i) => `<tspan x="${num(e.x)}" dy="${i === 0 ? 0 : num(tamanho * 1.25)}">${escaparXml(linha)}</tspan>`)
    .join("");
  return `<text x="${num(e.x)}" y="${num(e.y)}" font-size="${num(tamanho)}" font-family="${FONTE}" fill="${cor}" text-anchor="${anchor}"${transformacao(e)}${opacidade(e)}>${tspans}</text>`;
}

/**
 * Converte um elemento em SVG. `imagens` leva a URL original ao data URI já baixado,
 * porque o render não faz requisições de rede.
 */
function elementoParaSvg(e: Elemento, imagens: Map<string, string>): string | null {
  if (!e.visivel) return null;
  switch (e.tipo) {
    case "retangulo":
      return `<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.largura ?? 0)}" height="${num(e.altura ?? 0)}" rx="${num(e.raio_canto ?? 0)}" ${pintura(e)}${transformacao(e)}${opacidade(e)}/>`;
    case "elipse": {
      const w = e.largura ?? 0;
      const h = e.altura ?? 0;
      return `<ellipse cx="${num(e.x + w / 2)}" cy="${num(e.y + h / 2)}" rx="${num(w / 2)}" ry="${num(h / 2)}" ${pintura(e)}${transformacao(e)}${opacidade(e)}/>`;
    }
    case "linha":
      return `<line x1="${num(e.x)}" y1="${num(e.y)}" x2="${num(e.x2 ?? e.x)}" y2="${num(e.y2 ?? e.y)}" stroke="${e.contorno && e.contorno !== "nenhum" ? e.contorno : CORES_PADRAO.linha}" stroke-width="${num(e.espessura ?? 2)}" stroke-linecap="round"${transformacao(e)}${opacidade(e)}/>`;
    case "poligono": {
      const pontos = (e.pontos ?? []).map((p) => `${num(p[0])},${num(p[1])}`).join(" ");
      return `<polygon points="${pontos}" ${pintura(e)}${transformacao(e)}${opacidade(e)}/>`;
    }
    case "texto":
      return texto(e);
    case "imagem": {
      const href = e.url ? imagens.get(e.url) : undefined;
      if (!href) return null;
      return `<image x="${num(e.x)}" y="${num(e.y)}" width="${num(e.largura ?? 0)}" height="${num(e.altura ?? 0)}" href="${href}" preserveAspectRatio="none"${transformacao(e)}${opacidade(e)}/>`;
    }
    case "pixelart":
      return pixelart(e);
  }
}

/** SVG completo do desenho, com os elementos na ordem de empilhamento (o último fica por cima). */
export function desenhoParaSvg(desenho: Desenho, imagens: Map<string, string> = new Map()): string {
  const partes: string[] = [];
  if (desenho.fundo) {
    partes.push(`<rect x="0" y="0" width="${desenho.largura}" height="${desenho.altura}" fill="${desenho.fundo}"/>`);
  }
  for (const e of desenho.elementos) {
    const svg = elementoParaSvg(e, imagens);
    if (svg) partes.push(svg);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${desenho.largura}" height="${desenho.altura}" ` +
    `viewBox="0 0 ${desenho.largura} ${desenho.altura}">${partes.join("")}</svg>`
  );
}
