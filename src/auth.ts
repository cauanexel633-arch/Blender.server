import { createHash, timingSafeEqual } from "node:crypto";
import { verificar } from "./oauth.js";

export type ResultadoAuth =
  | { ok: true }
  | { ok: false; status: 401 | 500; erro: string };

const digest = (valor: string) => createHash("sha256").update(valor).digest();

/**
 * Aceita duas formas de credencial:
 *  - `Authorization: Bearer <MCP_TOKEN>` (clientes que enviam cabeçalho, como Claude Desktop ou Cursor);
 *  - token de acesso OAuth emitido por /oauth/token (ChatGPT, Claude.ai e outros).
 * Falha fechada: sem MCP_TOKEN configurado, nada é liberado.
 */
export function verificarAutorizacao(cabecalho: string | undefined, tokenEsperado = process.env.MCP_TOKEN): ResultadoAuth {
  if (!tokenEsperado) {
    return { ok: false, status: 500, erro: "MCP_TOKEN não configurado no servidor" };
  }
  const partes = cabecalho?.split(" ");
  const recebido = partes?.length === 2 && partes[0].toLowerCase() === "bearer" ? partes[1] : "";
  if (!recebido) return { ok: false, status: 401, erro: "Token ausente" };

  if (timingSafeEqual(digest(recebido), digest(tokenEsperado))) return { ok: true };

  try {
    if (verificar(recebido, "acesso")) return { ok: true };
  } catch {
    // MCP_TOKEN ausente para verificar assinatura: já tratado acima
  }
  return { ok: false, status: 401, erro: "Token ausente ou inválido" };
}
