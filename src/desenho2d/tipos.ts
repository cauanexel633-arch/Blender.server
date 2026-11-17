import { z } from "zod";
import { Cor, Ponto2 } from "../geometria/tipos.js";

/** Cor hexadecimal ou "nenhum" (sem preenchimento/contorno). */
export const CorOuNenhum = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$|^nenhum$/, "Use #rrggbb ou nenhum");

export const TIPOS_FORMA = ["retangulo", "elipse", "linha", "poligono", "texto", "imagem", "pixelart"] as const;
export type TipoElemento = (typeof TIPOS_FORMA)[number];

/**
 * Elemento de desenho. Um único formato com campos opcionais (em vez de união discriminada),
 * porque clientes de function calling aceitam melhor um schema plano.
 * As regras por tipo (ex.: retângulo precisa de largura e altura) são checadas ao adicionar.
 */
export const Elemento = z.object({
  id: z.string(),
  nome: z.string().optional(),
  tipo: z.enum(TIPOS_FORMA),
  x: z.number().default(0),
  y: z.number().default(0),
  largura: z.number().positive().optional(),
  altura: z.number().positive().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  pontos: z.array(Ponto2).optional(),
  texto: z.string().max(2000).optional(),
  tamanho_fonte: z.number().positive().optional(),
  alinhamento: z.enum(["esquerda", "centro", "direita"]).optional(),
  preenchimento: CorOuNenhum.optional(),
  contorno: CorOuNenhum.optional(),
  espessura: z.number().min(0).optional(),
  raio_canto: z.number().min(0).optional(),
  opacidade: z.number().min(0).max(1).optional(),
  rotacao: z.number().optional(),
  url: z.string().optional(),
  grade: z.array(z.string()).optional(),
  paleta: z.array(z.object({ simbolo: z.string().length(1), cor: Cor })).optional(),
  tamanho_pixel: z.number().int().positive().optional(),
  visivel: z.boolean().default(true),
});
export type Elemento = z.infer<typeof Elemento>;

export const Desenho = z.object({
  id: z.string(),
  nome: z.string(),
  largura: z.number().int().positive().max(4000),
  altura: z.number().int().positive().max(4000),
  /** Cor de fundo, ou null para fundo transparente. */
  fundo: Cor.nullable(),
  elementos: z.array(Elemento),
  criada_em: z.string(),
  atualizada_em: z.string(),
});
export type Desenho = z.infer<typeof Desenho>;
