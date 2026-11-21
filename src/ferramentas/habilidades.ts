import { z } from "zod";
import { AREAS, HABILIDADES, textoDaArea } from "../habilidades/areas.js";
import { definir, texto } from "./tipos.js";

export const ferramentasHabilidades = [
  definir({
    nome: "consultar_habilidades",
    titulo: "Consultar habilidades",
    descricao:
      "Devolve o guia profissional de uma área antes de criar: modelagem3d, impressao3d, animacao3d, desenho2d, pixelart, vfx, interface ou audio. Use ao começar um trabalho nessa área para seguir o fluxo, as medidas e a checagem finais. Sem área, lista as áreas.",
    somenteLeitura: true,
    schema: {
      area: z.enum(AREAS).optional().describe("Área do trabalho. Se omitida, lista as áreas disponíveis"),
    },
    executar: async ({ area }) => {
      if (!area) {
        return texto({
          areas: AREAS.map((a) => ({ area: a, titulo: HABILIDADES[a].titulo })),
          aviso: "Chame de novo com a área do trabalho para ver o guia completo.",
        });
      }
      return texto(textoDaArea(area));
    },
  }),
];
