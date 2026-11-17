import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verificarAutorizacao } from "../src/auth.js";
import { urlBase } from "../src/oauth.js";
import { criarServidorMcp } from "../src/servidor.js";

/**
 * Endpoint MCP (Streamable HTTP, modo stateless). Exposto em /mcp via vercel.json.
 * Cada requisição cria um servidor novo: a cena fica no Supabase, não na memória da função.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = verificarAutorizacao(req.headers.authorization);
  if (!auth.ok) {
    const metadados = `${urlBase(req.headers.host)}/.well-known/oauth-protected-resource`;
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${metadados}"`);
    res.status(auth.status).json({ erro: auth.erro });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ erro: "Use POST neste endpoint MCP (modo stateless)" });
    return;
  }

  const servidor = criarServidorMcp();
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transporte.close();
    void servidor.close();
  });

  await servidor.connect(transporte);
  await transporte.handleRequest(req, res, req.body);
}
