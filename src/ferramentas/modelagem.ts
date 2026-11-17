import { z } from "zod";
import { Material, Ponto2, PontoRaioAltura, Primitiva, type ObjetoCena, type Transformacao } from "../geometria/tipos.js";
import { definir, texto } from "./tipos.js";
import {
  acharObjeto,
  campoCenaId,
  campoCor,
  campoPosicionamento,
  carregarCena,
  nomeLivre,
  novoId,
  salvarCena,
} from "./comum.js";

const transformacaoDe = (a: {
  posicao?: number[];
  rotacao_graus?: number[];
  escala?: number[];
}): Transformacao => ({
  posicao: a.posicao ?? [0, 0, 0],
  rotacao_graus: a.rotacao_graus ?? [0, 0, 0],
  escala: a.escala ?? [1, 1, 1],
});

const materialDe = (cor?: string) => Material.parse({ cor: cor ?? "#cccccc" });

export const ferramentasModelagem = [
  definir({
    nome: "criar_primitiva",
    titulo: "Criar primitiva",
    descricao:
      "Adiciona uma forma básica à cena: cubo, esfera, cilindro, cone, toro, capsula ou plano. Use só os parâmetros da forma escolhida; os demais são ignorados. Dimensões em unidades arbitrárias.",
    schema: {
      cena_id: campoCenaId,
      forma: z.enum(["cubo", "esfera", "cilindro", "cone", "toro", "capsula", "plano"]),
      nome: z.string().max(80).optional().describe("Nome do objeto (gerado automaticamente se omitido)"),
      tamanho: z.number().positive().optional().describe("cubo: aresta"),
      raio: z.number().positive().optional().describe("esfera, cone, toro (raio maior), capsula"),
      raio_topo: z.number().min(0).optional().describe("cilindro: raio do topo (0 vira cone)"),
      raio_base: z.number().min(0).optional().describe("cilindro: raio da base"),
      altura: z.number().positive().optional().describe("cilindro, cone, capsula"),
      tubo: z.number().positive().optional().describe("toro: espessura do tubo"),
      largura: z.number().positive().optional().describe("plano"),
      profundidade: z.number().positive().optional().describe("plano"),
      segmentos: z.number().int().min(3).max(256).optional().describe("Resolução radial"),
      ...campoPosicionamento,
      cor: campoCor,
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const dimensoes = {
        tamanho: a.tamanho,
        raio: a.raio,
        raio_topo: a.raio_topo ?? a.raio,
        raio_base: a.raio_base ?? a.raio,
        altura: a.altura,
        tubo: a.tubo,
        largura: a.largura,
        profundidade: a.profundidade,
        segmentos: a.segmentos,
      };
      const primitiva = Primitiva.parse({ forma: a.forma, ...dimensoes });
      const objeto: ObjetoCena = {
        id: novoId("obj"),
        nome: nomeLivre(cena, a.nome ?? a.forma),
        origem: { tipo: "primitiva", primitiva },
        transformacao: transformacaoDe(a),
        material: materialDe(a.cor),
        visivel: true,
      };
      cena.objetos.push(objeto);
      await salvarCena(cena);
      return texto({ objeto_id: objeto.id, nome: objeto.nome, primitiva });
    },
  }),

  definir({
    nome: "criar_extrusao",
    titulo: "Criar extrusão",
    descricao:
      "Cria um sólido puxando um contorno 2D (lista de pontos [x, y] em ordem, sem repetir o primeiro) ao longo do eixo Z por 'profundidade'. Ideal para peças planas, letras, perfis e suportes.",
    schema: {
      cena_id: campoCenaId,
      contorno: z
        .array(Ponto2)
        .min(3)
        .describe("Pontos do contorno [[x, y], ...]"),
      profundidade: z.number().positive().describe("Distância da extrusão no eixo Z"),
      nome: z.string().max(80).optional(),
      ...campoPosicionamento,
      cor: campoCor,
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const objeto: ObjetoCena = {
        id: novoId("obj"),
        nome: nomeLivre(cena, a.nome ?? "extrusao"),
        origem: { tipo: "extrusao", contorno: a.contorno, profundidade: a.profundidade },
        transformacao: transformacaoDe(a),
        material: materialDe(a.cor),
        visivel: true,
      };
      cena.objetos.push(objeto);
      await salvarCena(cena);
      return texto({ objeto_id: objeto.id, nome: objeto.nome });
    },
  }),

  definir({
    nome: "criar_revolucao",
    titulo: "Criar revolução",
    descricao:
      "Cria um sólido de revolução girando um perfil em torno do eixo Y. Cada ponto é [raio, y] (raio ≥ 0). Ideal para vasos, canecas, garrafas, peças torneadas e pinos.",
    schema: {
      cena_id: campoCenaId,
      perfil: z
        .array(PontoRaioAltura)
        .min(2)
        .describe("Pontos [[raio, y], ...] de baixo para cima"),
      segmentos: z.number().int().min(3).max(256).optional().describe("Resolução angular (padrão 32)"),
      nome: z.string().max(80).optional(),
      ...campoPosicionamento,
      cor: campoCor,
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const objeto: ObjetoCena = {
        id: novoId("obj"),
        nome: nomeLivre(cena, a.nome ?? "revolucao"),
        origem: { tipo: "revolucao", perfil: a.perfil, segmentos: a.segmentos ?? 32 },
        transformacao: transformacaoDe(a),
        material: materialDe(a.cor),
        visivel: true,
      };
      cena.objetos.push(objeto);
      await salvarCena(cena);
      return texto({ objeto_id: objeto.id, nome: objeto.nome });
    },
  }),

  definir({
    nome: "criar_booleana",
    titulo: "Operação booleana",
    descricao:
      "Combina dois objetos: uniao (somar), subtracao (cortar B de A) ou interseccao (parte comum). Os operandos ficam ocultos e reaparecem se a booleana for apagada. Operandos não podem já estar em outra booleana.",
    schema: {
      cena_id: campoCenaId,
      operacao: z.enum(["uniao", "subtracao", "interseccao"]),
      objeto_a: z.string().min(1).describe("Objeto base (A)"),
      objeto_b: z.string().min(1).describe("Objeto operando (B)"),
      nome: z.string().max(80).optional(),
    },
    executar: async (a) => {
      if (a.objeto_a === a.objeto_b) throw new Error("A e B precisam ser objetos diferentes");
      const cena = await carregarCena(a.cena_id);
      acharObjeto(cena, a.objeto_a);
      acharObjeto(cena, a.objeto_b);
      const jaUsados = new Set(
        cena.objetos.flatMap((o) => (o.origem.tipo === "booleana" ? [o.origem.a, o.origem.b] : [])),
      );
      if (jaUsados.has(a.objeto_a) || jaUsados.has(a.objeto_b)) {
        throw new Error("Um dos operandos já está em outra booleana. Apague-a antes de reutilizar o objeto.");
      }
      const objeto: ObjetoCena = {
        id: novoId("obj"),
        nome: nomeLivre(cena, a.nome ?? `booleana_${a.operacao}`),
        origem: { tipo: "booleana", operacao: a.operacao, a: a.objeto_a, b: a.objeto_b },
        transformacao: transformacaoDe({}),
        material: materialDe(),
        visivel: true,
      };
      cena.objetos.push(objeto);
      await salvarCena(cena);
      return texto({ objeto_id: objeto.id, nome: objeto.nome, operacao: a.operacao });
    },
  }),
];
