import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { todasFerramentas } from "./ferramentas/index.js";
import type { Conteudo } from "./ferramentas/tipos.js";
import { TEXTO_GUIA } from "./prompts/guia.js";
import { registrarPrompts } from "./prompts/index.js";

export const VERSAO = "0.1.0";

/** Cria um servidor MCP com todas as ferramentas e prompts. Um por requisição (modo stateless). */
export function criarServidorMcp(): McpServer {
  const servidor = new McpServer({ name: "bender-3d", version: VERSAO }, { instructions: TEXTO_GUIA });

  for (const f of todasFerramentas) {
    servidor.registerTool(
      f.nome,
      {
        title: f.titulo,
        description: f.descricao,
        inputSchema: f.schema,
        annotations: { readOnlyHint: Boolean(f.somenteLeitura), destructiveHint: Boolean(f.destrutiva) },
      },
      async (args: unknown) => {
        try {
          const conteudo: Conteudo[] = await f.executar(args);
          return { content: conteudo };
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          return { isError: true, content: [{ type: "text" as const, text: `Erro: ${mensagem}` }] };
        }
      },
    );
  }

  registrarPrompts(servidor);
  return servidor;
}
