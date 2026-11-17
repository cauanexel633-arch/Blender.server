import { z } from "zod";
import { LIMITE_QUADROS, LIMITE_PIXELS_TOTAIS } from "../animacao/quadros.js";
import { gerarGif } from "../animacao/gif.js";
import { PROPRIEDADES_3D, operandosDeBooleanas } from "../animacao/cena3d.js";
import { quantizarRgba } from "../animacao/quantizar.js";
import { LIMITE_ARQUIVO_BYTES, publicarExportacao } from "../armazenamento/arquivos.js";
import { gerarGlbDaCena } from "../geometria/exportar.js";
import { Vetor3 } from "../geometria/tipos.js";
import { renderizarQuadrosCena } from "../render/renderizar.js";
import { acharObjeto, campoCenaId, campoObjetoId, carregarCena, salvarCena } from "./comum.js";
import { definir, texto, type Conteudo } from "./tipos.js";

const INTERPOLACOES_3D = ["linear", "suave", "constante"] as const;

export const ferramentasAnimacao3d = [
  definir({
    nome: "configurar_animacao_3d",
    titulo: "Configurar animação 3D",
    descricao:
      "Define fps e número de quadros da animação de uma cena 3D. Quadros começam em 0. Chame antes de animar ou para estender a duração.",
    schema: {
      cena_id: campoCenaId,
      fps: z.number().int().min(1).max(60).optional().describe("Quadros por segundo (padrão 24)"),
      duracao_quadros: z.number().int().min(1).max(600).optional().describe("Número total de quadros"),
    },
    executar: async ({ cena_id, fps, duracao_quadros }) => {
      const cena = await carregarCena(cena_id);
      const anim = cena.animacao ?? { fps: 24, duracao_quadros: 48, chaves: [] };
      if (fps !== undefined) anim.fps = fps;
      if (duracao_quadros !== undefined) anim.duracao_quadros = duracao_quadros;
      cena.animacao = anim;
      await salvarCena(cena);
      return texto({ cena_id, fps: anim.fps, duracao_quadros: anim.duracao_quadros, duracao_segundos: anim.duracao_quadros / anim.fps });
    },
  }),

  definir({
    nome: "animar_objeto",
    titulo: "Criar keyframe 3D",
    descricao:
      "Define a posição, a rotação ou a escala de um objeto em um quadro (keyframe). Entre dois keyframes da mesma propriedade o valor é interpolado: " +
      "'linear', 'suave' (começa e termina devagar) ou 'constante' (mantém até o próximo keyframe). " +
      "valor é [x, y, z]: em unidades para posicao, em graus (ordem XYZ) para rotacao_graus, e fatores para escala. " +
      "Se o quadro passar da duração, a duração aumenta sozinha. Operandos de booleana não podem ser animados: anime a booleana.",
    schema: {
      cena_id: campoCenaId,
      objeto_id: campoObjetoId,
      propriedade: z.enum(PROPRIEDADES_3D),
      quadro: z.number().int().min(0).max(599).describe("Quadro do keyframe (0 é o primeiro)"),
      valor: Vetor3.describe("Valor [x, y, z]"),
      interpolacao: z.enum(INTERPOLACOES_3D).default("linear"),
    },
    executar: async (a) => {
      const cena = await carregarCena(a.cena_id);
      const objeto = acharObjeto(cena, a.objeto_id);
      if (operandosDeBooleanas(cena).has(objeto.id)) {
        throw new Error(`"${objeto.nome}" é operando de uma booleana. Anime a booleana, que é o resultado visível.`);
      }
      const anim = cena.animacao ?? { fps: 24, duracao_quadros: 48, chaves: [] };
      // Um keyframe por objeto, propriedade e quadro: o novo substitui o anterior.
      anim.chaves = anim.chaves.filter(
        (c) => !(c.objeto_id === objeto.id && c.propriedade === a.propriedade && c.quadro === a.quadro),
      );
      anim.chaves.push({
        objeto_id: objeto.id,
        propriedade: a.propriedade,
        quadro: a.quadro,
        valor: a.valor,
        interpolacao: a.interpolacao,
      });
      const cresceu = a.quadro + 1 > anim.duracao_quadros;
      if (cresceu) anim.duracao_quadros = a.quadro + 1;
      cena.animacao = anim;
      await salvarCena(cena);
      return texto({
        chaves_do_objeto: anim.chaves.filter((c) => c.objeto_id === objeto.id).length,
        duracao_quadros: anim.duracao_quadros,
        duracao_aumentou: cresceu,
      });
    },
  }),

  definir({
    nome: "apagar_chaves_objeto",
    titulo: "Apagar keyframes 3D",
    descricao:
      "Remove os keyframes de um objeto. Com 'propriedade', remove só os dessa propriedade. A propriedade volta à pose guardada do objeto.",
    schema: {
      cena_id: campoCenaId,
      objeto_id: campoObjetoId,
      propriedade: z.enum(PROPRIEDADES_3D).optional(),
    },
    executar: async ({ cena_id, objeto_id, propriedade }) => {
      const cena = await carregarCena(cena_id);
      const anim = cena.animacao;
      if (!anim) throw new Error("A cena não tem animação");
      const antes = anim.chaves.length;
      anim.chaves = anim.chaves.filter(
        (c) => !(c.objeto_id === objeto_id && (propriedade === undefined || c.propriedade === propriedade)),
      );
      const removidas = antes - anim.chaves.length;
      if (removidas === 0) throw new Error("Nenhum keyframe encontrado para esse objeto");
      await salvarCena(cena);
      return texto({ removidas, chaves_restantes: anim.chaves.length });
    },
  }),

  definir({
    nome: "exportar_animacao_3d",
    titulo: "Exportar animação 3D",
    descricao:
      "Exporta a animação da cena 3D. 'gif' gera um GIF animado com a câmera escolhida (usa quadro_inicial e quadro_final, até 120 quadros). " +
      "'glb' gera um modelo glTF com a animação completa para Blender, Unity, Unreal ou visualizadores web (ignora o intervalo de quadros; escala e base_no_chao valem como em exportar_modelo). " +
      "Com armazenamento configurado, devolve um link de 1 hora.",
    somenteLeitura: true,
    schema: {
      cena_id: campoCenaId,
      formato: z.enum(["gif", "glb"]),
      camera: z.enum(["frente", "topo", "lado", "isometrica"]).default("isometrica"),
      largura: z.number().int().min(100).max(800).default(400).describe("Largura do GIF em pixels"),
      altura: z.number().int().min(100).max(800).default(300).describe("Altura do GIF em pixels"),
      quadro_inicial: z.number().int().min(0).default(0),
      quadro_final: z.number().int().min(0).optional().describe("Último quadro incluído; padrão é o último da animação"),
      escala: z.number().min(0.0001).max(1000).default(1).describe("Escala do GLB (ex.: 0.001 converte mm para m)"),
      base_no_chao: z.boolean().default(false).describe("No GLB, coloca a menor altura do modelo em y = 0 no quadro 0"),
    },
    executar: async (a): Promise<Conteudo[]> => {
      const cena = await carregarCena(a.cena_id);
      const anim = cena.animacao;
      if (!anim || anim.chaves.length === 0) {
        throw new Error("A cena não tem keyframes. Use animar_objeto antes de exportar.");
      }
      const fps = anim.fps;

      if (a.formato === "glb") {
        const dados = await gerarGlbDaCena(cena, { escala: a.escala, baseNoChao: a.base_no_chao });
        if (dados.length > LIMITE_ARQUIVO_BYTES) throw new Error("Arquivo GLB grande demais para exportar.");
        const relatorio = { formato: "glb", quadros: anim.duracao_quadros, fps, duracao_segundos: anim.duracao_quadros / fps, bytes: dados.length };
        const link = await publicarExportacao(`${cena.id}.glb`, dados, "application/octet-stream");
        if (link) return texto({ ...relatorio, download_url: link.url, link_expira_em: link.expira_em });
        return [
          { type: "text", text: JSON.stringify({ ...relatorio, aviso: "Armazenamento não configurado: arquivo devolvido inline" }, null, 2) },
          { type: "resource", resource: { uri: `${cena.id}.glb`, mimeType: "model/gltf-binary", blob: dados.toString("base64") } },
        ];
      }

      const fim = a.quadro_final ?? anim.duracao_quadros - 1;
      if (fim < a.quadro_inicial) throw new Error("quadro_final precisa ser maior ou igual a quadro_inicial");
      const indices: number[] = [];
      for (let q = a.quadro_inicial; q <= fim; q++) indices.push(q);
      if (indices.length > LIMITE_QUADROS) {
        throw new Error(`A exportação tem ${indices.length} quadros. O limite é ${LIMITE_QUADROS}; use um intervalo menor.`);
      }
      if (a.largura * a.altura * indices.length > LIMITE_PIXELS_TOTAIS) {
        throw new Error("Animação grande demais nesta resolução. Reduza a largura, a altura ou o número de quadros.");
      }

      const pixels = await renderizarQuadrosCena(cena, a.camera, a.largura, a.altura, indices);
      const quadros = pixels.map((p) => quantizarRgba(p, a.largura, a.altura));
      const dados = gerarGif(quadros, 1000 / fps, 0);
      if (dados.length > LIMITE_ARQUIVO_BYTES) throw new Error("GIF grande demais. Reduza a resolução ou os quadros.");

      const relatorio = {
        formato: "gif",
        quadros: indices.length,
        fps,
        duracao_segundos: indices.length / fps,
        largura_px: a.largura,
        altura_px: a.altura,
        camera: a.camera,
        bytes: dados.length,
      };
      const link = await publicarExportacao(`${cena.id}-${a.quadro_inicial}-${fim}.gif`, dados, "image/gif");
      if (link) return texto({ ...relatorio, download_url: link.url, link_expira_em: link.expira_em });
      return [
        { type: "image", data: dados.toString("base64"), mimeType: "image/gif" },
        { type: "text", text: JSON.stringify({ ...relatorio, aviso: "Armazenamento não configurado: arquivo devolvido inline" }, null, 2) },
      ];
    },
  }),
];

