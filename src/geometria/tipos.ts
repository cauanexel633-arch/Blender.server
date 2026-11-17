import { z } from "zod";

export const Vetor3 = z.tuple([z.number(), z.number(), z.number()]);
export const Cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use cor hexadecimal no formato #rrggbb");

export const Transformacao = z.object({
  posicao: Vetor3.default([0, 0, 0]),
  rotacao_graus: Vetor3.default([0, 0, 0]),
  escala: Vetor3.default([1, 1, 1]),
});

export const Primitiva = z.discriminatedUnion("forma", [
  z.object({ forma: z.literal("cubo"), tamanho: z.number().positive().default(1) }),
  z.object({
    forma: z.literal("esfera"),
    raio: z.number().positive().default(0.5),
    segmentos: z.number().int().min(3).max(256).default(32),
  }),
  z.object({
    forma: z.literal("cilindro"),
    raio_topo: z.number().min(0).default(0.5),
    raio_base: z.number().min(0).default(0.5),
    altura: z.number().positive().default(1),
    segmentos: z.number().int().min(3).max(256).default(32),
  }),
  z.object({
    forma: z.literal("cone"),
    raio: z.number().positive().default(0.5),
    altura: z.number().positive().default(1),
    segmentos: z.number().int().min(3).max(256).default(32),
  }),
  z.object({
    forma: z.literal("toro"),
    raio: z.number().positive().default(0.5),
    tubo: z.number().positive().default(0.15),
    segmentos: z.number().int().min(3).max(256).default(48),
  }),
  z.object({
    forma: z.literal("capsula"),
    raio: z.number().positive().default(0.3),
    altura: z.number().positive().default(1),
    segmentos: z.number().int().min(3).max(64).default(16),
  }),
  z.object({
    forma: z.literal("plano"),
    largura: z.number().positive().default(1),
    profundidade: z.number().positive().default(1),
  }),
]);

export const Origem = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("primitiva"), primitiva: Primitiva }),
  z.object({
    tipo: z.literal("extrusao"),
    contorno: z.array(z.tuple([z.number(), z.number()])).min(3),
    profundidade: z.number().positive(),
  }),
  z.object({
    tipo: z.literal("revolucao"),
    perfil: z.array(z.tuple([z.number().min(0), z.number()])).min(2),
    segmentos: z.number().int().min(3).max(256).default(32),
  }),
  z.object({
    tipo: z.literal("booleana"),
    operacao: z.enum(["uniao", "subtracao", "interseccao"]),
    a: z.string(),
    b: z.string(),
  }),
]);

export const Textura = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("procedural"),
    padrao: z.enum(["xadrez", "listras", "bolinhas", "gradiente", "ruido"]),
    cor_secundaria: Cor.default("#ffffff"),
    escala: z.number().positive().max(50).default(4),
  }),
  z.object({
    tipo: z.literal("url"),
    url: z.url(),
    escala: z.number().positive().max(50).default(1),
  }),
]);

export const Material = z.object({
  cor: Cor.default("#cccccc"),
  metalico: z.number().min(0).max(1).default(0),
  rugosidade: z.number().min(0).max(1).default(0.5),
  opacidade: z.number().min(0).max(1).default(1),
  emissiva: Cor.optional(),
  textura: Textura.optional(),
});

export const ObjetoCena = z.object({
  id: z.string(),
  nome: z.string().min(1).max(80),
  origem: Origem,
  transformacao: Transformacao,
  material: Material,
  visivel: z.boolean().default(true),
});

export const Cena = z.object({
  id: z.string(),
  nome: z.string(),
  objetos: z.array(ObjetoCena),
  criada_em: z.string(),
  atualizada_em: z.string(),
});

export type Transformacao = z.output<typeof Transformacao>;
export type Primitiva = z.output<typeof Primitiva>;
export type Origem = z.output<typeof Origem>;
export type Material = z.output<typeof Material>;
export type ObjetoCena = z.output<typeof ObjetoCena>;
export type Cena = z.output<typeof Cena>;
