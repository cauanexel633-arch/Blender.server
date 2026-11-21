import { z } from "zod";
import { executarAgente } from "../agentes/agente.js";
import { parseVeredito } from "../agentes/veredito.js";
import { AREAS, textoDaArea, type Area } from "../habilidades/areas.js";
import { paraAgente } from "./imagem.js";
import { definir, texto, type Ferramenta } from "./tipos.js";

/** O revisor só lê e renderiza. Não cria, não edita, não apaga e não exporta. */
export const FERRAMENTAS_DO_REVISOR = new Set([
  "obter_interface",
  "revisar_interface",
  "gerar_preview_interface",
  "obter_cena",
  "inspecionar_cena",
  "renderizar_cena",
  "obter_desenho",
  "renderizar_desenho",
]);

const PASSO_POR_ALVO: Record<string, string> = {
  interface: "Use obter_interface com o id, revisar_interface e gerar_preview_interface (formato imagem). Olhe a imagem.",
  cena: "Use obter_cena e inspecionar_cena com o cena_id, depois renderizar_cena (formato imagem) de frente e isométrica. Olhe as imagens.",
  desenho: "Use obter_desenho com o desenho_id e renderizar_desenho (formato imagem). Olhe a imagem.",
};

/** Cria o revisor a partir da lista de ferramentas do servidor (evita importação circular). */
export function criarFerramentaRevisor(todas: Ferramenta[]): Ferramenta {
  return definir({
    nome: "revisar_trabalho",
    titulo: "Revisor independente",
    descricao:
      "Revisor separado de quem criou o trabalho. Recebe só o pedido original, a área e o alvo (interface, cena ou desenho), olha a imagem e confere com a checklist da área. Não corrige: devolve aprovado (true/false), nota de 0 a 10 e problemas com gravidade (bloqueante, importante, menor). Corrija os problemas e chame de novo até aprovado. Precisa de OPENROUTER_API_KEY ou ANTHROPIC_API_KEY.",
    somenteLeitura: true,
    schema: {
      pedido: z.string().min(5).max(2000).describe("O pedido ORIGINAL do usuário, com as palavras dele"),
      area: z.enum(AREAS).describe("Área do trabalho, para a checklist"),
      alvo: z.object({
        tipo: z.enum(["interface", "cena", "desenho"]),
        id: z.string().min(1).describe("interface_id, cena_id ou desenho_id"),
      }),
      max_passos: z.number().int().min(1).max(15).default(8),
    },
    executar: async ({ pedido, area, alvo, max_passos }) => {
      const ferramentas = todas.filter((f) => FERRAMENTAS_DO_REVISOR.has(f.nome)).map(paraAgente);
      const instrucao =
        `Você é um REVISOR INDEPENDENTE. Não criou este trabalho e não defende nenhuma escolha dele.\n` +
        `Sua tarefa é conferir o resultado contra o pedido original e a checklist. Não corrija nada; só aponte.\n\n` +
        `PEDIDO ORIGINAL DO USUÁRIO: "${pedido}"\n` +
        `ALVO: ${alvo.tipo} com id "${alvo.id}".\n` +
        `${PASSO_POR_ALVO[alvo.tipo]}\n\n` +
        `CHECKLIST DA ÁREA:\n${textoDaArea(area as Area)}\n\n` +
        `Compare com o pedido: está tudo que foi pedido? Há algo que não foi pedido? Proporção, legibilidade, alinhamento, cor e acabamento estão profissionais?\n\n` +
        `Responda APENAS com um bloco JSON neste formato:\n` +
        `{"aprovado": true|false, "nota": 0-10, "problemas": [{"gravidade": "bloqueante|importante|menor", "onde": "elemento ou região", "o_que": "o problema", "como_corrigir": "ação concreta"}]}\n` +
        `Use "bloqueante" para o que não atende o pedido ou quebra a checklist, "importante" para falhas visíveis de qualidade, "menor" para detalhes. Aprove só se não houver bloqueante nem importante.`;

      const r = await executarAgente({ instrucao, ferramentas, maxPassos: max_passos });
      const veredito = parseVeredito(r.resposta);
      return texto({
        ...veredito,
        alvo,
        area,
        passos: r.passos,
        modelo_ia: `${r.provedor}/${r.modelo}`,
        limite_atingido: r.limite_atingido,
      });
    },
  });
}
