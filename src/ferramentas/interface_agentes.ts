import { z } from "zod";
import { executarAgente } from "../agentes/agente.js";
import { obterLojaInterfaces } from "../interface/loja.js";
import { analisarInterface } from "../interface/revisao.js";
import type { InterfaceUI } from "../interface/tipos.js";
import { ferramentasInterface } from "./interface.js";
import { definir, texto, type Ferramenta } from "./tipos.js";

const PAPEIS = ["design", "organizacao", "qualidade"] as const;

/** Os agentes editam, mas não apagam, não geram o preview aprovado e não exportam. */
export const FERRAMENTAS_DO_AGENTE = new Set([
  "obter_interface",
  "listar_propriedades_ui",
  "adicionar_elemento_ui",
  "editar_elemento_ui",
  "mover_elemento_ui",
  "duplicar_elemento_ui",
  "revisar_interface",
]);

const INSTRUCOES: Record<(typeof PAPEIS)[number], string> = {
  design:
    "Seu papel é DESIGN. Deixe a interface bonita e coerente: uma paleta de 3 a 4 cores (fundo, superfície, destaque, texto), " +
    "cantos arredondados com UICorner nos painéis e botões, espaçamento regular (múltiplos de 8 px), texto legível (TextSize 14 a 28 " +
    "em títulos e textos) e fontes com peso adequado (GothamBold para títulos, Gotham para o corpo). Use editar_elemento_ui para " +
    "ajustar cores e fontes. Não mude a estrutura nem os textos.",
  organizacao:
    "Seu papel é ORGANIZAÇÃO. Deixe a hierarquia clara: painéis agrupam elementos relacionados, botões de uma mesma ação ficam " +
    "juntos, e listas usam UIListLayout ou UIGridLayout (adicione-o dentro do painel e remova posições soltas dos filhos). " +
    "Dê nomes claros a todos os elementos (ex.: 'BotaoJogar', 'PainelConfiguracoes'), no lugar de 'Frame'. Use mover_elemento_ui " +
    "para corrigir o pai de um elemento. Não mude cores nem textos.",
  qualidade:
    "Seu papel é QUALIDADE. Use revisar_interface para encontrar problemas e corrija cada um: elementos fora da tela, botões " +
    "menores que 36 px, texto maior que a caixa, contraste abaixo de 4.5:1 (troque a cor do texto ou do fundo), sobreposições e " +
    "nomes repetidos. Repita a revisão até não sobrar erro. Faça só as correções necessárias, sem reformular o visual.",
};

function resumo(ui: InterfaceUI) {
  const problemas = analisarInterface(ui);
  return {
    problemas_restantes: problemas.length,
    detalhes: problemas.slice(0, 30),
  };
}

export const ferramentasInterfaceAgentes: Ferramenta[] = [
  definir({
    nome: "revisar_interface",
    titulo: "Revisar interface",
    descricao:
      "Confere a interface e lista problemas: elementos fora da tela, botões pequenos, texto que não cabe, contraste baixo (WCAG 4.5:1), sobreposições entre elementos vizinhos, nomes repetidos ou padrão. Só leitura.",
    somenteLeitura: true,
    schema: { interface_id: z.string().min(1) },
    executar: async ({ interface_id }) => {
      const ui = await obterLojaInterfaces().obter(interface_id);
      if (!ui) throw new Error(`Interface "${interface_id}" não existe`);
      return texto(resumo(ui));
    },
  }),

  definir({
    nome: "agente_interface",
    titulo: "Agente de interface",
    descricao:
      "Agente de IA que melhora a interface com um papel: 'design' (cores, cantos, espaçamento e fontes), 'organizacao' (hierarquia, nomes, layouts automáticos) ou 'qualidade' (revisão e correção de legibilidade e layout). Aplica as mudanças direto na interface e devolve os problemas que sobraram. Depois das mudanças, gere o preview e peça aprovação ao usuário antes de exportar. Usa OpenRouter ou Anthropic (precisa de chave).",
    schema: {
      interface_id: z.string().min(1),
      papel: z.enum(PAPEIS),
      pedido: z.string().max(1000).optional().describe("Detalhes extras, ex.: 'tema escuro com roxo', 'estilo de jogo de terror'"),
      max_passos: z.number().int().min(1).max(25).default(15),
    },
    executar: async ({ interface_id, papel, pedido, max_passos }) => {
      const ui = await obterLojaInterfaces().obter(interface_id);
      if (!ui) throw new Error(`Interface "${interface_id}" não existe`);
      const ferramentas = ferramentasInterface.filter((f) => FERRAMENTAS_DO_AGENTE.has(f.nome)).concat(
        ferramentasInterfaceAgentes.filter((f) => f.nome === "revisar_interface"),
      );
      const instrucao =
        `Interface com id "${interface_id}" (use obter_interface primeiro).\n\n${INSTRUCOES[papel]}` +
        (pedido ? `\n\nPedido do usuário: ${pedido}` : "") +
        "\n\nAo terminar, responda em português com um resumo curto do que mudou.";
      const resultado = await executarAgente({ instrucao, ferramentas, maxPassos: max_passos });
      const final = await obterLojaInterfaces().obter(interface_id);
      return texto({
        papel,
        resposta: resultado.resposta,
        passos: resultado.passos,
        ferramentas_usadas: [...new Set(resultado.ferramentas_usadas)],
        limite_atingido: resultado.limite_atingido,
        modelo: `${resultado.provedor}/${resultado.modelo}`,
        ...(final ? resumo(final) : {}),
        proximo_passo: "A interface mudou. Gere o preview com gerar_preview_interface e pergunte ao usuário se pode implementar.",
      });
    },
  }),
];
