import { z } from "zod";
import { gerarGlbDaCena, gerarObj, gerarStl, inspecionarCena } from "../geometria/exportar.js";
import { renderizarCena } from "../render/renderizar.js";
import { definir, texto } from "./tipos.js";
import { campoCenaId, carregarCena } from "./comum.js";

const LIMITE_INLINE_BYTES = 3_500_000;

export const ferramentasVisao = [
  definir({
    nome: "renderizar_cena",
    titulo: "Renderizar cena",
    descricao:
      "Gera uma imagem PNG da cena para você VER o resultado (cores, texturas, proporções). Use depois de cada grande mudança para conferir e corrigir. Câmeras: frente, topo, lado, isometrica.",
    somenteLeitura: true,
    schema: {
      cena_id: campoCenaId,
      camera: z.enum(["frente", "topo", "lado", "isometrica"]).default("isometrica"),
      largura: z.number().int().min(200).max(1600).default(800),
      altura: z.number().int().min(200).max(1600).default(600),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const r = await renderizarCena(cena, a.camera, a.largura, a.altura);
      return [
        { type: "image", data: r.png.toString("base64"), mimeType: "image/png" },
        { type: "text", text: `Cena ${cena.id} (${cena.nome}), câmera ${r.camera}, ${r.largura}x${r.altura}` },
      ];
    },
  }),

  definir({
    nome: "inspecionar_cena",
    titulo: "Inspecionar cena",
    descricao:
      "Relatório numérico: dimensões e caixa delimitadora de cada objeto e do conjunto, volume, triângulos e avisos (ex.: malha aberta que não imprime). Use para checar medidas antes de exportar para impressão.",
    somenteLeitura: true,
    schema: { cena_id: campoCenaId },
    executar: async ({ cena_id }) => {
      const cena = await carregarCena(cena_id);
      return texto(inspecionarCena(cena));
    },
  }),

  definir({
    nome: "exportar_modelo",
    titulo: "Exportar modelo",
    descricao:
      "Exporta a cena em GLB (web, jogos, com cores e texturas), STL (impressão 3D, binário ou ASCII) ou OBJ (sem materiais). Retorna o arquivo como recurso. Limite inline de ~3,5 MB.",
    somenteLeitura: true,
    schema: {
      cena_id: campoCenaId,
      formato: z.enum(["glb", "stl", "obj"]),
      stl_ascii: z.boolean().default(false).describe("Só para STL: true gera texto em vez de binário"),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      let dados: Buffer;
      let mime: string;
      let ext: string;
      if (a.formato === "glb") {
        dados = await gerarGlbDaCena(cena);
        mime = "model/gltf-binary";
        ext = "glb";
      } else if (a.formato === "stl") {
        dados = gerarStl(cena, a.stl_ascii ? "ascii" : "binario");
        mime = "model/stl";
        ext = "stl";
      } else {
        dados = Buffer.from(gerarObj(cena), "utf8");
        mime = "model/obj";
        ext = "obj";
      }
      if (dados.length > LIMITE_INLINE_BYTES) {
        throw new Error(
          `Arquivo com ${(dados.length / 1e6).toFixed(1)} MB excede o limite inline. Reduza a resolução (segmentos) ou use STL binário.`,
        );
      }
      const nome = cena.nome.replace(/[^\w-]+/g, "_") || "modelo";
      return [
        {
          type: "resource",
          resource: { uri: `bender://${cena.id}/${nome}.${ext}`, mimeType: mime, blob: dados.toString("base64") },
        },
        { type: "text", text: `${nome}.${ext} — ${dados.length} bytes` },
      ];
    },
  }),
];
