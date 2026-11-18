import { randomInt } from "node:crypto";
import { z } from "zod";
import { LIMITE_AMOSTRAS } from "../animacao/cena3d.js";
import { Cor, TIPOS_EFEITO_3D, Vetor3, type EfeitoCena } from "../geometria/tipos.js";
import { expandirEfeitos, ultimoQuadroDoEfeito } from "../vfx3d/efeitos.js";
import { campoCenaId, carregarCena, novoId, salvarCena } from "./comum.js";
import { definir, texto } from "./tipos.js";

/** Amostras de keyframes que um conjunto de efeitos gera (duas propriedades por partícula e quadro). */
function amostrasDosEfeitos(efeitos: EfeitoCena[]): number {
  return efeitos.reduce((total, e) => total + e.quantidade * (ultimoQuadroDoEfeito(e) + 1) * 2, 0);
}

export const ferramentasVfx3d = [
  definir({
    nome: "criar_efeito_3d",
    titulo: "Criar efeito 3D",
    descricao:
      "Adiciona um efeito de partículas 3D à cena: explosao, fogo, fumaca, faiscas, neve ou chuva. " +
      "As partículas são esferas animadas que nascem no centro (ou na área, em neve e chuva) e somem no fim da vida. " +
      "O efeito é gerado de forma determinística (mesma semente, mesmo resultado) e aparece no GLB animado, no GIF e no render com quadro. " +
      "Não aparece em STL nem OBJ. Use inicio_quadro e duracao_quadros para o tempo do efeito na animação. " +
      "Guarde o 'grupo' devolvido para apagar depois.",
    schema: {
      cena_id: campoCenaId,
      tipo: z.enum(TIPOS_EFEITO_3D),
      centro: Vetor3.default([0, 0, 0]).describe("Ponto de origem [x, y, z]"),
      quantidade: z.number().int().min(1).max(300).default(60).describe("Número de partículas"),
      inicio_quadro: z.number().int().min(0).max(599).default(0),
      duracao_quadros: z.number().int().min(1).max(200).default(40).describe("Duração da emissão em quadros"),
      velocidade: z.number().min(0.05).max(5).default(1).describe("Multiplica a velocidade das partículas"),
      tamanho: z.number().min(0.001).max(10).default(0.05).describe("Raio das partículas, em unidades da cena"),
      cor_inicial: Cor.default("#ffcc33"),
      cor_final: Cor.default("#ff3300"),
      emissiva: z.boolean().default(true).describe("Partículas brilham (bom para fogo e faíscas)"),
      area: Vetor3.default([2, 3, 2]).describe("neve e chuva: [largura, altura de queda, profundidade]"),
      semente: z.number().int().optional().describe("Mesma semente, mesmo efeito (sorteada se omitida)"),
      grupo: z.string().min(1).max(40).optional().describe("Nome do efeito, para apagar depois (gerado se omitido)"),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const grupo = a.grupo ?? novoId("efx3d");
      if ((cena.efeitos ?? []).some((e) => e.grupo === grupo)) {
        throw new Error(`Já existe um efeito chamado "${grupo}" nesta cena`);
      }
      const efeito: EfeitoCena = {
        grupo,
        tipo: a.tipo,
        centro: a.centro,
        quantidade: a.quantidade,
        inicio_quadro: a.inicio_quadro,
        duracao_quadros: a.duracao_quadros,
        velocidade: a.velocidade,
        tamanho: a.tamanho,
        cor_inicial: a.cor_inicial,
        cor_final: a.cor_final,
        emissiva: a.emissiva,
        semente: a.semente ?? randomInt(1, 2_000_000_000),
        area: a.area,
      };
      if (ultimoQuadroDoEfeito(efeito) > 599) {
        throw new Error("O efeito termina depois do quadro 599. Reduza inicio_quadro ou duracao_quadros.");
      }
      const efeitos = [...(cena.efeitos ?? []), efeito];
      const amostras = amostrasDosEfeitos(efeitos);
      if (amostras > LIMITE_AMOSTRAS) {
        throw new Error(
          `Os efeitos gerariam ${amostras} amostras de animação. O limite é ${LIMITE_AMOSTRAS}; reduza a quantidade ou a duração.`,
        );
      }
      cena.efeitos = efeitos;
      await salvarCena(cena);
      const expandida = expandirEfeitos(cena);
      return texto({
        grupo,
        tipo: efeito.tipo,
        particulas: efeito.quantidade,
        quadros_do_efeito: ultimoQuadroDoEfeito(efeito) + 1,
        duracao_animacao_quadros: expandida.animacao?.duracao_quadros ?? 0,
        aviso: "O efeito aparece no GLB animado, no GIF e no render com quadro. STL e OBJ não incluem efeitos.",
      });
    },
  }),

  definir({
    nome: "listar_efeitos_3d",
    titulo: "Listar efeitos 3D",
    descricao: "Lista os efeitos 3D da cena, com grupo, tipo, quantidade e quadros, para escolher qual apagar.",
    somenteLeitura: true,
    schema: { cena_id: campoCenaId },
    executar: async ({ cena_id }) => {
      const cena = await carregarCena(cena_id);
      return texto(
        (cena.efeitos ?? []).map((e) => ({
          grupo: e.grupo,
          tipo: e.tipo,
          particulas: e.quantidade,
          inicio_quadro: e.inicio_quadro,
          quadros_do_efeito: ultimoQuadroDoEfeito(e) + 1,
        })),
      );
    },
  }),

  definir({
    nome: "apagar_efeito_3d",
    titulo: "Apagar efeito 3D",
    descricao: "Remove um efeito 3D da cena pelo grupo. Exige confirmar=true e só deve ser usada quando o usuário pedir.",
    destrutiva: true,
    schema: {
      cena_id: campoCenaId,
      grupo: z.string().min(1).max(40).describe("Grupo do efeito (devolvido por criar_efeito_3d)"),
      confirmar: z
        .boolean()
        .refine((v) => v === true, { message: "Use true para confirmar" })
        .describe("Deve ser exatamente true para confirmar a remoção"),
    },
    executar: async ({ cena_id, grupo }) => {
      const cena = await carregarCena(cena_id);
      const antes = cena.efeitos?.length ?? 0;
      cena.efeitos = (cena.efeitos ?? []).filter((e) => e.grupo !== grupo);
      if (cena.efeitos.length === antes) throw new Error(`Nenhum efeito chamado "${grupo}" nesta cena`);
      await salvarCena(cena);
      return texto({ removido: grupo, efeitos_restantes: cena.efeitos.length });
    },
  }),
];
