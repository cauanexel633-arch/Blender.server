import { z } from "zod";

/** Conteúdo de resultado compatível com MCP (texto, imagem ou arquivo em base64). */
export type Conteudo =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } };

export interface Ferramenta {
  nome: string;
  titulo: string;
  descricao: string;
  schema: z.ZodRawShape;
  destrutiva?: boolean;
  somenteLeitura?: boolean;
  /** Recebe argumentos brutos; a validação com zod acontece aqui dentro. */
  executar: (argumentosBrutos: unknown) => Promise<Conteudo[]>;
}

interface Definicao<S extends z.ZodRawShape> {
  nome: string;
  titulo: string;
  descricao: string;
  schema: S;
  destrutiva?: boolean;
  somenteLeitura?: boolean;
  executar: (args: z.infer<z.ZodObject<S>>) => Promise<Conteudo[]>;
}

/** Declara uma ferramenta com validação de entrada tipada. */
export function definir<S extends z.ZodRawShape>(def: Definicao<S>): Ferramenta {
  const objeto = z.object(def.schema);
  return {
    nome: def.nome,
    titulo: def.titulo,
    descricao: def.descricao,
    schema: def.schema,
    destrutiva: def.destrutiva,
    somenteLeitura: def.somenteLeitura,
    executar: (bruto) => def.executar(objeto.parse(bruto)),
  };
}

export const texto = (valor: unknown): Conteudo[] => [
  { type: "text", text: typeof valor === "string" ? valor : JSON.stringify(valor, null, 2) },
];
