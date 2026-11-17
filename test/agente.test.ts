import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executarAgente } from "../src/agentes/agente.js";
import { ferramentasBase } from "../src/ferramentas/index.js";
import { definirLoja, obterLoja } from "../src/armazenamento/loja.js";

const resposta = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

describe("agente interno (loop de ferramentas com a API da Anthropic simulada)", () => {
  beforeEach(() => {
    definirLoja(undefined);
    process.env.ANTHROPIC_API_KEY = "chave-falsa";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("executa tool_use, devolve tool_result e termina com a resposta final", async () => {
    const chamadas: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const corpo = JSON.parse(String(init.body));
        chamadas.push(corpo);
        if (chamadas.length === 1) {
          return resposta({
            stop_reason: "tool_use",
            content: [{ type: "tool_use", id: "t1", name: "criar_cena", input: { nome: "Mock" } }],
          });
        }
        return resposta({ stop_reason: "end_turn", content: [{ type: "text", text: "Cena criada." }] });
      }),
    );

    const r = await executarAgente({
      instrucao: "crie uma cena",
      ferramentas: ferramentasBase,
      maxPassos: 5,
    });

    expect(r.resposta).toBe("Cena criada.");
    expect(r.ferramentas_usadas).toEqual(["criar_cena"]);
    expect(r.limite_atingido).toBe(false);

    const segundaChamada = chamadas[1];
    const resultado = segundaChamada.messages.at(-1).content[0];
    expect(resultado.type).toBe("tool_result");
    expect(resultado.tool_use_id).toBe("t1");
    expect(resultado.is_error).toBeUndefined();
    expect(segundaChamada.tools.map((t: { name: string }) => t.name)).not.toContain("agente");

    const cenas = await obterLoja().listar();
    expect(cenas.map((c) => c.nome)).toEqual(["Mock"]);
  });

  it("devolve erro ao modelo quando ele chama ferramenta inexistente ou com argumentos inválidos", async () => {
    const chamadas: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        chamadas.push(JSON.parse(String(init.body)));
        if (chamadas.length === 1) {
          return resposta({
            stop_reason: "tool_use",
            content: [
              { type: "tool_use", id: "a", name: "nao_existe", input: {} },
              { type: "tool_use", id: "b", name: "criar_cena", input: {} },
            ],
          });
        }
        return resposta({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
      }),
    );

    await executarAgente({ instrucao: "teste", ferramentas: ferramentasBase, maxPassos: 3 });
    const resultados = chamadas[1].messages.at(-1).content;
    expect(resultados[0]).toMatchObject({ tool_use_id: "a", is_error: true });
    expect(resultados[1]).toMatchObject({ tool_use_id: "b", is_error: true });
  });

  it("respeita o limite de passos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        resposta({
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "x", name: "listar_cenas", input: {} }],
        }),
      ),
    );
    const r = await executarAgente({ instrucao: "loop", ferramentas: ferramentasBase, maxPassos: 2 });
    expect(r.limite_atingido).toBe(true);
    expect(r.passos).toBe(2);
  });

  it("falha com mensagem clara sem ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      executarAgente({ instrucao: "x", ferramentas: ferramentasBase, maxPassos: 1 }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
