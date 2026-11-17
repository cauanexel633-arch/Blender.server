import { z } from "zod";
import { Vetor3 } from "../geometria/tipos.js";
import { definir, texto } from "./tipos.js";
import { acharObjeto, campoCenaId, campoObjetoId, carregarCena, nomeLivre, novoId, salvarCena } from "./comum.js";

export const ferramentasEdicao = [
  definir({
    nome: "transformar",
    titulo: "Transformar objeto",
    descricao:
      "Move, gira e escala um objeto. modo='definir' (padrão) substitui os valores informados; modo='somar' soma posição e rotação e multiplica a escala. Campos omitidos não mudam.",
    schema: {
      cena_id: campoCenaId,
      objeto_id: campoObjetoId,
      modo: z.enum(["definir", "somar"]).default("definir"),
      posicao: Vetor3.optional(),
      rotacao_graus: Vetor3.optional(),
      escala: Vetor3.optional(),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const obj = acharObjeto(cena, a.objeto_id);
      const t = obj.transformacao;
      const somar = a.modo === "somar";
      if (a.posicao) t.posicao = somar ? (t.posicao.map((v, i) => v + a.posicao![i]) as typeof t.posicao) : a.posicao;
      if (a.rotacao_graus) {
        t.rotacao_graus = somar
          ? (t.rotacao_graus.map((v, i) => v + a.rotacao_graus![i]) as typeof t.rotacao_graus)
          : a.rotacao_graus;
      }
      if (a.escala) {
        t.escala = somar ? (t.escala.map((v, i) => v * a.escala![i]) as typeof t.escala) : a.escala;
      }
      await salvarCena(cena);
      return texto({ objeto_id: obj.id, transformacao: t });
    },
  }),

  definir({
    nome: "editar_objeto",
    titulo: "Editar objeto",
    descricao: "Renomeia um objeto ou o oculta/mostra (visivel=false oculta sem apagar).",
    schema: {
      cena_id: campoCenaId,
      objeto_id: campoObjetoId,
      nome: z.string().min(1).max(80).optional(),
      visivel: z.boolean().optional(),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const obj = acharObjeto(cena, a.objeto_id);
      if (a.nome !== undefined) obj.nome = a.nome;
      if (a.visivel !== undefined) obj.visivel = a.visivel;
      await salvarCena(cena);
      return texto({ objeto_id: obj.id, nome: obj.nome, visivel: obj.visivel });
    },
  }),

  definir({
    nome: "duplicar_objeto",
    titulo: "Duplicar objeto",
    descricao:
      "Cria uma cópia de um objeto primitivo, extrusão ou revolução, deslocada por 'deslocamento'. Para duplicar uma booleana, duplique os operandos e crie outra booleana.",
    schema: {
      cena_id: campoCenaId,
      objeto_id: campoObjetoId,
      deslocamento: Vetor3.default([1, 0, 0]).describe("Deslocamento [x, y, z] da cópia"),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const origem = acharObjeto(cena, a.objeto_id);
      if (origem.origem.tipo === "booleana") {
        throw new Error("Não é possível duplicar booleana diretamente; duplique os operandos e refaça a operação");
      }
      const copia = structuredClone(origem);
      copia.id = novoId("obj");
      copia.nome = nomeLivre(cena, `${origem.nome}_copia`);
      copia.transformacao.posicao = origem.transformacao.posicao.map((v, i) => v + a.deslocamento[i]) as typeof copia.transformacao.posicao;
      cena.objetos.push(copia);
      await salvarCena(cena);
      return texto({ objeto_id: copia.id, nome: copia.nome, posicao: copia.transformacao.posicao });
    },
  }),

  definir({
    nome: "apagar_objeto",
    titulo: "Apagar objeto",
    descricao:
      "Apaga um objeto da cena. Exige confirmar=true. Não apaga objetos usados por uma booleana: apague a booleana antes.",
    destrutiva: true,
    schema: {
      cena_id: campoCenaId,
      objeto_id: campoObjetoId,
      confirmar: z.literal(true).describe("Deve ser exatamente true"),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      acharObjeto(cena, a.objeto_id);
      const usadoPor = cena.objetos.find(
        (o) => o.origem.tipo === "booleana" && (o.origem.a === a.objeto_id || o.origem.b === a.objeto_id),
      );
      if (usadoPor) throw new Error(`O objeto é operando da booleana "${usadoPor.nome}". Apague-a antes.`);
      cena.objetos = cena.objetos.filter((o) => o.id !== a.objeto_id);
      await salvarCena(cena);
      return texto(`Objeto ${a.objeto_id} apagado da cena ${a.cena_id}`);
    },
  }),
];
