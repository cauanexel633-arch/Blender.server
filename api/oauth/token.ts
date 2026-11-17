import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assinar, lerCorpo, SEG, verificar, verificarPkce } from "../../src/oauth.js";

function erro(res: VercelResponse, codigo: string, descricao: string) {
  res.status(400).setHeader("cache-control", "no-store").json({ error: codigo, error_description: descricao });
}

/** Troca de código por token (com PKCE) e renovação por refresh_token. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const p = lerCorpo(req.body);
  res.setHeader("cache-control", "no-store");

  if (p.grant_type === "authorization_code") {
    const codigo = verificar<{ client_id: string; redirect_uri: string; code_challenge: string }>(p.code ?? "", "codigo");
    if (!codigo) return erro(res, "invalid_grant", "código inválido ou expirado");
    if (codigo.client_id !== p.client_id || codigo.redirect_uri !== p.redirect_uri) {
      return erro(res, "invalid_grant", "client_id ou redirect_uri não conferem");
    }
    if (!p.code_verifier || !verificarPkce(p.code_verifier, codigo.code_challenge)) {
      return erro(res, "invalid_grant", "code_verifier inválido");
    }
    return res.status(200).json(emitir(p.client_id));
  }

  if (p.grant_type === "refresh_token") {
    const refresh = verificar<{ client_id: string }>(p.refresh_token ?? "", "refresh");
    if (!refresh || (p.client_id && refresh.client_id !== p.client_id)) {
      return erro(res, "invalid_grant", "refresh_token inválido ou expirado");
    }
    return res.status(200).json(emitir(refresh.client_id));
  }

  return erro(res, "unsupported_grant_type", "use authorization_code ou refresh_token");
}

function emitir(clientId: string) {
  return {
    access_token: assinar({ tipo: "acesso", client_id: clientId }, SEG.acesso),
    token_type: "Bearer",
    expires_in: SEG.acesso,
    refresh_token: assinar({ tipo: "refresh", client_id: clientId }, SEG.refresh),
  };
}
