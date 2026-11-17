import { randomUUID } from "node:crypto";
import { z } from "zod";
import { obterLoja } from "../armazenamento/loja.js";
import { Cor, Vetor3, type Cena, type ObjetoCena } from "../geometria/tipos.js";

export const campoCenaId = z.string().min(1).describe("ID da cena (retornado por criar_cena)");
export const campoObjetoId = z.string().min(1).describe("ID do objeto dentro da cena");
export const campoCor = Cor.optional().describe("Cor hexadecimal #rrggbb");
export const campoPosicionamento = {
  posicao: Vetor3.optional().describe("Posição [x, y, z]. Eixo Y aponta para cima."),
  rotacao_graus: Vetor3.optional().describe("Rotação em graus [x, y, z], ordem XYZ"),
  escala: Vetor3.optional().describe("Escala [x, y, z]"),
};

export const novoId = (prefixo: string) => `${prefixo}_${randomUUID().slice(0, 8)}`;
const agora = () => new Date().toISOString();

export async function carregarCena(id: string): Promise<Cena> {
  const cena = await obterLoja().obter(id);
  if (!cena) throw new Error(`Cena "${id}" não encontrada. Use listar_cenas para ver as disponíveis.`);
  return cena;
}

export async function salvarCena(cena: Cena): Promise<void> {
  cena.atualizada_em = agora();
  await obterLoja().salvar(cena);
}

export function novaCena(nome: string): Cena {
  const momento = agora();
  return { id: novoId("cena"), nome, objetos: [], criada_em: momento, atualizada_em: momento };
}

export function acharObjeto(cena: Cena, id: string): ObjetoCena {
  const objeto = cena.objetos.find((o) => o.id === id);
  if (!objeto) throw new Error(`Objeto "${id}" não existe na cena "${cena.id}"`);
  return objeto;
}

export function nomeLivre(cena: Cena, base: string): string {
  const usados = new Set(cena.objetos.map((o) => o.nome));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function resumoObjeto(o: ObjetoCena) {
  return {
    id: o.id,
    nome: o.nome,
    tipo: o.origem.tipo,
    visivel: o.visivel,
    posicao: o.transformacao.posicao,
    rotacao_graus: o.transformacao.rotacao_graus,
    escala: o.transformacao.escala,
    material: { cor: o.material.cor, textura: o.material.textura?.tipo ?? null },
  };
}
