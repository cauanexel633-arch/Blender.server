import type { Browser } from "puppeteer-core";
import { abrirNavegador } from "../render/renderizar.js";
import { filhosDe, raizDe, type ElementoUI, type InterfaceUI } from "./tipos.js";
import { MODIFICADORES, type ClasseUI } from "./propriedades.js";

type Props = Record<string, unknown>;
const n = (v: unknown) => Number(v);
const arr = (v: unknown) => (Array.isArray(v) ? (v as number[]) : []);
const fmt = (x: number) => (Math.round(x * 10000) / 10000).toString();
const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Comprimento UDim: escala sobre o pai (em %) mais offset em px. */
function comprimento(escala: number, offset: number): string {
  if (escala === 0) return `${fmt(offset)}px`;
  return offset === 0 ? `${fmt(escala * 100)}%` : `calc(${fmt(escala * 100)}% + ${fmt(offset)}px)`;
}

function rgba(hex: string, transparencia: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${fmt(Math.max(0, Math.min(1, 1 - transparencia)))})`;
}

/** Família CSS aproximada para cada fonte do Roblox. Sem rede, a página usa as fontes do sistema. */
const FAMILIA: Record<string, [string, number]> = {
  Legacy: ["Arial, sans-serif", 400],
  Arial: ["Arial, sans-serif", 400],
  ArialBold: ["Arial, sans-serif", 700],
  SourceSans: ["'Source Sans Pro', Arial, sans-serif", 400],
  SourceSansBold: ["'Source Sans Pro', Arial, sans-serif", 700],
  SourceSansSemibold: ["'Source Sans Pro', Arial, sans-serif", 600],
  SourceSansLight: ["'Source Sans Pro', Arial, sans-serif", 300],
  SourceSansItalic: ["'Source Sans Pro', Arial, sans-serif", 400],
  Gotham: ["Montserrat, Arial, sans-serif", 400],
  GothamMedium: ["Montserrat, Arial, sans-serif", 500],
  GothamSemibold: ["Montserrat, Arial, sans-serif", 600],
  GothamBold: ["Montserrat, Arial, sans-serif", 700],
  Roboto: ["Roboto, Arial, sans-serif", 400],
  RobotoMono: ["'Roboto Mono', monospace", 400],
  Code: ["monospace", 400],
  Garamond: ["Garamond, serif", 400],
  Merriweather: ["Merriweather, serif", 400],
  Fantasy: ["fantasy", 400],
};

function familia(fonte: string): [string, number] {
  return FAMILIA[fonte] ?? ["Arial, sans-serif", 400];
}

/** Alinhamento de flex para o eixo principal e o transversal de um layout. */
function alinhar(valor: string): string {
  return valor === "Right" || valor === "Bottom" ? "flex-end" : valor === "Center" ? "center" : "flex-start";
}

/** Estilo de um elemento visível. Os modificadores (UI*) dos filhos entram aqui. */
function estiloElemento(el: ElementoUI, modificadores: ElementoUI[], dentroDeLayout: ElementoUI | null, raiz: boolean, w: number, h: number): string {
  const p = el.propriedades as Props;
  const s: string[] = [];
  if (raiz) {
    s.push(`position:relative`, `width:${w}px`, `height:${h}px`, `overflow:hidden`);
  } else {
    if (dentroDeLayout) {
      s.push("position:relative", "flex:none");
    } else {
      const pos = arr(p.Position);
      const ancora = arr(p.AnchorPoint);
      s.push("position:absolute", `left:${comprimento(pos[0], pos[1])}`, `top:${comprimento(pos[2], pos[3])}`);
      s.push(`transform:translate(${fmt(-(ancora[0] ?? 0) * 100)}%,${fmt(-(ancora[1] ?? 0) * 100)}%)`);
    }
    const tam = arr(p.Size);
    const celula = dentroDeLayout?.classe === "UIGridLayout" ? arr(dentroDeLayout.propriedades.CellSize) : null;
    if (celula) {
      s.push(`width:${comprimento(celula[0], celula[1])}`, `height:${comprimento(celula[2], celula[3])}`);
    } else {
      s.push(`width:${comprimento(tam[0], tam[1])}`);
      s.push(p.AutomaticSize === "Y" || p.AutomaticSize === "XY" ? "height:auto" : `height:${comprimento(tam[2], tam[3])}`);
    }
    s.push("box-sizing:border-box", "container-type:size");
    if (p.Rotation) s.push(`rotate:${fmt(n(p.Rotation))}deg`);
    s.push(`z-index:${fmt(n(p.ZIndex))}`);
  }
  if (p.Visible === false) s.push("display:none");
  if (!raiz) {
    const sombras: string[] = [];
    let fundo = rgba(String(p.BackgroundColor3), n(p.BackgroundTransparency));
    for (const m of modificadores) {
      const mp = m.propriedades as Props;
      if (m.classe === "UICorner") {
        const r = arr(mp.CornerRadius);
        s.push(`border-radius:${comprimento(r[0], r[1])}`);
      }
      if (m.classe === "UIStroke" && mp.Enabled !== false) {
        sombras.push(`inset 0 0 0 ${fmt(n(mp.Thickness))}px ${rgba(String(mp.Color), n(mp.Transparency))}`);
      }
      if (m.classe === "UIGradient") {
        fundo = `linear-gradient(${fmt(n(mp.Rotation) + 90)}deg, ${mp.Color1}, ${mp.Color2})`;
      }
      if (m.classe === "UIPadding") {
        const t = arr(mp.PaddingTop), b = arr(mp.PaddingBottom), l = arr(mp.PaddingLeft), r = arr(mp.PaddingRight);
        s.push(`padding:${comprimento(t[0], t[1])} ${comprimento(r[0], r[1])} ${comprimento(b[0], b[1])} ${comprimento(l[0], l[1])}`);
      }
      if (m.classe === "UISizeConstraint") {
        const mn = arr(mp.MinSize), mx = arr(mp.MaxSize);
        s.push(`min-width:${fmt(mn[0])}px`, `min-height:${fmt(mn[1])}px`, `max-width:${fmt(mx[0])}px`, `max-height:${fmt(mx[1])}px`);
      }
      if (m.classe === "UIAspectRatioConstraint") {
        s.push(`aspect-ratio:${fmt(n(mp.AspectRatio))}`);
        s.push(mp.DominantAxis === "Height" ? "width:auto" : "height:auto");
      }
      if (m.classe === "UIScale") s.push(`scale:${fmt(n(mp.Scale))}`);
    }
    if (fundo) s.push(`background:${fundo}`);
    if (sombras.length) s.push(`box-shadow:${sombras.join(",")}`);
    if (n(p.BorderSizePixel) > 0) s.push(`border:${fmt(n(p.BorderSizePixel))}px solid ${p.BorderColor3}`);
    if (p.ClipsDescendants) s.push("overflow:hidden");
  }
  return s.join(";");
}

/** Estilo dos filhos de um layout: flex (UIListLayout) ou grid (UIGridLayout), com os paddings do pai. */
function estiloLayout(layout: ElementoUI): string {
  const p = layout.propriedades as Props;
  if (layout.classe === "UIListLayout") {
    const horizontal = p.FillDirection === "Horizontal";
    const pad = arr(p.Padding);
    const gap = comprimento(pad[0], pad[1]);
    const principal = horizontal ? alinhar(String(p.HorizontalAlignment)) : alinhar(String(p.VerticalAlignment));
    const cruzado = horizontal ? alinhar(String(p.VerticalAlignment)) : alinhar(String(p.HorizontalAlignment));
    return `display:flex;flex-direction:${horizontal ? "row" : "column"};gap:${gap};justify-content:${principal};align-items:${cruzado}`;
  }
  const cel = arr(p.CellPadding);
  return `display:grid;grid-template-columns:repeat(auto-fill,${comprimento(arr(p.CellSize)[0], arr(p.CellSize)[1])});grid-auto-rows:${comprimento(arr(p.CellSize)[2], arr(p.CellSize)[3])};column-gap:${comprimento(cel[0], cel[1])};row-gap:${comprimento(cel[2], cel[3])};justify-content:${alinhar(String(p.HorizontalAlignment))};align-content:${alinhar(String(p.VerticalAlignment))}`;
}

function estiloTexto(el: ElementoUI, modificadores: ElementoUI[]): string {
  const p = el.propriedades as Props;
  const [fam, peso] = familia(String(p.Font));
  const s: string[] = [
    `font-family:${fam}`,
    `font-weight:${peso}`,
    `color:${rgba(String(p.TextColor3), n(p.TextTransparency))}`,
    `line-height:${fmt(n(p.LineHeight))}`,
    `text-align:${p.TextXAlignment === "Right" ? "right" : p.TextXAlignment === "Center" ? "center" : "left"}`,
    `white-space:${p.TextWrapped ? "pre-wrap" : "pre"}`,
    "overflow:hidden",
  ];
  if (p.TextScaled) {
    let tamanho = "80cqh";
    const t = modificadores.find((m) => m.classe === "UITextSizeConstraint");
    if (t) {
      const tp = t.propriedades as Props;
      tamanho = `clamp(${fmt(n(tp.MinTextSize))}px,80cqh,${fmt(n(tp.MaxTextSize))}px)`;
    }
    s.push(`font-size:${tamanho}`);
  } else {
    s.push(`font-size:${fmt(n(p.TextSize))}px`);
  }
  if (n(p.TextStrokeTransparency) < 1) {
    const c = rgba(String(p.TextStrokeColor3), n(p.TextStrokeTransparency));
    s.push(`text-shadow:1px 1px 0 ${c},-1px -1px 0 ${c},1px -1px 0 ${c},-1px 1px 0 ${c}`);
  }
  return s.join(";");
}

/** Caixa de texto de um elemento que tem texto: alinha o texto por XAlignment/YAlignment, como no Roblox. */
function caixaTexto(el: ElementoUI, modificadores: ElementoUI[]): string {
  const p = el.propriedades as Props;
  const x = alinhar(String(p.TextXAlignment));
  const y = alinhar(String(p.TextYAlignment));
  return `<div style="width:100%;height:100%;display:flex;justify-content:${x};align-items:${y};${estiloTexto(el, modificadores)}">`;
}

function corpoElemento(el: ElementoUI, modificadores: ElementoUI[], filhos: string, estiloLayoutInterno = ""): string {
  const p = el.propriedades as Props;
  switch (el.classe) {
    case "TextLabel":
    case "TextButton":
      return `${caixaTexto(el, modificadores)}${escapar(String(p.Text)).replace(/\n/g, "<br>")}</div>${filhos}`;
    case "TextBox": {
      const [fam, peso] = familia(String(p.Font));
      const ph = `#${el.id}::placeholder{color:${p.PlaceholderColor3}}`;
      return `<style>${ph}</style><input value="${escapar(String(p.Text))}" placeholder="${escapar(String(p.PlaceholderText))}" style="width:100%;height:100%;box-sizing:border-box;border:0;outline:0;background:transparent;font-family:${fam};font-weight:${peso};font-size:${fmt(n(p.TextSize))}px;color:${p.TextColor3};text-align:${p.TextXAlignment === "Right" ? "right" : p.TextXAlignment === "Center" ? "center" : "left"}">${filhos}`;
    }
    case "ImageLabel":
    case "ImageButton": {
      // Sem rede no preview: a imagem aparece como um bloco com o nome do asset.
      const opacidade = fmt(1 - n(p.ImageTransparency));
      const img = String(p.Image);
      const conteudo = img
        ? `<div style="width:100%;height:100%;background:#4a4a4f;color:#ddd;font:12px Arial;display:flex;align-items:center;justify-content:center;overflow:hidden;opacity:${opacidade}">${escapar(img)}</div>`
        : "";
      return `${conteudo}${filhos}`;
    }
    case "ScrollingFrame": {
      const tela = arr(p.CanvasSize);
      const vazio = tela.every((v) => v === 0);
      const largura = vazio ? "100%" : comprimento(tela[0], tela[1]);
      const altura = vazio || p.AutomaticCanvasSize === "Y" || p.AutomaticCanvasSize === "XY" ? "auto" : comprimento(tela[2], tela[3]);
      return `<div style="position:relative;width:${largura};min-height:${altura};${estiloLayoutInterno}">${filhos}</div>`;
    }
    default:
      return filhos;
  }
}

function renderElemento(ui: InterfaceUI, el: ElementoUI, dentroDeLayout: ElementoUI | null, w: number, h: number): string {
  const filhos = filhosDe(ui, el.id);
  const modificadores = filhos.filter((f) => MODIFICADORES.includes(f.classe as ClasseUI));
  const layout = modificadores.find((m) => m.classe === "UIListLayout" || m.classe === "UIGridLayout") ?? null;
  const visiveis = filhos.filter((f) => !MODIFICADORES.includes(f.classe as ClasseUI));
  const raiz = el.pai_id === null;

  let estilo = estiloElemento(el, modificadores, dentroDeLayout, raiz, w, h);
  // ScrollingFrame põe os filhos num div interno: o layout vai para ele, não para a moldura de rolagem.
  const layoutNoCorpo = el.classe === "ScrollingFrame" && layout ? estiloLayout(layout) : "";
  if (layout && !layoutNoCorpo) estilo += `;${estiloLayout(layout)}`;
  const interno = visiveis.map((f) => renderElemento(ui, f, layout, w, h)).join("");
  const corpo = corpoElemento(el, modificadores, interno, layoutNoCorpo);
  const nome = escapar(String((el.propriedades as Props).Name ?? el.classe));
  return `<div id="${el.id}" data-classe="${el.classe}" data-nome="${nome}" style="${estilo}">${corpo}</div>`;
}

/** HTML com a interface posicionada como no Roblox (UDim2, AnchorPoint, Rotation, ZIndex e layouts). */
export function htmlPreview(ui: InterfaceUI): string {
  const raiz = raizDe(ui);
  const corpo = renderElemento(ui, raiz, null, ui.largura, ui.altura);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:#202020}
*{-webkit-font-smoothing:antialiased}
input{font:inherit}
</style></head>
<body>${corpo}</body></html>`;
}

/** PNG do preview, renderizado no Chromium sem acesso à rede (só o HTML da interface). */
export async function renderizarPreviewPng(ui: InterfaceUI): Promise<Buffer> {
  const navegador: Browser = await abrirNavegador(ui.largura, ui.altura);
  try {
    const pagina = await navegador.newPage();
    await pagina.setRequestInterception(true);
    pagina.on("request", (req) => {
      if (req.url().startsWith("data:") || req.url() === "about:blank") void req.continue();
      else void req.abort("blockedbyclient");
    });
    await pagina.setViewport({ width: ui.largura, height: ui.altura, deviceScaleFactor: 1 });
    await pagina.setContent(htmlPreview(ui), { waitUntil: "load", timeout: 20_000 });
    const png = (await pagina.screenshot({ type: "png", clip: { x: 0, y: 0, width: ui.largura, height: ui.altura } })) as Buffer;
    return png;
  } finally {
    await navegador.close();
  }
}
