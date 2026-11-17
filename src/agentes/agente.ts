import { z } from "zod";
import type { Conteudo, Ferramenta } from "../ferramentas/tipos.js";
import { TEXTO_GUIA } from "../prompts/guia.js";

export interface OpcoesAgente {
  instrucao: string;
  ferramentas: Ferramenta[];
  maxPassos: number;
  modelo?: string;
}

export interface ResultadoAgente {
  resposta: string;
  passos: number;
  ferramentas_usadas: string[];
  limite_atingido: boolean;
}

type BlocoApi = { type: string; [chave: string]: unknown };

const API = "https://api.anthropic.com/v1/messages";

function paraBlocoApi(c: Conteudo): BlocoApi {
  if (c.type === "image") {
    return { type: "image", source: { type: "base64", media_type: c.mimeType, data: c.data } };
  }
  if (c.type === "resource") {
    return { type: "text", text: `Arquivo gerado: ${c.resource.uri} (${c.resource.mimeType}, conteúdo omitido aqui)` };
  }
  return { type: "text", text: c.text };
}

/**
 * Agente com loop de ferramentas: o modelo escolhe ferramentas do próprio servidor (modelar, renderizar,
 * pesquisar), o servidor executa e devolve o resultado, até o modelo concluir ou atingir `maxPassos`.
 */
export async function executarAgente(opcoes: OpcoesAgente): Promise<ResultadoAgente> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error("Agente indisponível: defina ANTHROPIC_API_KEY");
  const modelo = opcoes.modelo ?? process.env.AGENT_MODEL ?? "claude-sonnet-5-5";

  const porNome = new Map(opcoes.ferramentas.map((f) => [f.nome, f]));
  const ferramentasApi = opcoes.ferramentas.map((f) => {
    const { $schema, ...esquema } = z.toJSONSchema(z.object(f.schema)) as Record<string, unknown>;
    void $schema;
    return { name: f.nome, description: f.descricao, input_schema: esquema };
  });

  const mensagens: { role: "user" | "assistant"; content: unknown }[] = [
    { role: "user", content: opcoes.instrucao },
  ];
  const usadas: string[] = [];

  for (let passo = 1; passo <= opcoes.maxPassos; passo++) {
    const resposta = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 4096,
        system: TEXTO_GUIA,
        tools: ferramentasApi,
        messages: mensagens,
      }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!resposta.ok) throw new Error(`API da Anthropic respondeu HTTP ${resposta.status}: ${await resposta.text()}`);

    const corpo = (await resposta.json()) as { content: BlocoApi[]; stop_reason: string };
    mensagens.push({ role: "assistant", content: corpo.content });

    if (corpo.stop_reason !== "tool_use") {
      const resposta_final = corpo.content
        .filter((b) => b.type === "text")
        .map((b) => String(b.text))
        .join("\n")
        .trim();
      return { resposta: resposta_final, passos: passo, ferramentas_usadas: usadas, limite_atingido: false };
    }

    const resultados: BlocoApi[] = [];
    for (const bloco of corpo.content.filter((b) => b.type === "tool_use")) {
      const nome = String(bloco.name);
      const ferramenta = porNome.get(nome);
      usadas.push(nome);
      try {
        if (!ferramenta) throw new Error(`Ferramenta desconhecida: ${nome}`);
        const conteudo = await ferramenta.executar(bloco.input);
        resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: conteudo.map(paraBlocoApi) });
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro);
        resultados.push({
          type: "tool_result",
          tool_use_id: bloco.id,
          is_error: true,
          content: [{ type: "text", text: `Erro: ${msg}` }],
        });
      }
    }
    mensagens.push({ role: "user", content: resultados });
  }

  return {
    resposta: "Limite de passos atingido antes de concluir. Refine a instrução ou aumente max_passos.",
    passos: opcoes.maxPassos,
    ferramentas_usadas: usadas,
    limite_atingido: true,
  };
}
