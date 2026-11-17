import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import mcpHandler from "../api/mcp.js";
import metadataHandler from "../api/oauth/metadata.js";
import registerHandler from "../api/oauth/register.js";
import authorizeHandler from "../api/oauth/authorize.js";
import tokenHandler from "../api/oauth/token.js";
import { assinar, verificar, verificarPkce } from "../src/oauth.js";

const SENHA = "senha-do-servidor-de-teste";
let servidor: Server;
let base: string;

// Roteador que imita o runtime da Vercel: aplica os mesmos rewrites do vercel.json,
// com body e query já parseados e send/redirect/status/json disponíveis.
const rotas: Record<string, (req: any, res: any) => unknown> = {
  "/api/mcp": mcpHandler as never,
  "/mcp": mcpHandler as never,
  "/api/oauth/metadata": metadataHandler as never,
  "/api/oauth/register": registerHandler as never,
  "/api/oauth/authorize": authorizeHandler as never,
  "/api/oauth/token": tokenHandler as never,
  "/oauth/register": registerHandler as never,
  "/oauth/authorize": authorizeHandler as never,
  "/oauth/token": tokenHandler as never,
};

beforeAll(async () => {
  process.env.MCP_TOKEN = SENHA;
  servidor = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const bruto = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", "http://x");
    const tipo = String(req.headers["content-type"] ?? "");
    let corpo: unknown = undefined;
    if (bruto) corpo = tipo.includes("json") ? JSON.parse(bruto) : Object.fromEntries(new URLSearchParams(bruto));

    const r = res as unknown as Record<string, unknown>;
    r.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    r.json = (obj: unknown) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };
    r.send = (txt: string) => {
      res.end(txt);
      return res;
    };
    r.redirect = (code: number, destino: string) => {
      res.statusCode = code;
      res.setHeader("location", destino);
      res.end();
      return res;
    };

    const reqV = Object.assign(req, { body: corpo, query: Object.fromEntries(url.searchParams) });
    const handler = rotas[url.pathname];
    if (!handler) {
      res.statusCode = 404;
      res.end();
      return;
    }
    await handler(reqV, res);
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  process.env.PUBLIC_URL = base;
});

afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

const pkce = () => {
  const verificador = randomBytes(32).toString("base64url");
  const desafio = createHash("sha256").update(verificador).digest("base64url");
  return { verificador, desafio };
};

async function registrar(): Promise<string> {
  const r = await fetch(`${base}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "ChatGPT teste", redirect_uris: ["https://chatgpt.com/connector/oauth/callback"] }),
  });
  expect(r.status).toBe(201);
  return ((await r.json()) as { client_id: string }).client_id;
}

async function autorizar(clientId: string, desafio: string, senha: string) {
  const form = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "https://chatgpt.com/connector/oauth/callback",
    code_challenge: desafio,
    code_challenge_method: "S256",
    state: "estado-123",
    senha,
  });
  return fetch(`${base}/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
}

describe("descoberta OAuth", () => {
  it("publica metadados do recurso e do servidor de autorização", async () => {
    const recurso = (await (await fetch(`${base}/api/oauth/metadata?tipo=recurso`)).json()) as any;
    expect(recurso.resource).toBe(`${base}/mcp`);
    expect(recurso.authorization_servers).toEqual([base]);

    const servidorMeta = (await (await fetch(`${base}/api/oauth/metadata?tipo=servidor`)).json()) as any;
    expect(servidorMeta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(servidorMeta.token_endpoint).toBe(`${base}/oauth/token`);
    expect(servidorMeta.registration_endpoint).toBe(`${base}/oauth/register`);
  });

  it("MCP sem credencial responde 401 apontando para os metadados", async () => {
    const r = await fetch(`${base}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(`${base}/.well-known/oauth-protected-resource`);
  });

  it("recusa registro com redirect_uri insegura", async () => {
    const r = await fetch(`${base}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://site-qualquer.com/callback"] }),
    });
    expect(r.status).toBe(400);
  });
});

describe("fluxo authorization code + PKCE", () => {
  it("troca código por token, usa no /mcp e renova com refresh_token", async () => {
    const clientId = await registrar();
    const { verificador, desafio } = pkce();

    const login = await autorizar(clientId, desafio, SENHA);
    expect(login.status).toBe(302);
    const destino = new URL(login.headers.get("location")!);
    expect(destino.origin + destino.pathname).toBe("https://chatgpt.com/connector/oauth/callback");
    expect(destino.searchParams.get("state")).toBe("estado-123");
    const codigo = destino.searchParams.get("code")!;

    const troca = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: codigo,
        client_id: clientId,
        redirect_uri: "https://chatgpt.com/connector/oauth/callback",
        code_verifier: verificador,
      }),
    });
    expect(troca.status).toBe(200);
    const tokens = (await troca.json()) as { access_token: string; refresh_token: string; token_type: string };
    expect(tokens.token_type).toBe("Bearer");

    const transporte = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    });
    const cliente = new Client({ name: "oauth-teste", version: "0.0.0" });
    await cliente.connect(transporte);
    const ferramentas = await cliente.listTools();
    expect(ferramentas.tools.map((t) => t.name)).toContain("criar_cena");
    await cliente.close();

    const renova = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId }),
    });
    expect(renova.status).toBe(200);
    expect(((await renova.json()) as { access_token: string }).access_token).toBeTruthy();
  });

  it("senha errada não emite código", async () => {
    const clientId = await registrar();
    const { desafio } = pkce();
    const r = await autorizar(clientId, desafio, "senha-errada");
    expect(r.status).toBe(401);
    expect(r.headers.get("location")).toBeNull();
  });

  it("code_verifier errado é recusado", async () => {
    const clientId = await registrar();
    const { desafio } = pkce();
    const login = await autorizar(clientId, desafio, SENHA);
    const codigo = new URL(login.headers.get("location")!).searchParams.get("code")!;
    const troca = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: codigo,
        client_id: clientId,
        redirect_uri: "https://chatgpt.com/connector/oauth/callback",
        code_verifier: "verificador-errado",
      }),
    });
    expect(troca.status).toBe(400);
    expect(((await troca.json()) as { error: string }).error).toBe("invalid_grant");
  });

  it("autorização sem PKCE S256 é recusada", async () => {
    const clientId = await registrar();
    const r = await fetch(
      `${base}/oauth/authorize?` +
        new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: "https://chatgpt.com/connector/oauth/callback",
        }),
    );
    expect(r.status).toBe(400);
  });
});

describe("primitivas OAuth", () => {
  it("token assinado com outro segredo é rejeitado", () => {
    const token = assinar({ tipo: "acesso" }, 60);
    expect(verificar(token, "acesso")).not.toBeNull();
    process.env.MCP_TOKEN = "outro-segredo";
    expect(verificar(token, "acesso")).toBeNull();
    process.env.MCP_TOKEN = SENHA;
  });

  it("token expirado é rejeitado", () => {
    const token = assinar({ tipo: "acesso" }, -5);
    expect(verificar(token, "acesso")).toBeNull();
  });

  it("PKCE confere o par verificador/desafio", () => {
    const { verificador, desafio } = pkce();
    expect(verificarPkce(verificador, desafio)).toBe(true);
    expect(verificarPkce("outro", desafio)).toBe(false);
  });
});
