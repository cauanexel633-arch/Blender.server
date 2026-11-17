import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assinar, SEG } from "../../src/oauth.js";

/** Registro dinâmico de cliente (RFC 7591). O client_id é um payload assinado com os redirect_uris. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ erro: "method_not_allowed" });
    return;
  }
  const corpo = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const uris: unknown = corpo.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === "string")) {
    res.status(400).json({ erro: "invalid_redirect_uri", descricao: "redirect_uris é obrigatório" });
    return;
  }
  for (const u of uris as string[]) {
    const ok = /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u);
    if (!ok) {
      res.status(400).json({ erro: "invalid_redirect_uri", descricao: `URI não permitida: ${u}` });
      return;
    }
  }
  const nome = typeof corpo.client_name === "string" ? corpo.client_name.slice(0, 100) : "cliente-mcp";
  const clientId = assinar({ tipo: "cliente", redirect_uris: uris, nome }, SEG.cliente);
  res.status(201).json({
    client_id: clientId,
    client_name: nome,
    redirect_uris: uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}
