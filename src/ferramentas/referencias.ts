import { randomUUID } from "node:crypto";
import { z } from "zod";
import { obterLoja } from "../armazenamento/loja.js";
import { obterLojaDesenhos } from "../desenho2d/loja.js";
import { obterLojaInterfaces } from "../interface/loja.js";
import { obterLojaReferencias, Referencia, TIPOS_REFERENCIA, type TipoReferencia } from "../referencias/loja.js";
import { definir, texto } from "./tipos.js";

/** Cada tipo de referência aceita só a origem correspondente. */
const ORIGEM_POR_TIPO: Record<TipoReferencia, "cena" | "desenho" | "interface"> = {
  "3d": "cena",
  "2d": "desenho",
  pixelart: "desenho",
  interface: "interface",
};

const resumo = (r: Referencia) => ({
  id: r.id,
  tipo: r.tipo,
  nome: r.nome,
  descricao: r.descricao,
  medidas: r.medidas ?? null,
  paleta: r.paleta ?? [],
  fonte: r.fonte ?? null,
  atualizada_em: r.atualizada_em,
});

async function carregarOrigem(origem: { tipo: "cena" | "desenho" | "interface"; id: string }): Promise<Record<string, any>> {
  if (origem.tipo === "cena") {
    const cena = await obterLoja().obter(origem.id);
    if (!cena) throw new Error(`Cena "${origem.id}" não existe`);
    return structuredClone(cena) as unknown as Record<string, any>;
  }
  if (origem.tipo === "desenho") {
    const d = await obterLojaDesenhos().obter(origem.id);
    if (!d) throw new Error(`Desenho "${origem.id}" não existe`);
    return structuredClone(d) as unknown as Record<string, any>;
  }
  const ui = await obterLojaInterfaces().obter(origem.id);
  if (!ui) throw new Error(`Interface "${origem.id}" não existe`);
  return structuredClone(ui) as unknown as Record<string, any>;
}

export const ferramentasReferencias = [
  definir({
    nome: "salvar_referencia",
    titulo: "Salvar referência",
    descricao:
      "Guarda um trabalho pronto como referência da biblioteca, para reusar em outras conversas. Tipos: 3d (origem cena), 2d e pixelart (origem desenho), interface (origem interface). Salve só trabalhos revisados e aprovados (revisar_trabalho). Guarde um nome, uma descrição, as medidas reais e a paleta.",
    schema: {
      tipo: z.enum(TIPOS_REFERENCIA),
      origem: z.object({
        tipo: z.enum(["cena", "desenho", "interface"]),
        id: z.string().min(1),
      }),
      nome: z.string().min(1).max(120),
      descricao: z.string().max(2000).default(""),
      medidas: z.string().max(500).optional().describe("Ex.: 'altura 90 cm, assento 45 cm'"),
      paleta: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(12).optional(),
      fonte: z.string().max(500).optional().describe("Link de onde veio a referência"),
    },
    executar: async (a) => {
      if (ORIGEM_POR_TIPO[a.tipo] !== a.origem.tipo) {
        throw new Error(`Tipo "${a.tipo}" precisa de origem "${ORIGEM_POR_TIPO[a.tipo]}", não "${a.origem.tipo}"`);
      }
      const dados = await carregarOrigem(a.origem);
      const agora = new Date().toISOString();
      const referencia: Referencia = {
        id: `ref_${randomUUID().slice(0, 12)}`,
        tipo: a.tipo,
        nome: a.nome,
        descricao: a.descricao,
        medidas: a.medidas,
        paleta: a.paleta,
        fonte: a.fonte,
        dados,
        criada_em: agora,
        atualizada_em: agora,
      };
      await obterLojaReferencias().salvar(referencia);
      return texto(resumo(referencia));
    },
  }),

  definir({
    nome: "listar_referencias",
    titulo: "Listar referências",
    descricao: "Lista as referências da biblioteca. Filtre por tipo (3d, 2d, pixelart, interface) ou por um texto no nome e na descrição.",
    somenteLeitura: true,
    schema: {
      tipo: z.enum(TIPOS_REFERENCIA).optional(),
      busca: z.string().max(100).optional(),
    },
    executar: async ({ tipo, busca }) => {
      const termo = busca?.toLowerCase();
      const itens = (await obterLojaReferencias().listar()).filter(
        (r) =>
          (!tipo || r.tipo === tipo) &&
          (!termo || `${r.nome} ${r.descricao}`.toLowerCase().includes(termo)),
      );
      return texto(itens.map(resumo));
    },
  }),

  definir({
    nome: "obter_referencia",
    titulo: "Obter referência",
    descricao: "Mostra uma referência com a descrição, as medidas, a paleta e a origem. Use antes de aplicar.",
    somenteLeitura: true,
    schema: { id: z.string().min(1) },
    executar: async ({ id }) => {
      const r = await obterLojaReferencias().obter(id);
      if (!r) throw new Error(`Referência "${id}" não existe`);
      return texto({ ...resumo(r), origem_id: r.dados.id ?? null });
    },
  }),

  definir({
    nome: "aplicar_referencia",
    titulo: "Aplicar referência",
    descricao:
      "Cria um trabalho novo a partir de uma referência, com id próprio, para você ajustar e depois revisar (revisar_trabalho). A referência original não muda.",
    schema: {
      id: z.string().min(1),
      nome: z.string().min(1).max(120).describe("Nome do novo trabalho"),
    },
    executar: async ({ id, nome }) => {
      const r = await obterLojaReferencias().obter(id);
      if (!r) throw new Error(`Referência "${id}" não existe`);
      const copia = structuredClone(r.dados) as Record<string, any>;
      const novoId = `${r.tipo}_${randomUUID().slice(0, 12)}`;
      const agora = new Date().toISOString();
      copia.id = novoId;
      copia.nome = nome;
      copia.atualizada_em = agora;
      if (r.tipo === "3d") {
        copia.criada_em = agora;
        await obterLoja().salvar(copia as any);
      } else if (r.tipo === "interface") {
        copia.preview_hash = null;
        copia.criada_em = agora;
        await obterLojaInterfaces().salvar(copia as any);
      } else {
        await obterLojaDesenhos().salvar(copia as any);
      }
      return texto({ novo_id: novoId, tipo: r.tipo, nome, referencia_id: id });
    },
  }),

  definir({
    nome: "apagar_referencia",
    titulo: "Apagar referência",
    descricao: "Remove uma referência da biblioteca. Não apaga os trabalhos criados a partir dela. Exige confirmar=true e só quando o usuário pedir.",
    destrutiva: true,
    schema: {
      id: z.string().min(1),
      confirmar: z
        .boolean()
        .refine((v) => v === true, { message: "Use true para confirmar" })
        .describe("Deve ser exatamente true para confirmar a remoção"),
    },
    executar: async ({ id }) => {
      const apagada = await obterLojaReferencias().apagar(id);
      if (!apagada) throw new Error(`Referência "${id}" não existe`);
      return texto({ apagada: id });
    },
  }),
];
