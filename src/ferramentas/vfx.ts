import { z } from "zod";
import { elementosDoEfeito, TIPOS_EFEITO, type ParamsEfeito } from "../vfx/particulas.js";
import { Cor } from "../geometria/tipos.js";
import { novoId } from "./comum.js";
import { carregarDesenho, MAX_ELEMENTOS, salvarDesenho } from "./desenho.js";
import { definir, texto } from "./tipos.js";

const TIPOS_QUE_USAM_AREA = new Set(["chuva", "neve"]);

export const ferramentasVfx = [
  definir({
    nome: "criar_efeito_2d",
    titulo: "Criar efeito visual 2D",
    descricao:
      "Adiciona um efeito de partículas (VFX) a um desenho 2D. Tipos: explosao, fogo, fumaca, faiscas, brilho (halo pulsante), chuva e neve (usam largura e altura como área). " +
      "x, y é o centro do efeito. 'progresso' de 0 a 1 escolhe o instante: 0 no início, 1 no fim. Para uma sequência, gere vários instantes com grupos diferentes. " +
      "A mesma semente sempre gera o mesmo resultado. Os elementos ficam agrupados em 'grupo', que serve para apagar o efeito inteiro com apagar_efeito_2d.",
    schema: {
      desenho_id: z.string().min(1).describe("ID do desenho (retornado por criar_desenho)"),
      tipo: z.enum(TIPOS_EFEITO),
      x: z.number().describe("Centro do efeito em X, em pixels (no caso de chuva e neve, canto superior esquerdo da área)"),
      y: z.number().describe("Centro do efeito em Y, em pixels (no caso de chuva e neve, canto superior esquerdo da área)"),
      largura: z.number().positive().optional().describe("Só para chuva e neve: largura da área"),
      altura: z.number().positive().optional().describe("Só para chuva e neve: altura da área"),
      quantidade: z.number().int().min(1).max(800).default(200).describe("Número de partículas"),
      progresso: z.number().min(0).max(1).default(0.5).describe("Instante do efeito: 0 começo, 1 fim"),
      semente: z.number().int().default(1).describe("Semente do sorteio: mesma semente, mesmo resultado"),
      cor_inicial: Cor.default("#ffcc00").describe("Cor no início de cada partícula"),
      cor_final: Cor.default("#ff3300").describe("Cor no fim de cada partícula"),
      tamanho: z.number().min(0.5).max(200).default(6).describe("Tamanho típico da partícula, em pixels"),
      raio: z.number().min(1).max(2000).default(80).describe("Alcance do efeito, em pixels"),
      grupo: z.string().min(1).max(80).optional().describe("Nome do grupo; se omitido, um ID é gerado"),
    },
    executar: async (a) => {
      const desenho = await carregarDesenho(a.desenho_id);
      if (TIPOS_QUE_USAM_AREA.has(a.tipo) && (a.largura === undefined || a.altura === undefined)) {
        throw new Error(`${a.tipo} precisa de largura e altura da área`);
      }
      const grupo = a.grupo ?? novoId("efx");
      const params: ParamsEfeito = {
        tipo: a.tipo,
        x: a.x,
        y: a.y,
        largura: a.largura ?? 0,
        altura: a.altura ?? 0,
        quantidade: a.quantidade,
        progresso: a.progresso,
        semente: a.semente,
        corInicial: a.cor_inicial,
        corFinal: a.cor_final,
        tamanho: a.tamanho,
        raio: a.raio,
      };
      const novos = elementosDoEfeito(params, grupo, () => novoId("el"));
      if (desenho.elementos.length + novos.length > MAX_ELEMENTOS) {
        throw new Error(
          `Esse efeito adicionaria ${novos.length} elementos e o desenho passaria de ${MAX_ELEMENTOS}. Reduza a quantidade ou apague efeitos antigos.`,
        );
      }
      desenho.elementos.push(...novos);
      await salvarDesenho(desenho);
      return texto({
        grupo,
        tipo: a.tipo,
        particulas_visiveis: novos.length,
        elementos_no_desenho: desenho.elementos.length,
      });
    },
  }),

  definir({
    nome: "apagar_efeito_2d",
    titulo: "Apagar efeito visual 2D",
    descricao: "Remove todos os elementos de um efeito ou grupo, pelo nome do grupo. Exige confirmar=true e só deve ser usada quando o usuário pedir.",
    destrutiva: true,
    schema: {
      desenho_id: z.string().min(1).describe("ID do desenho"),
      grupo: z.string().min(1).describe("Nome do grupo devolvido por criar_efeito_2d"),
      confirmar: z
        .boolean()
        .refine((v) => v === true, { message: "Use true para confirmar" })
        .describe("Deve ser exatamente true para confirmar"),
    },
    executar: async ({ desenho_id, grupo }) => {
      const desenho = await carregarDesenho(desenho_id);
      const antes = desenho.elementos.length;
      desenho.elementos = desenho.elementos.filter((e) => e.grupo !== grupo);
      const removidos = antes - desenho.elementos.length;
      if (removidos === 0) throw new Error(`Nenhum elemento com o grupo "${grupo}"`);
      await salvarDesenho(desenho);
      return texto({ grupo, removidos, elementos_no_desenho: desenho.elementos.length });
    },
  }),
];
