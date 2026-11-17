import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import mcpHandler from "../api/mcp.js";
import healthHandler from "../api/health.js";

// Simula o runtime da Vercel: entrega req.body já parseado e métodos status()/json() na resposta.
let servidor: Server;
let base: URL;
const TOKEN = "token-de-teste-longo-123";

beforeAll(async () => {
  process.env.MCP_TOKEN = TOKEN;
  servidor = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const bruto = Buffer.concat(chunks).toString("utf8");
    const corpo = bruto ? JSON.parse(bruto) : undefined;
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
    const reqVercel = Object.assign(req, { body: corpo });
    if (req.url?.startsWith("/api/health")) return healthHandler(reqVercel as never, res as never);
    return mcpHandler(reqVercel as never, res as never);
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = new URL(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/mcp`);
});

afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

function clienteCom(token?: string) {
  const cabecalhos: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const transporte = new StreamableHTTPClientTransport(base, { requestInit: { headers: cabecalhos } });
  const cliente = new Client({ name: "teste", version: "0.0.0" });
  return { cliente, transporte };
}

describe("endpoint MCP real (HTTP + SDK cliente)", () => {
  it("rejeita chamadas sem token com 401", async () => {
    const r = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(r.status).toBe(401);
  });

  it("lista ferramentas e prompts (comandos /prompt) e executa um fluxo", async () => {
    const { cliente, transporte } = clienteCom(TOKEN);
    await cliente.connect(transporte);

    const ferramentas = await cliente.listTools();
    const nomes = ferramentas.tools.map((t) => t.name);
    expect(nomes).toEqual(
      expect.arrayContaining(["criar_cena", "criar_primitiva", "renderizar_cena", "exportar_modelo", "agente", "pesquisar_web"]),
    );
    const marcada = ferramentas.tools.find((t) => t.name === "apagar_cena");
    expect(marcada?.annotations?.destructiveHint).toBe(true);

    const prompts = await cliente.listPrompts();
    expect(prompts.prompts.map((p) => p.name)).toEqual(
      expect.arrayContaining(["guia", "modelar", "texturizar", "pesquisar", "revisar_impressao"]),
    );
    const guia = await cliente.getPrompt({ name: "guia" });
    expect(JSON.stringify(guia.messages)).toMatch(/renderizar_cena/);

    const criada = await cliente.callTool({ name: "criar_cena", arguments: { nome: "Teste MCP" } });
    const { cena_id } = JSON.parse((criada.content as { text: string }[])[0].text);
    expect(cena_id).toMatch(/^cena_/);

    const prim = await cliente.callTool({
      name: "criar_primitiva",
      arguments: { cena_id, forma: "esfera", raio: 1, cor: "#00aa55" },
    });
    expect(prim.isError).toBeFalsy();

    const invalido = await cliente.callTool({ name: "criar_primitiva", arguments: { cena_id, forma: "cubo", cor: "verde" } });
    expect(invalido.isError).toBe(true);

    const apagar = await cliente.callTool({ name: "apagar_cena", arguments: { cena_id, confirmar: false } });
    expect(apagar.isError).toBe(true);

    await cliente.close();
  });

  it("saúde pública informa configuração sem expor segredos", async () => {
    const r = await fetch(new URL("/api/health", base));
    const corpo = (await r.json()) as Record<string, unknown>;
    expect(corpo.status).toBe("ok");
    expect(corpo.autenticacao_configurada).toBe(true);
    expect(JSON.stringify(corpo)).not.toContain(TOKEN);
  });
});
