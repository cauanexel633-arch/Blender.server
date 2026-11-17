import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executarAgente } from "../src/agentes/agente.js";
import { escolherProvedor } from "../src/agentes/provedores.js";
import { ferramentasBase } from "../src/ferramentas/index.js";
import { definirLoja, obterLoja } from "../src/armazenamento/loja.js";

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

const limparEnv = () => {
  for (const k of ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "AGENT_PROVIDER", "OPENROUTER_MODEL", "AGENT_MODEL"]) {
    delete process.env[k];
  }
};

describe("seleção de provedor", () => {
  beforeEach(limparEnv);
  afterEach(limparEnv);

  it("prefere OpenRouter quando há chave, com modelo gratuito padrão", () => {
    process.env.OPENROUTER_API_KEY = "or";
    process.env.ANTHROPIC_API_KEY = "an";
    const p = escolherProvedor();
    expect(p.nome).toBe("openrouter");
    expect(p.modelo).toBe("openrouter/free");
  });

  it("usa Anthropic quando só ela está configurada", () => {
    process.env.ANTHROPIC_API_KEY = "an";
    expect(escolherProvedor().nome).toBe("anthropic");
  });

  it("AGENT_PROVIDER força o provedor e exige a chave correspondente", () => {
    process.env.OPENROUTER_API_KEY = "or";
    process.env.ANTHROPIC_API_KEY = "an";
    process.env.AGENT_PROVIDER = "anthropic";
    expect(escolherProvedor().nome).toBe("anthropic");
    process.env.AGENT_PROVIDER = "openrouter";
    delete process.env.OPENROUTER_API_KEY;
    expect(() => escolherProvedor()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("sem nenhuma chave, falha com mensagem clara", () => {
    expect(() => escolherProvedor()).toThrow(/OPENROUTER_API_KEY/);
  });
});

describe("agente com OpenRouter (API no formato OpenAI simulada)", () => {
  beforeEach(() => {
    limparEnv();
    definirLoja(undefined);
    process.env.OPENROUTER_API_KEY = "chave-falsa";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    limparEnv();
  });

  it("executa tool_calls, envia role=tool com o resultado e termina com a resposta final", async () => {
    const corpos: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
        expect((init.headers as Record<string, string>).authorization).toBe("Bearer chave-falsa");
        corpos.push(JSON.parse(String(init.body)));
        if (corpos.length === 1) {
          return json({
            model: "meta/modelo-gratuito",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [{ id: "call_1", type: "function", function: { name: "criar_cena", arguments: '{"nome":"Mock"}' } }],
                },
              },
            ],
          });
        }
        return json({ choices: [{ message: { role: "assistant", content: "Cena criada." } }] });
      }),
    );

    const r = await executarAgente({ instrucao: "crie uma cena", ferramentas: ferramentasBase, maxPassos: 5 });

    expect(r.resposta).toBe("Cena criada.");
    expect(r.provedor).toBe("openrouter");
    expect(r.ferramentas_usadas).toEqual(["criar_cena"]);
    expect(r.limite_atingido).toBe(false);

    const segunda = corpos[1];
    expect(segunda.tools.map((t: any) => t.function.name)).not.toContain("agente");
    const tool = segunda.messages.find((m: any) => m.role === "tool");
    expect(tool.tool_call_id).toBe("call_1");
    expect(tool.content).not.toMatch(/^Erro/);
    expect((await obterLoja().listar()).map((c) => c.nome)).toEqual(["Mock"]);
  });

  it("devolve erro ao modelo para ferramenta inexistente e argumentos inválidos", async () => {
    const corpos: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        corpos.push(JSON.parse(String(init.body)));
        if (corpos.length === 1) {
          return json({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    { id: "a", type: "function", function: { name: "nao_existe", arguments: "{}" } },
                    { id: "b", type: "function", function: { name: "criar_cena", arguments: "{}" } },
                  ],
                },
              },
            ],
          });
        }
        return json({ choices: [{ message: { content: "ok" } }] });
      }),
    );

    await executarAgente({ instrucao: "teste", ferramentas: ferramentasBase, maxPassos: 3 });
    const tools = corpos[1].messages.filter((m: any) => m.role === "tool");
    expect(tools[0].content).toMatch(/^Erro: Ferramenta desconhecida/);
    expect(tools[1].content).toMatch(/^Erro: /);
  });

  it("mostra o erro da API quando o modelo gratuito não suporta ferramentas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"No endpoints found that support tool use"}', { status: 404 })),
    );
    await expect(executarAgente({ instrucao: "x", ferramentas: ferramentasBase, maxPassos: 1 })).rejects.toThrow(
      /HTTP 404.*tool use/,
    );
  });

  it("respeita o limite de passos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          choices: [{ message: { content: null, tool_calls: [{ id: "x", type: "function", function: { name: "listar_cenas", arguments: "{}" } }] } }],
        }),
      ),
    );
    const r = await executarAgente({ instrucao: "loop", ferramentas: ferramentasBase, maxPassos: 2 });
    expect(r.limite_atingido).toBe(true);
    expect(r.passos).toBe(2);
  });
});

describe("agente com Anthropic (API simulada)", () => {
  beforeEach(() => {
    limparEnv();
    definirLoja(undefined);
    process.env.ANTHROPIC_API_KEY = "chave-falsa";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    limparEnv();
  });

  it("executa tool_use e devolve tool_result", async () => {
    const corpos: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        corpos.push(JSON.parse(String(init.body)));
        if (corpos.length === 1) {
          return json({
            stop_reason: "tool_use",
            content: [{ type: "tool_use", id: "t1", name: "criar_cena", input: { nome: "Anth" } }],
          });
        }
        return json({ stop_reason: "end_turn", content: [{ type: "text", text: "Pronto" }] });
      }),
    );

    const r = await executarAgente({ instrucao: "crie", ferramentas: ferramentasBase, maxPassos: 5 });
    expect(r.resposta).toBe("Pronto");
    expect(r.provedor).toBe("anthropic");
    const resultado = corpos[1].messages.at(-1).content[0];
    expect(resultado).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(resultado.is_error).toBeUndefined();
    expect((await obterLoja().listar()).map((c) => c.nome)).toEqual(["Anth"]);
  });
});
