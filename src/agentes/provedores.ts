import { z } from "zod";
import type { Conteudo, Ferramenta } from "../ferramentas/tipos.js";

/** Histórico neutro do agente: independente do formato de cada provedor. */
export type Chamada = { id: string; nome: string; argumentos: unknown };
export type ItemResultado = { id: string; nome: string; conteudo: Conteudo[]; erro: boolean };
export type Passo =
  | { tipo: "assistente"; textos: string[]; chamadas: Chamada[] }
  | { tipo: "resultados"; itens: ItemResultado[] };

export interface Turno {
  textos: string[];
  chamadas: Chamada[];
}

export interface Provedor {
  nome: "openrouter" | "anthropic";
  modelo: string;
  enviar(sistema: string, ferramentas: Ferramenta[], instrucao: string, historico: Passo[]): Promise<Turno>;
}

const TIMEOUT_MS = 55_000;

function esquemaDe(f: Ferramenta): Record<string, unknown> {
  const { $schema, ...esquema } = z.toJSONSchema(z.object(f.schema)) as Record<string, unknown>;
  void $schema;
  return esquema;
}

async function postarJson(url: string, cabecalhos: Record<string, string>, corpo: unknown, rotulo: string): Promise<any> {
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...cabecalhos },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new Error(`${rotulo} respondeu HTTP ${resposta.status}: ${texto.slice(0, 500)}`);
  return JSON.parse(texto);
}

/* ------------------------------ OpenRouter ------------------------------ */

/**
 * OpenRouter usa a API no formato OpenAI. O modelo padrão `openrouter/free` escolhe um modelo
 * gratuito disponível por requisição; o nome real aparece em `model` na resposta.
 */
export function criarOpenRouter(chave: string, modelo = process.env.OPENROUTER_MODEL ?? "openrouter/free"): Provedor {
  const cabecalhos = {
    authorization: `Bearer ${chave}`,
    "http-referer": "https://bender-3d-mcp.vercel.app",
    "x-title": "bender-3d-mcp",
  };

  return {
    nome: "openrouter",
    modelo,
    async enviar(sistema, ferramentas, instrucao, historico) {
      const mensagens: Record<string, unknown>[] = [
        { role: "system", content: sistema },
        { role: "user", content: instrucao },
      ];
      for (const passo of historico) {
        if (passo.tipo === "assistente") {
          mensagens.push({
            role: "assistant",
            content: passo.textos.join("\n") || null,
            ...(passo.chamadas.length
              ? {
                  tool_calls: passo.chamadas.map((c) => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.nome, arguments: JSON.stringify(c.argumentos ?? {}) },
                  })),
                }
              : {}),
          });
        } else {
          const imagens: Record<string, unknown>[] = [];
          for (const item of passo.itens) {
            const textos = item.conteudo
              .map((c) => (c.type === "text" ? c.text : c.type === "resource" ? `[arquivo ${c.resource.uri}]` : "[imagem anexada abaixo]"))
              .join("\n");
            mensagens.push({ role: "tool", tool_call_id: item.id, content: item.erro ? `Erro: ${textos}` : textos });
            for (const c of item.conteudo) {
              if (c.type === "image") {
                imagens.push({ type: "image_url", image_url: { url: `data:${c.mimeType};base64,${c.data}` } });
              }
            }
          }
          if (imagens.length) {
            mensagens.push({ role: "user", content: [{ type: "text", text: "Imagem(ns) do resultado:" }, ...imagens] });
          }
        }
      }

      const dados = await postarJson(
        "https://openrouter.ai/api/v1/chat/completions",
        cabecalhos,
        {
          model: modelo,
          max_tokens: 4096,
          messages: mensagens,
          tools: ferramentas.map((f) => ({
            type: "function",
            function: { name: f.nome, description: f.descricao, parameters: esquemaDe(f) },
          })),
        },
        "OpenRouter",
      );

      const mensagem = dados.choices?.[0]?.message;
      if (!mensagem) throw new Error("OpenRouter não devolveu nenhuma escolha");
      const textos = typeof mensagem.content === "string" && mensagem.content.trim() ? [mensagem.content.trim()] : [];
      const chamadas: Chamada[] = (mensagem.tool_calls ?? []).map((tc: any) => {
        let argumentos: unknown = {};
        try {
          argumentos = JSON.parse(tc.function?.arguments || "{}");
        } catch {
          argumentos = { __json_invalido: String(tc.function?.arguments) };
        }
        return { id: tc.id, nome: tc.function?.name, argumentos };
      });
      return { textos, chamadas };
    },
  };
}

/* ------------------------------ Anthropic ------------------------------- */

export function criarAnthropic(chave: string, modelo = process.env.AGENT_MODEL ?? "claude-sonnet-5-5"): Provedor {
  return {
    nome: "anthropic",
    modelo,
    async enviar(sistema, ferramentas, instrucao, historico) {
      const mensagens: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: instrucao }];
      for (const passo of historico) {
        if (passo.tipo === "assistente") {
          mensagens.push({
            role: "assistant",
            content: [
              ...passo.textos.map((t) => ({ type: "text", text: t })),
              ...passo.chamadas.map((c) => ({ type: "tool_use", id: c.id, name: c.nome, input: c.argumentos ?? {} })),
            ],
          });
        } else {
          mensagens.push({
            role: "user",
            content: passo.itens.map((item) => ({
              type: "tool_result",
              tool_use_id: item.id,
              is_error: item.erro || undefined,
              content: item.conteudo.map((c) =>
                c.type === "image"
                  ? { type: "image", source: { type: "base64", media_type: c.mimeType, data: c.data } }
                  : { type: "text", text: c.type === "text" ? c.text : `[arquivo ${c.resource.uri}]` },
              ),
            })),
          });
        }
      }

      const dados = await postarJson(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": chave, "anthropic-version": "2023-06-01" },
        {
          model: modelo,
          max_tokens: 4096,
          system: sistema,
          tools: ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: esquemaDe(f) })),
          messages: mensagens,
        },
        "API da Anthropic",
      );

      const blocos = (dados.content ?? []) as { type: string; [k: string]: any }[];
      return {
        textos: blocos.filter((b) => b.type === "text").map((b) => String(b.text).trim()).filter(Boolean),
        chamadas: blocos
          .filter((b) => b.type === "tool_use")
          .map((b) => ({ id: String(b.id), nome: String(b.name), argumentos: b.input ?? {} })),
      };
    },
  };
}

/**
 * Escolhe o provedor: AGENT_PROVIDER força um; senão usa OpenRouter se houver chave,
 * caindo para Anthropic.
 */
export function escolherProvedor(): Provedor {
  const forcado = process.env.AGENT_PROVIDER;
  const chaveOr = process.env.OPENROUTER_API_KEY;
  const chaveAn = process.env.ANTHROPIC_API_KEY;
  if (forcado === "anthropic") {
    if (!chaveAn) throw new Error("AGENT_PROVIDER=anthropic exige ANTHROPIC_API_KEY");
    return criarAnthropic(chaveAn);
  }
  if (forcado === "openrouter" || chaveOr) {
    if (!chaveOr) throw new Error("AGENT_PROVIDER=openrouter exige OPENROUTER_API_KEY");
    return criarOpenRouter(chaveOr);
  }
  if (chaveAn) return criarAnthropic(chaveAn);
  throw new Error("Agente indisponível: defina OPENROUTER_API_KEY (recomendado) ou ANTHROPIC_API_KEY");
}
