import { createHash, timingSafeEqual } from "node:crypto";

export type ResultadoAuth =
  | { ok: true }
  | { ok: false; status: 401 | 500; erro: string };

const digest = (valor: string) => createHash("sha256").update(valor).digest();

/**
 * Exige `Authorization: Bearer <MCP_TOKEN>`. Falha fechada: sem MCP_TOKEN configurado, nada é liberado.
 */
export function verificarAutorizacao(cabecalho: string | undefined, tokenEsperado = process.env.MCP_TOKEN): ResultadoAuth {
  if (!tokenEsperado) {
    return { ok: false, status: 500, erro: "MCP_TOKEN não configurado no servidor" };
  }
  const partes = cabecalho?.split(" ");
  const recebido = partes?.length === 2 && partes[0].toLowerCase() === "bearer" ? partes[1] : "";
  if (!recebido || !timingSafeEqual(digest(recebido), digest(tokenEsperado))) {
    return { ok: false, status: 401, erro: "Token ausente ou inválido" };
  }
  return { ok: true };
}
