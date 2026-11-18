import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { CLASSES_UI, DEFINICOES, ELEMENTOS_GUI, MODIFICADORES, padroesDe, validarPropriedade, type ClasseUI, type Valor } from "./propriedades.js";

export const ValorUI = z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]);

export const ElementoUI = z.object({
  id: z.string(),
  classe: z.enum(CLASSES_UI),
  pai_id: z.string().nullable(),
  propriedades: z.record(z.string(), ValorUI),
});

export const InterfaceUI = z.object({
  id: z.string(),
  nome: z.string(),
  largura: z.number().int().min(100).max(4000),
  altura: z.number().int().min(100).max(4000),
  elementos: z.array(ElementoUI),
  /** Hash do estado no último preview. Qualquer edição zera o valor e obriga um novo preview. */
  preview_hash: z.string().nullable(),
  criada_em: z.string(),
  atualizada_em: z.string(),
});

export type ElementoUI = z.output<typeof ElementoUI>;
export type InterfaceUI = z.output<typeof InterfaceUI>;

export const LIMITE_ELEMENTOS = 500;

const LAYOUTS = new Set<ClasseUI>(["UIListLayout", "UIGridLayout"]);
/** Modificadores que podem aparecer no máximo uma vez por elemento. UIStroke pode repetir. */
const UNICOS = new Set<ClasseUI>(MODIFICADORES.filter((c) => c !== "UIStroke"));

export function novoIdUI(prefixo: string): string {
  return `${prefixo}_${randomUUID().slice(0, 8)}`;
}

/** Cria a interface com o ScreenGui raiz. */
export function criarInterfaceUI(nome: string, largura: number, altura: number): InterfaceUI {
  const agora = new Date().toISOString();
  const raiz: ElementoUI = {
    id: novoIdUI("gui"),
    classe: "ScreenGui",
    pai_id: null,
    propriedades: { ...padroesDe("ScreenGui"), Name: nome },
  };
  return {
    id: novoIdUI("ui"),
    nome,
    largura,
    altura,
    elementos: [raiz],
    preview_hash: null,
    criada_em: agora,
    atualizada_em: agora,
  };
}

export function raizDe(ui: InterfaceUI): ElementoUI {
  const raiz = ui.elementos.find((e) => e.pai_id === null);
  if (!raiz) throw new Error("A interface não tem ScreenGui raiz");
  return raiz;
}

export function acharElemento(ui: InterfaceUI, id: string): ElementoUI {
  const el = ui.elementos.find((e) => e.id === id);
  if (!el) throw new Error(`Elemento "${id}" não existe nesta interface`);
  return el;
}

export function filhosDe(ui: InterfaceUI, id: string): ElementoUI[] {
  return ui.elementos.filter((e) => e.pai_id === id);
}

function descendentes(ui: InterfaceUI, id: string): Set<string> {
  const saida = new Set<string>();
  const pilha = [id];
  while (pilha.length) {
    const atual = pilha.pop()!;
    for (const f of filhosDe(ui, atual)) {
      saida.add(f.id);
      pilha.push(f.id);
    }
  }
  return saida;
}

/** Regras de hierarquia do Roblox: o que pode ficar dentro de quê, e modificadores únicos por elemento. */
function validarPai(ui: InterfaceUI, classe: ClasseUI, paiId: string, ignorarId?: string): void {
  const pai = acharElemento(ui, paiId);
  if (classe === "ScreenGui") throw new Error("ScreenGui só pode ser a raiz da interface");
  if (MODIFICADORES.includes(classe)) {
    if (!ELEMENTOS_GUI.includes(pai.classe) && pai.classe !== "ScreenGui") {
      throw new Error(`${classe} precisa estar dentro de um elemento visível (Frame, TextLabel, etc.)`);
    }
    if (pai.classe === "ScreenGui") throw new Error(`${classe} não pode estar direto no ScreenGui; coloque dentro de um Frame`);
  } else if (pai.classe !== "ScreenGui" && !ELEMENTOS_GUI.includes(pai.classe)) {
    throw new Error(`${classe} não pode ser filho de ${pai.classe}`);
  }
  if (ignorarId && descendentes(ui, ignorarId).has(paiId)) {
    throw new Error("Um elemento não pode ser movido para dentro dele mesmo");
  }

  const irmaos = filhosDe(ui, paiId).filter((e) => e.id !== ignorarId);
  if (UNICOS.has(classe) && irmaos.some((e) => e.classe === classe)) {
    throw new Error(`${pai.propriedades.Name ?? pai.classe} já tem um ${classe}`);
  }
  if (LAYOUTS.has(classe) && irmaos.some((e) => LAYOUTS.has(e.classe))) {
    throw new Error("Um elemento pode ter só um layout (UIListLayout ou UIGridLayout)");
  }
}

function validarPropriedades(classe: ClasseUI, props: Record<string, unknown>): Record<string, Valor> {
  const saida: Record<string, Valor> = {};
  for (const [nome, valor] of Object.entries(props)) {
    saida[nome] = validarPropriedade(classe, nome, valor);
  }
  return saida;
}

export function adicionarElementoUI(
  ui: InterfaceUI,
  classe: ClasseUI,
  paiId: string,
  props: Record<string, unknown>,
): ElementoUI {
  if (ui.elementos.length >= LIMITE_ELEMENTOS) throw new Error(`Limite de ${LIMITE_ELEMENTOS} elementos por interface`);
  if (classe === "ScreenGui") throw new Error("Crie outra interface para um novo ScreenGui");
  validarPai(ui, classe, paiId);
  const padrao = padroesDe(classe);
  const elemento: ElementoUI = {
    id: novoIdUI(classe.slice(0, 4).toLowerCase()),
    classe,
    pai_id: paiId,
    propriedades: { ...padrao, ...validarPropriedades(classe, props) },
  };
  ui.elementos.push(elemento);
  return elemento;
}

export function editarElementoUI(ui: InterfaceUI, id: string, props: Record<string, unknown>): ElementoUI {
  const el = acharElemento(ui, id);
  if (Object.keys(props).length === 0) throw new Error("Informe ao menos uma propriedade para alterar");
  el.propriedades = { ...el.propriedades, ...validarPropriedades(el.classe, props) };
  return el;
}

export function moverElementoUI(ui: InterfaceUI, id: string, novoPaiId: string): ElementoUI {
  const el = acharElemento(ui, id);
  if (el.pai_id === null) throw new Error("O ScreenGui raiz não pode ser movido");
  validarPai(ui, el.classe, novoPaiId, id);
  el.pai_id = novoPaiId;
  return el;
}

/** Remove o elemento e tudo que está dentro dele. */
export function apagarElementoUI(ui: InterfaceUI, id: string): number {
  const el = acharElemento(ui, id);
  if (el.pai_id === null) throw new Error("O ScreenGui raiz não pode ser apagado; apague a interface inteira");
  const apagar = new Set([id, ...descendentes(ui, id)]);
  ui.elementos = ui.elementos.filter((e) => !apagar.has(e.id));
  return apagar.size;
}

/** Copia o elemento e seus descendentes com novos ids. Devolve o novo elemento raiz da cópia. */
export function duplicarElementoUI(ui: InterfaceUI, id: string, novoPaiId?: string): ElementoUI {
  const original = acharElemento(ui, id);
  if (original.pai_id === null) throw new Error("O ScreenGui raiz não pode ser duplicado");
  const destino = novoPaiId ?? original.pai_id;
  validarPai(ui, original.classe, destino);

  const mapa = new Map<string, string>();
  const ordem = [original.id, ...descendentes(ui, id)];
  for (const oid of ordem) mapa.set(oid, novoIdUI(acharElemento(ui, oid).classe.slice(0, 4).toLowerCase()));
  if (ui.elementos.length + ordem.length > LIMITE_ELEMENTOS) {
    throw new Error(`A cópia ultrapassaria o limite de ${LIMITE_ELEMENTOS} elementos`);
  }
  for (const oid of ordem) {
    const orig = acharElemento(ui, oid);
    ui.elementos.push({
      id: mapa.get(oid)!,
      classe: orig.classe,
      pai_id: oid === id ? destino : mapa.get(orig.pai_id!)!,
      propriedades: structuredClone(orig.propriedades),
    });
  }
  return acharElemento(ui, mapa.get(id)!);
}

/** Hash do conteúdo da interface (sem o próprio preview_hash). Muda sempre que algo visível muda. */
export function hashEstadoUI(ui: InterfaceUI): string {
  const base = JSON.stringify({ n: ui.nome, l: ui.largura, a: ui.altura, e: ui.elementos });
  return createHash("sha256").update(base).digest("hex").slice(0, 16);
}
