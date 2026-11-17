import type { VercelRequest, VercelResponse } from "@vercel/node";
import { obterLoja } from "../src/armazenamento/loja.js";
import { VERSAO } from "../src/servidor.js";
import { escolherProvedor } from "../src/agentes/provedores.js";

function provedorAgente(): { provedor: string; modelo: string } | null {
  try {
    const p = escolherProvedor();
    return { provedor: p.nome, modelo: p.modelo };
  } catch {
    return null;
  }
}

/** Diagnóstico público, sem expor segredos: só diz quais recursos estão configurados. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: "ok",
    versao: VERSAO,
    autenticacao_configurada: Boolean(process.env.MCP_TOKEN),
    persistencia: obterLoja().persistente,
    busca_web: Boolean(process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY),
    agente: provedorAgente(),
  });
}
