import { padroesDe } from "./propriedades.js";
import { filhosDe, raizDe, type ElementoUI, type InterfaceUI } from "./tipos.js";

export type Severidade = "erro" | "aviso";
export interface Problema {
  severidade: Severidade;
  codigo: string;
  elemento_id: string;
  mensagem: string;
}

interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FOLHAS_TEXTO = new Set(["TextLabel", "TextButton", "TextBox"]);
const FOLHAS_VISUAIS = new Set(["TextLabel", "TextButton", "TextBox", "ImageLabel", "ImageButton"]);
const BOTOES = new Set(["TextButton", "ImageButton", "TextBox"]);
const ALTURA_MINIMA_BOTAO = 36;

const valor = (el: ElementoUI, nome: string): any => el.propriedades[nome] ?? padroesDe(el.classe)[nome];

/** Retângulo absoluto em pixels, calculado a partir do pai, como o Roblox faz com UDim2 e AnchorPoint. */
function retangulos(ui: InterfaceUI): Map<string, Retangulo> {
  const mapa = new Map<string, Retangulo>();
  const raiz = raizDe(ui);
  mapa.set(raiz.id, { x: 0, y: 0, w: ui.largura, h: ui.altura });
  const visitar = (pai: ElementoUI) => {
    const rp = mapa.get(pai.id)!;
    for (const el of filhosDe(ui, pai.id)) {
      if (!FOLHAS_VISUAIS.has(el.classe) && el.classe !== "Frame" && el.classe !== "ScrollingFrame") continue;
      const tam = valor(el, "Size") as number[];
      const pos = valor(el, "Position") as number[];
      const ancora = valor(el, "AnchorPoint") as number[];
      const w = tam[0] * rp.w + tam[1];
      const h = tam[2] * rp.h + tam[3];
      mapa.set(el.id, {
        x: rp.x + pos[0] * rp.w + pos[1] - ancora[0] * w,
        y: rp.y + pos[2] * rp.h + pos[3] - ancora[1] * h,
        w,
        h,
      });
      visitar(el);
    }
  };
  visitar(raiz);
  return mapa;
}

function sobrepoe(a: Retangulo, b: Retangulo): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canais.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores #rrggbb. */
export function razaoContraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

/** Cor de fundo efetiva: o fundo do próprio elemento, ou o do ancestral mais próximo que tem fundo visível. */
function fundoEfetivo(ui: InterfaceUI, el: ElementoUI): string | null {
  let atual: ElementoUI | undefined = el;
  while (atual) {
    const transparencia = valor(atual, "BackgroundTransparency");
    if (transparencia < 1 && typeof valor(atual, "BackgroundColor3") === "string") {
      return valor(atual, "BackgroundColor3");
    }
    atual = atual.pai_id ? ui.elementos.find((e) => e.id === atual!.pai_id) : undefined;
  }
  return null;
}

/** Confere a interface e devolve problemas de layout, legibilidade e organização. */
export function analisarInterface(ui: InterfaceUI): Problema[] {
  const problemas: Problema[] = [];
  const rets = retangulos(ui);
  const add = (severidade: Severidade, codigo: string, el: ElementoUI, mensagem: string) =>
    problemas.push({ severidade, codigo, elemento_id: el.id, mensagem });

  for (const el of ui.elementos) {
    if (el.classe === "ScreenGui" || !rets.has(el.id)) continue;
    if (valor(el, "Visible") === false) continue;
    const r = rets.get(el.id)!;
    const nome = String(valor(el, "Name"));

    if (r.x < -1 || r.y < -1 || r.x + r.w > ui.largura + 1 || r.y + r.h > ui.altura + 1) {
      add("aviso", "fora_da_tela", el, `"${nome}" passa da área da tela (${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)})`);
    }
    if (BOTOES.has(el.classe) && r.h < ALTURA_MINIMA_BOTAO) {
      add("aviso", "botao_pequeno", el, `"${nome}" tem ${Math.round(r.h)}px de altura; o mínimo recomendado é ${ALTURA_MINIMA_BOTAO}px`);
    }
    if (FOLHAS_TEXTO.has(el.classe) && valor(el, "Text") && r.h < valor(el, "TextSize")) {
      add("aviso", "texto_cortado", el, `"${nome}" é mais baixo que o texto (${valor(el, "TextSize")}px)`);
    }
    if (FOLHAS_TEXTO.has(el.classe) && valor(el, "Text")) {
      const texto = valor(el, "TextColor3");
      const fundo = fundoEfetivo(ui, el);
      if (fundo && razaoContraste(texto, fundo) < 4.5) {
        add("erro", "contraste_baixo", el, `"${nome}" tem contraste ${razaoContraste(texto, fundo).toFixed(2)}:1 com o fundo (mínimo 4.5:1)`);
      }
    }
    if (el.classe === "Frame" && nome === "Frame") {
      add("aviso", "nome_padrao", el, "Elemento com o nome padrão 'Frame': dê um nome que diga o que ele é");
    }
  }

  for (const pai of ui.elementos) {
    const irmaos = filhosDe(ui, pai.id).filter((e) => rets.has(e.id) && valor(e, "Visible") !== false);
    const nomes = new Map<string, number>();
    for (const e of irmaos) nomes.set(String(valor(e, "Name")), (nomes.get(String(valor(e, "Name"))) ?? 0) + 1);
    for (const [nome, n] of nomes) {
      if (n > 1) {
        const primeiro = irmaos.find((e) => String(valor(e, "Name")) === nome)!;
        add("aviso", "nomes_repetidos", primeiro, `${n} irmãos se chamam "${nome}": nomes repetidos dificultam a edição`);
      }
    }
    const folhas = irmaos.filter((e) => FOLHAS_VISUAIS.has(e.classe));
    for (let i = 0; i < folhas.length; i++) {
      for (let j = i + 1; j < folhas.length; j++) {
        if (sobrepoe(rets.get(folhas[i].id)!, rets.get(folhas[j].id)!)) {
          add("aviso", "sobreposicao", folhas[j], `"${valor(folhas[j], "Name")}" se sobrepõe a "${valor(folhas[i], "Name")}" dentro do mesmo pai`);
        }
      }
    }
  }
  return problemas;
}
