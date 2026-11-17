import { z } from "zod";
import { lerPagina, pesquisarWeb } from "../web/busca.js";
import { definir, texto } from "./tipos.js";

export const ferramentasPesquisa = [
  definir({
    nome: "pesquisar_web",
    titulo: "Pesquisar na web",
    descricao:
      "Pesquisa na internet e devolve títulos, URLs e trechos. Use para achar referências (medidas reais, fotos, especificações, tutoriais). Depois use ler_pagina para detalhes.",
    somenteLeitura: true,
    schema: {
      consulta: z.string().min(2).max(300),
      quantidade: z.number().int().min(1).max(10).default(5),
    },
    executar: async (a) => texto(await pesquisarWeb(a.consulta, a.quantidade)),
  }),

  definir({
    nome: "ler_pagina",
    titulo: "Ler página",
    descricao:
      "Lê o texto de uma página pública (http/https) e devolve o conteúdo limpo, sem HTML. Endereços internos são bloqueados.",
    somenteLeitura: true,
    schema: {
      url: z.url(),
      max_caracteres: z.number().int().min(500).max(20000).default(6000),
    },
    executar: async (a) => texto(await lerPagina(a.url, a.max_caracteres)),
  }),
];
