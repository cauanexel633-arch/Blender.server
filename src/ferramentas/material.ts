import { z } from "zod";
import { Cor, Material, type Material as TipoMaterial } from "../geometria/tipos.js";
import { definir, texto } from "./tipos.js";
import { acharObjeto, campoCenaId, campoObjetoId, carregarCena, salvarCena } from "./comum.js";

export const ferramentasMaterial = [
  definir({
    nome: "definir_material",
    titulo: "Definir material",
    descricao:
      "Define cor e propriedades físicas (PBR) de um objeto: cor, metalico (0 a 1), rugosidade (0 a 1, 0 = espelho), opacidade (0 a 1) e emissiva (cor que brilha). Campos omitidos não mudam.",
    schema: {
      cena_id: campoCenaId,
      objeto_id: campoObjetoId,
      cor: Cor.optional(),
      metalico: z.number().min(0).max(1).optional(),
      rugosidade: z.number().min(0).max(1).optional(),
      opacidade: z.number().min(0).max(1).optional(),
      emissiva: Cor.optional(),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const obj = acharObjeto(cena, a.objeto_id);
      const atual = obj.material;
      obj.material = Material.parse({
        ...atual,
        cor: a.cor ?? atual.cor,
        metalico: a.metalico ?? atual.metalico,
        rugosidade: a.rugosidade ?? atual.rugosidade,
        opacidade: a.opacidade ?? atual.opacidade,
        emissiva: a.emissiva ?? atual.emissiva,
      });
      await salvarCena(cena);
      return texto({ objeto_id: obj.id, material: obj.material });
    },
  }),

  definir({
    nome: "aplicar_textura",
    titulo: "Aplicar textura",
    descricao:
      "Aplica uma textura ao objeto. tipo='procedural' gera um padrão (xadrez, listras, bolinhas, gradiente ou ruido) usando a cor do material e cor_secundaria. tipo='url' baixa uma imagem PNG/JPEG pública e a aplica. tipo='remover' tira a textura. 'escala' repete o padrão sobre a superfície.",
    schema: {
      cena_id: campoCenaId,
      objeto_id: campoObjetoId,
      tipo: z.enum(["procedural", "url", "remover"]),
      padrao: z.enum(["xadrez", "listras", "bolinhas", "gradiente", "ruido"]).optional(),
      cor_secundaria: Cor.optional(),
      url: z.url().optional().describe("URL pública de imagem PNG ou JPEG (tipo='url')"),
      escala: z.number().positive().max(50).optional(),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const obj = acharObjeto(cena, a.objeto_id);
      let textura: TipoMaterial["textura"];
      if (a.tipo === "remover") {
        textura = undefined;
      } else if (a.tipo === "procedural") {
        if (!a.padrao) throw new Error("Textura procedural exige 'padrao'");
        textura = {
          tipo: "procedural",
          padrao: a.padrao,
          cor_secundaria: a.cor_secundaria ?? "#ffffff",
          escala: a.escala ?? 4,
        };
      } else {
        if (!a.url) throw new Error("Textura por URL exige 'url'");
        textura = { tipo: "url", url: a.url, escala: a.escala ?? 1 };
      }
      obj.material = Material.parse({ ...obj.material, textura });
      await salvarCena(cena);
      return texto({ objeto_id: obj.id, textura: obj.material.textura ?? null });
    },
  }),
];
