import { z } from "zod";
import { obterLoja } from "../armazenamento/loja.js";
import { definir } from "./tipos.js";
import { campoCenaId, carregarCena, novaCena, resumoObjeto, salvarCena } from "./comum.js";

export const ferramentasCena = [
  definir({
    nome: "criar_cena",
    titulo: "Criar cena",
    descricao:
      "Cria uma cena 3D vazia e retorna seu cena_id. Todas as outras ferramentas de modelagem usam esse ID. Chame isso antes de modelar.",
    schema: { nome: z.string().min(1).max(80).describe("Nome da cena, ex.: 'Caneca'") },
    executar: async ({ nome }) => {
      const cena = novaCena(nome);
      await salvarCena(cena);
      return [{ type: "text", text: JSON.stringify({ cena_id: cena.id, nome: cena.nome }, null, 2) }];
    },
  }),

  definir({
    nome: "listar_cenas",
    titulo: "Listar cenas",
    descricao: "Lista as cenas salvas com ID, nome, quantidade de objetos e data da última alteração.",
    somenteLeitura: true,
    schema: {},
    executar: async () => {
      const cenas = await obterLoja().listar();
      const resumo = cenas.map((c) => ({
        cena_id: c.id,
        nome: c.nome,
        objetos: c.objetos.length,
        atualizada_em: c.atualizada_em,
      }));
      return [{ type: "text", text: JSON.stringify(resumo, null, 2) }];
    },
  }),

  definir({
    nome: "obter_cena",
    titulo: "Obter cena",
    descricao:
      "Retorna a estrutura da cena: todos os objetos com IDs, nomes, tipos, transformações e materiais. Use antes de editar para conhecer os IDs.",
    somenteLeitura: true,
    schema: { cena_id: campoCenaId },
    executar: async ({ cena_id }) => {
      const cena = await carregarCena(cena_id);
      return [
        {
          type: "text",
          text: JSON.stringify(
            { cena_id: cena.id, nome: cena.nome, objetos: cena.objetos.map(resumoObjeto) },
            null,
            2,
          ),
        },
      ];
    },
  }),

  definir({
    nome: "apagar_cena",
    titulo: "Apagar cena",
    descricao:
      "Apaga uma cena inteira e todos os seus objetos. Ação irreversível: exige confirmar=true e só deve ser usada quando o usuário pedir.",
    destrutiva: true,
    schema: {
      cena_id: campoCenaId,
      confirmar: z.literal(true).describe("Deve ser exatamente true para confirmar a exclusão"),
    },
    executar: async ({ cena_id }) => {
      const apagou = await obterLoja().apagar(cena_id);
      return [{ type: "text", text: apagou ? `Cena ${cena_id} apagada` : `Cena ${cena_id} não existia` }];
    },
  }),
];
