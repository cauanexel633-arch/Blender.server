import type { VercelRequest, VercelResponse } from "@vercel/node";
import { obterLoja } from "../src/armazenamento/loja.js";
import { VERSAO } from "../src/servidor.js";

/** Diagnóstico público, sem expor segredos: só diz quais recursos estão configurados. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: "ok",
    versao: VERSAO,
    autenticacao_configurada: Boolean(process.env.MCP_TOKEN),
    persistencia: obterLoja().persistente,
    busca_web: Boolean(process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY),
    agente: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
