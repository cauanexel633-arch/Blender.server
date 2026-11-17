import { z } from "zod";
import {
  gerarGlbDaCena,
  gerarObj,
  gerarStl,
  inspecionarCena,
  malhasParaExportar,
  resumoExportacao,
} from "../geometria/exportar.js";
import { renderizarCena } from "../render/renderizar.js";
import { LIMITE_ARQUIVO_BYTES, publicarExportacao } from "../armazenamento/arquivos.js";
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
      "Exporta a cena em GLB (web, jogos, com cores e texturas), STL (impressão 3D, binário ou ASCII) ou OBJ (sem materiais). " +
      "Use escala para trocar a unidade (ex.: escala 0.1 de mm para cm) e base_no_chao=true para assentar o modelo em y=0 antes de imprimir ou publicar. " +
      "Retorna um link de download temporário (1 hora) com o arquivo, além de resumo de triângulos, dimensões finais e avisos. Sem armazenamento configurado, devolve o arquivo inline (limite de ~3,5 MB).",
    somenteLeitura: true,
    schema: {
      cena_id: campoCenaId,
      formato: z.enum(["glb", "stl", "obj"]),
      stl_ascii: z.boolean().default(false).describe("Só para STL: true gera texto em vez de binário"),
      escala: z
        .number()
        .positive()
        .max(1000)
        .default(1)
        .describe("Multiplica todas as coordenadas. Ex.: 0.1 converte mm para cm; 0.001 converte mm para m"),
      base_no_chao: z
        .boolean()
        .default(false)
        .describe("Move o modelo para que a menor altura fique em y = 0. Recomendado para impressão e web"),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const opcoes = { escala: a.escala, baseNoChao: a.base_no_chao };
      const resumo = resumoExportacao(malhasParaExportar(cena, opcoes));
      let dados: Buffer;
      let mime: string;
      let ext: string;
      if (a.formato === "glb") {
        dados = await gerarGlbDaCena(cena, opcoes);
        mime = "application/octet-stream";
        ext = "glb";
      } else if (a.formato === "stl") {
        dados = gerarStl(cena, a.stl_ascii ? "ascii" : "binario", opcoes);
        mime = "application/octet-stream";
        ext = "stl";
      } else {
        dados = Buffer.from(gerarObj(cena, opcoes), "utf8");
        mime = "text/plain";
        ext = "obj";
      }
      if (dados.length > LIMITE_ARQUIVO_BYTES) {
        throw new Error(
          `Arquivo com ${(dados.length / 1e6).toFixed(1)} MB (${resumo.triangulos} triângulos) excede o limite de ${LIMITE_ARQUIVO_BYTES / 1e6} MB. ` +
            "Reduza `segmentos` nas primitivas e nas revoluções, ou exporte em STL binário.",
        );
      }
      // Com Supabase configurado, o arquivo vai para o Storage e o cliente recebe um link.
      // Sem ele, volta como recurso inline, limitado pelo tamanho da resposta MCP.
      const link = await publicarExportacao(`${cena.id}.${ext}`, dados, mime);
      if (!link && dados.length > LIMITE_INLINE_BYTES) {
        throw new Error(
          `Arquivo com ${(dados.length / 1e6).toFixed(1)} MB excede o limite inline de ~3,5 MB e o armazenamento não está configurado. ` +
            "Reduza `segmentos` ou exporte em STL binário.",
        );
      }
      const nome = cena.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "modelo";
      const relatorio = {
        arquivo: `${nome}.${ext}`,
        formato: a.formato,
        bytes: dados.length,
        objetos: resumo.objetos,
        triangulos: resumo.triangulos,
        dimensoes: resumo.dimensoes,
        menor_y: resumo.menor_y,
        escala_aplicada: a.escala,
        base_no_chao: a.base_no_chao,
        avisos: resumo.avisos,
      };
      if (link) {
        return [
          {
            type: "text",
            text: JSON.stringify({ ...relatorio, download_url: link.url, link_expira_em: link.expira_em }, null, 2),
          },
        ];
      }
      return [
        {
          type: "resource",
          resource: { uri: `bender://${cena.id}/${nome}.${ext}`, mimeType: mime, blob: dados.toString("base64") },
        },
        { type: "text", text: JSON.stringify(relatorio, null, 2) },
      ];
    },
  }),
];
