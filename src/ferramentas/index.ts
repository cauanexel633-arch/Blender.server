import { z } from "zod";
import { executarAgente } from "../agentes/agente.js";
import { ferramentasAnimacao } from "./animacao.js";
import { ferramentasCena } from "./cena.js";
import { ferramentasDesenho } from "./desenho.js";
import { ferramentasEdicao } from "./edicao.js";
import { ferramentasMaterial } from "./material.js";
import { ferramentasModelagem } from "./modelagem.js";
import { ferramentasPesquisa } from "./pesquisa.js";
import { definir, texto, type Ferramenta } from "./tipos.js";
import { ferramentasVfx } from "./vfx.js";
import { ferramentasVisao } from "./visao.js";

/** Ferramentas diretas, usadas pelo cliente MCP e também pelo agente interno. */
export const ferramentasBase: Ferramenta[] = [
  ...ferramentasCena,
  ...ferramentasDesenho,
  ...ferramentasAnimacao,
  ...ferramentasModelagem,
  ...ferramentasEdicao,
  ...ferramentasMaterial,
  ...ferramentasVisao,
  ...ferramentasVfx,
  ...ferramentasPesquisa,
];

const agente = definir({
  nome: "agente",
  titulo: "Agente de modelagem e pesquisa",
  descricao:
    "Executa um pedido amplo com um agente que escolhe sozinho as ferramentas (criar, editar, texturizar, renderizar, pesquisar na web) e devolve o resultado. Use para tarefas de várias etapas, ex.: 'modele uma cadeira de madeira com medidas reais pesquisadas'. Usa OpenRouter (modelo gratuito por padrão, via OPENROUTER_API_KEY) ou Anthropic (ANTHROPIC_API_KEY). Pode levar dezenas de segundos: prefira pedidos específicos.",
  schema: {
    instrucao: z.string().min(5).max(4000).describe("O que o agente deve fazer"),
    cena_id: z.string().optional().describe("Cena existente para o agente trabalhar (opcional)"),
    max_passos: z.number().int().min(1).max(25).default(12).describe("Limite de rodadas de ferramentas"),
  },
  executar: async (a) => {
    const prefixo = a.cena_id ? `Trabalhe na cena "${a.cena_id}" (use obter_cena primeiro).\n\n` : "";
    const resultado = await executarAgente({
      instrucao: prefixo + a.instrucao,
      ferramentas: ferramentasBase,
      maxPassos: a.max_passos,
    });
    return texto(resultado);
  },
});

export const todasFerramentas: Ferramenta[] = [...ferramentasBase, agente];
