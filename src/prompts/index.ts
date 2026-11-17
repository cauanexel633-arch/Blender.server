import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TEXTO_GUIA } from "./guia.js";

type Mensagem = { role: "user"; content: { type: "text"; text: string } };
const msg = (text: string): { messages: Mensagem[] } => ({
  messages: [{ role: "user", content: { type: "text", text } }],
});

/**
 * Comandos /prompt expostos ao cliente MCP. Cada um injeta instruções de uso
 * das ferramentas para a IA seguir um fluxo específico.
 */
export function registrarPrompts(servidor: McpServer): void {
  servidor.registerPrompt(
    "guia",
    {
      title: "Guia do bender-3d",
      description: "Ensina a IA como usar todas as ferramentas 3D, convenções e fluxo de trabalho",
    },
    () => msg(TEXTO_GUIA),
  );

  servidor.registerPrompt(
    "modelar",
    {
      title: "Modelar objeto",
      description: "Modela um objeto 3D do zero com verificação visual em cada etapa",
      argsSchema: { objeto: z.string().describe("O que modelar, ex.: 'caneca de 10 cm com alça'") },
    },
    ({ objeto }) =>
      msg(`${TEXTO_GUIA}

TAREFA: modelar "${objeto}".
1. Crie uma cena com nome curto.
2. Planeje as partes em uma lista e defina medidas coerentes (use inspecionar_cena para conferir depois).
3. Construa parte por parte. Após cada parte grande, chame renderizar_cena e corrija o que estiver errado.
4. Ao final, rode inspecionar_cena, mostre as dimensões ao usuário e informe o cena_id para exportação.`),
  );

  servidor.registerPrompt(
    "texturizar",
    {
      title: "Texturizar e colorir",
      description: "Aplica cores, materiais PBR e texturas a uma cena existente",
      argsSchema: {
        cena_id: z.string().describe("ID da cena a texturizar"),
        estilo: z.string().describe("Estilo desejado, ex.: 'madeira envelhecida', 'metal escovado', 'cerâmica azul'"),
      },
    },
    ({ cena_id, estilo }) =>
      msg(`${TEXTO_GUIA}

TAREFA: texturizar a cena "${cena_id}" no estilo "${estilo}".
1. Use obter_cena para listar os objetos.
2. Para cada objeto, escolha cor, metalico e rugosidade coerentes com o estilo (metal: metalico alto e rugosidade baixa; madeira/cerâmica: metalico 0).
3. Use aplicar_textura com um padrão procedural quando ajudar (ruido para madeira e pedra, listras para tecido, xadrez para azulejo). Use tipo='url' somente se o usuário pediu uma imagem específica.
4. Renderize a cena, avalie e ajuste.`),
  );

  servidor.registerPrompt(
    "pesquisar",
    {
      title: "Pesquisar referências",
      description: "Pesquisa medidas, fotos e especificações na web antes de modelar",
      argsSchema: { assunto: z.string().describe("O que pesquisar, ex.: 'dimensões de uma garrafa PET de 500 ml'") },
    },
    ({ assunto }) =>
      msg(`${TEXTO_GUIA}

TAREFA: pesquisar referências sobre "${assunto}".
1. Use pesquisar_web com 2 ou 3 consultas diferentes (medidas, especificações, imagens de referência).
2. Abra com ler_pagina as fontes mais confiáveis (fabricantes, normas, documentação).
3. Responda com os valores encontrados, a unidade, as URLs usadas e o nível de confiança. Não invente medidas: se não achar, diga.
4. Se o usuário quiser modelar, use os valores pesquisados como medidas da cena.`),
  );

  servidor.registerPrompt(
    "revisar_impressao",
    {
      title: "Revisar para impressão 3D",
      description: "Verifica uma cena para impressão 3D: volume, espessuras, malhas abertas e exporta STL",
      argsSchema: { cena_id: z.string().describe("ID da cena a revisar") },
    },
    ({ cena_id }) =>
      msg(`${TEXTO_GUIA}

TAREFA: revisar a cena "${cena_id}" para impressão 3D.
1. Rode inspecionar_cena e leia os avisos.
2. Renderize nas câmeras frente e topo para checar proporções.
3. Confirme que não há objetos de volume zero nem partes soltas sem propósito.
4. Se estiver pronto, exporte em STL binário com exportar_modelo e apresente as dimensões finais em mm.`),
  );
}
