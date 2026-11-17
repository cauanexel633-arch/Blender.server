import type { VercelRequest, VercelResponse } from "@vercel/node";
import { urlBase } from "../../src/oauth.js";

/**
 * Metadados OAuth. Rota /.well-known/oauth-protected-resource (tipo=recurso)
 * e /.well-known/oauth-authorization-server (tipo=servidor).
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const base = urlBase(req.headers.host);
  const tipo = String(req.query.tipo ?? "");
  if (tipo === "recurso") {
    res.status(200).json({
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
      resource_name: "bender-3d-mcp",
    });
    return;
  }
  res.status(200).json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
