import { z } from "zod";
import { publicarExportacao, LIMITE_ARQUIVO_BYTES } from "../armazenamento/arquivos.js";
import { aplicarQuadro } from "../animacao/avaliar.js";
import { gerarGif } from "../animacao/gif.js";
import { LIMITE_PIXELS_TOTAIS, LIMITE_QUADROS, renderizarFolhaPng, renderizarQuadros } from "../animacao/quadros.js";
import { desenhoParaSvg } from "../desenho2d/svg.js";
import { Chave, INTERPOLACOES, PROPRIEDADES_ANIMAVEIS } from "../desenho2d/tipos.js";
import { carregarDesenho, resolverImagens, salvarDesenho } from "./desenho.js";
import { definir, texto, type Conteudo } from "./tipos.js";

const campoDesenhoId = z.string().min(1).describe("ID do desenho (retornado por criar_desenho)");

export const ferramentasAnimacao = [
  definir({
    nome: "configurar_animacao",
    titulo: "Configurar animação 2D",
    descricao:
      "Define a taxa de quadros (fps) e o número de quadros da animação do desenho. Os quadros são numerados a partir de 0. Use antes de animar, ou para estender a duração.",
    schema: {
      desenho_id: campoDesenhoId,
      fps: z.number().int().min(1).max(60).optional().describe("Quadros por segundo (padrão 12)"),
      duracao_quadros: z.number().int().min(1).max(600).optional().describe("Número total de quadros"),
    },
    executar: async ({ desenho_id, fps, duracao_quadros }) => {
      const desenho = await carregarDesenho(desenho_id);
      if (fps !== undefined) desenho.fps = fps;
      if (duracao_quadros !== undefined) desenho.duracao_quadros = duracao_quadros;
      await salvarDesenho(desenho);
      return texto({ desenho_id, fps: desenho.fps, duracao_quadros: desenho.duracao_quadros, duracao_segundos: desenho.duracao_quadros / desenho.fps });
    },
  }),

  definir({
    nome: "animar_propriedade",
    titulo: "Criar keyframe",
    descricao:
      "Define o valor de uma propriedade de um elemento em um quadro (keyframe). Entre dois keyframes da mesma propriedade o valor é interpolado: " +
      "'linear' (constante de velocidade), 'suave' (começa e termina devagar) ou 'constante' (mantém o valor até o próximo keyframe). " +
      "Propriedades: x, y, largura, altura, opacidade (0 a 1) e rotacao (graus). Se o quadro passar da duração, a duração aumenta sozinha.",
    schema: {
      desenho_id: campoDesenhoId,
      elemento_id: z.string().min(1).describe("ID do elemento a animar"),
      propriedade: z.enum(PROPRIEDADES_ANIMAVEIS),
      quadro: z.number().int().min(0).max(599).describe("Quadro do keyframe (0 é o primeiro)"),
      valor: z.number().describe("Valor da propriedade nesse quadro"),
      interpolacao: z.enum(INTERPOLACOES).default("linear"),
    },
    executar: async (a) => {
      const desenho = await carregarDesenho(a.desenho_id);
      if (!desenho.elementos.some((e) => e.id === a.elemento_id)) {
        throw new Error(`Elemento "${a.elemento_id}" não existe no desenho "${a.desenho_id}"`);
      }
      const chave: Chave = {
        elemento_id: a.elemento_id,
        propriedade: a.propriedade,
        quadro: a.quadro,
        valor: a.valor,
        interpolacao: a.interpolacao,
      };
      // Um keyframe por elemento, propriedade e quadro: o novo substitui o anterior.
      desenho.chaves = desenho.chaves.filter(
        (c) => !(c.elemento_id === chave.elemento_id && c.propriedade === chave.propriedade && c.quadro === chave.quadro),
      );
      desenho.chaves.push(chave);
      const cresceu = a.quadro + 1 > desenho.duracao_quadros;
      if (cresceu) desenho.duracao_quadros = a.quadro + 1;
      await salvarDesenho(desenho);
      return texto({
        chaves_do_elemento: desenho.chaves.filter((c) => c.elemento_id === a.elemento_id).length,
        duracao_quadros: desenho.duracao_quadros,
        duracao_aumentou: cresceu,
      });
    },
  }),

  definir({
    nome: "apagar_chaves",
    titulo: "Apagar keyframes",
    descricao: "Remove os keyframes de um elemento. Com 'propriedade', remove só os dessa propriedade. Os valores voltam a ser os do próprio elemento.",
    schema: {
      desenho_id: campoDesenhoId,
      elemento_id: z.string().min(1),
      propriedade: z.enum(PROPRIEDADES_ANIMAVEIS).optional(),
    },
    executar: async ({ desenho_id, elemento_id, propriedade }) => {
      const desenho = await carregarDesenho(desenho_id);
      const antes = desenho.chaves.length;
      desenho.chaves = desenho.chaves.filter(
        (c) => !(c.elemento_id === elemento_id && (propriedade === undefined || c.propriedade === propriedade)),
      );
      const removidas = antes - desenho.chaves.length;
      if (removidas === 0) throw new Error("Nenhum keyframe encontrado para esse elemento");
      await salvarDesenho(desenho);
      return texto({ removidas, chaves_restantes: desenho.chaves.length });
    },
  }),

  definir({
    nome: "exportar_animacao",
    titulo: "Exportar animação 2D",
    descricao:
      "Exporta a animação do desenho como GIF animado (para web, redes e apresentações) ou como folha de sprites em PNG (todos os quadros numa grade, para jogos). " +
      "Usa o fps do desenho. Escolha um intervalo de quadros com quadro_inicial e quadro_final. Limite de 120 quadros por exportação. Com armazenamento configurado, devolve um link de 1 hora.",
    somenteLeitura: true,
    schema: {
      desenho_id: campoDesenhoId,
      formato: z.enum(["gif", "folha_png"]),
      escala: z.number().int().min(1).max(2).default(1).describe("Multiplicador de resolução (1 ou 2)"),
      quadro_inicial: z.number().int().min(0).default(0),
      quadro_final: z.number().int().min(0).optional().describe("Último quadro incluído; padrão é o último da animação"),
    },
    executar: async ({ desenho_id, formato, escala, quadro_inicial, quadro_final }) => {
      const desenho = await carregarDesenho(desenho_id);
      const fim = quadro_final ?? desenho.duracao_quadros - 1;
      if (fim < quadro_inicial) throw new Error("quadro_final precisa ser maior ou igual a quadro_inicial");
      const indices: number[] = [];
      for (let q = quadro_inicial; q <= fim; q++) indices.push(q);
      if (indices.length > LIMITE_QUADROS) {
        throw new Error(`A exportação tem ${indices.length} quadros. O limite é ${LIMITE_QUADROS}; use um intervalo menor.`);
      }
      const largura = desenho.largura * escala;
      const altura = desenho.altura * escala;
      if (largura * altura * indices.length > LIMITE_PIXELS_TOTAIS) {
        throw new Error("Animação grande demais para exportar nesta resolução. Reduza a escala ou o número de quadros.");
      }

      const imagens = await resolverImagens(desenho);
      const svgs = indices.map((q) => desenhoParaSvg(aplicarQuadro(desenho, q), imagens));
      const transparente = desenho.fundo === null;

      let dados: Buffer;
      let mime: string;
      let ext: string;
      if (formato === "gif") {
        const quadros = await renderizarQuadros(svgs, largura, altura, transparente);
        dados = gerarGif(quadros, 1000 / desenho.fps, 0);
        mime = "image/gif";
        ext = "gif";
      } else {
        dados = await renderizarFolhaPng(svgs, largura, altura);
        mime = "image/png";
        ext = "png";
      }
      if (dados.length > LIMITE_ARQUIVO_BYTES) {
        throw new Error(`Arquivo com ${(dados.length / 1e6).toFixed(1)} MB excede o limite. Reduza a escala ou os quadros.`);
      }

      const relatorio = {
        formato,
        quadros: indices.length,
        fps: desenho.fps,
        duracao_segundos: indices.length / desenho.fps,
        largura_px: largura,
        altura_px: altura,
        bytes: dados.length,
      };
      const link = await publicarExportacao(`${desenho.id}-${quadro_inicial}-${fim}.${ext}`, dados, mime);
      if (link) {
        return texto({ ...relatorio, download_url: link.url, link_expira_em: link.expira_em });
      }
      const conteudo: Conteudo[] = [
        { type: "image", data: dados.toString("base64"), mimeType: mime },
        { type: "text", text: JSON.stringify({ ...relatorio, aviso: "Armazenamento não configurado: arquivo devolvido inline" }, null, 2) },
      ];
      return conteudo;
    },
  }),
];
