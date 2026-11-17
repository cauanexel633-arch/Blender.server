import { z } from "zod";
import { publicarExportacao, LIMITE_ARQUIVO_BYTES } from "../armazenamento/arquivos.js";
import { desenhoParaSvg } from "../desenho2d/svg.js";
import { rasterizarSvg } from "../desenho2d/render.js";
import { obterLojaDesenhos } from "../desenho2d/loja.js";
import { CorOuNenhum, Desenho, Elemento } from "../desenho2d/tipos.js";
import { Cor, Ponto2 } from "../geometria/tipos.js";
import { baixarImagem } from "../web/busca.js";
import { novoId } from "./comum.js";
import { definir, texto, type Conteudo } from "./tipos.js";

const campoDesenhoId = z.string().min(1).describe("ID do desenho (retornado por criar_desenho)");
const campoElementoId = z.string().min(1).describe("ID do elemento (retornado por adicionar_forma, adicionar_imagem ou adicionar_pixelart)");
const campoConfirmar = z
  .boolean()
  .refine((v) => v === true, { message: "Use true para confirmar" })
  .describe("Deve ser exatamente true para confirmar");

const MAX_ELEMENTOS = 2000;
const MAX_IMAGENS = 20;
const agora = () => new Date().toISOString();

async function carregarDesenho(id: string): Promise<Desenho> {
  const desenho = await obterLojaDesenhos().obter(id);
  if (!desenho) throw new Error(`Desenho "${id}" não encontrado. Use listar_desenhos para ver os disponíveis.`);
  return desenho;
}

async function salvarDesenho(desenho: Desenho): Promise<void> {
  desenho.atualizada_em = agora();
  await obterLojaDesenhos().salvar(desenho);
}

function acharElemento(desenho: Desenho, id: string): Elemento {
  const elemento = desenho.elementos.find((e) => e.id === id);
  if (!elemento) throw new Error(`Elemento "${id}" não existe no desenho "${desenho.id}"`);
  return elemento;
}

function adicionar(desenho: Desenho, elemento: Elemento): string {
  if (desenho.elementos.length >= MAX_ELEMENTOS) {
    throw new Error(`O desenho já tem ${MAX_ELEMENTOS} elementos. Apague alguns ou crie outro desenho.`);
  }
  desenho.elementos.push(elemento);
  return elemento.id;
}

/** Baixa as imagens do desenho uma vez e devolve URL → data URI, para o SVG ficar autocontido. */
async function resolverImagens(desenho: Desenho): Promise<Map<string, string>> {
  const urls = [...new Set(desenho.elementos.filter((e) => e.tipo === "imagem" && e.url).map((e) => e.url!))];
  if (urls.length > MAX_IMAGENS) throw new Error(`O desenho usa ${urls.length} imagens. O limite é ${MAX_IMAGENS}.`);
  const mapa = new Map<string, string>();
  for (const url of urls) {
    const imagem = await baixarImagem(url);
    mapa.set(url, `data:${imagem.mime};base64,${imagem.dados.toString("base64")}`);
  }
  return mapa;
}

const resumoDesenho = (d: Desenho) => ({
  desenho_id: d.id,
  nome: d.nome,
  largura: d.largura,
  altura: d.altura,
  fundo: d.fundo ?? "transparente",
  elementos: d.elementos.length,
  atualizada_em: d.atualizada_em,
});

export const ferramentasDesenho = [
  definir({
    nome: "criar_desenho",
    titulo: "Criar desenho 2D",
    descricao:
      "Cria uma tela 2D para desenhos, interfaces, pixel art e ilustrações. Coordenadas em pixels, origem no canto superior esquerdo, y cresce para baixo. Depois adicione formas, texto, imagens ou pixel art e use renderizar_desenho para conferir.",
    schema: {
      nome: z.string().min(1).max(80).describe("Nome do desenho, ex.: 'Tela de login'"),
      largura: z.number().int().min(1).max(4000).default(800).describe("Largura em pixels"),
      altura: z.number().int().min(1).max(4000).default(600).describe("Altura em pixels"),
      fundo: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$|^transparente$/, "Use #rrggbb ou transparente")
        .default("#ffffff")
        .describe("Cor de fundo #rrggbb, ou 'transparente' (use para ícones e sprites)"),
    },
    executar: async (a) => {
      const momento = agora();
      const desenho: Desenho = {
        id: novoId("des"),
        nome: a.nome,
        largura: a.largura,
        altura: a.altura,
        fundo: a.fundo === "transparente" ? null : a.fundo,
        elementos: [],
        criada_em: momento,
        atualizada_em: momento,
      };
      await obterLojaDesenhos().salvar(desenho);
      return texto(resumoDesenho(desenho));
    },
  }),

  definir({
    nome: "listar_desenhos",
    titulo: "Listar desenhos 2D",
    descricao: "Lista os desenhos 2D salvos, com ID, nome, tamanho e quantidade de elementos.",
    somenteLeitura: true,
    schema: {},
    executar: async () => {
      const desenhos = await obterLojaDesenhos().listar();
      return texto(desenhos.map(resumoDesenho));
    },
  }),

  definir({
    nome: "obter_desenho",
    titulo: "Obter desenho 2D",
    descricao: "Devolve o desenho completo, com todos os elementos, seus IDs e a ordem de empilhamento (o último fica por cima).",
    somenteLeitura: true,
    schema: { desenho_id: campoDesenhoId },
    executar: async ({ desenho_id }) => texto(await carregarDesenho(desenho_id)),
  }),

  definir({
    nome: "apagar_desenho",
    titulo: "Apagar desenho 2D",
    descricao: "Apaga um desenho e todos os seus elementos. Irreversível: exige confirmar=true e só deve ser usada quando o usuário pedir.",
    destrutiva: true,
    schema: { desenho_id: campoDesenhoId, confirmar: campoConfirmar },
    executar: async ({ desenho_id }) => {
      const apagou = await obterLojaDesenhos().apagar(desenho_id);
      if (!apagou) throw new Error(`Desenho "${desenho_id}" não encontrado`);
      return texto({ apagado: desenho_id });
    },
  }),

  definir({
    nome: "adicionar_forma",
    titulo: "Adicionar forma 2D",
    descricao:
      "Adiciona uma forma ao desenho. Tipos: retangulo (x, y, largura, altura), elipse (x, y, largura, altura: caixa delimitadora), linha (x, y até x2, y2), poligono (pontos [[x, y], ...], mínimo 3) e texto (x, y é a linha de base do primeiro texto; \\n quebra linhas). " +
      "Cores em #rrggbb; 'nenhum' tira o preenchimento ou o contorno. Padrão: preenchimento #cccccc, sem contorno.",
    schema: {
      desenho_id: campoDesenhoId,
      tipo: z.enum(["retangulo", "elipse", "linha", "poligono", "texto"]),
      nome: z.string().max(80).optional(),
      x: z.number().default(0),
      y: z.number().default(0),
      largura: z.number().positive().optional(),
      altura: z.number().positive().optional(),
      x2: z.number().optional().describe("Só para linha: X do ponto final"),
      y2: z.number().optional().describe("Só para linha: Y do ponto final"),
      pontos: z.array(Ponto2).min(3).max(500).optional().describe("Só para poligono: [[x, y], ...]"),
      texto: z.string().max(2000).optional().describe("Só para texto"),
      tamanho_fonte: z.number().positive().max(1000).optional().describe("Tamanho da fonte em pixels (padrão 16)"),
      alinhamento: z.enum(["esquerda", "centro", "direita"]).optional(),
      preenchimento: CorOuNenhum.optional().describe("Cor de preenchimento; no texto, é a cor do texto"),
      contorno: CorOuNenhum.optional(),
      espessura: z.number().min(0).max(200).optional().describe("Espessura do contorno ou da linha, em pixels"),
      raio_canto: z.number().min(0).optional().describe("Só para retangulo: arredondamento dos cantos"),
      opacidade: z.number().min(0).max(1).optional(),
      rotacao: z.number().optional().describe("Graus, em torno do centro do elemento"),
    },
    executar: async (a) => {
      const desenho = await carregarDesenho(a.desenho_id);
      const exigir = (ok: unknown, msg: string) => {
        if (!ok) throw new Error(msg);
      };
      if (a.tipo === "retangulo" || a.tipo === "elipse") {
        exigir(a.largura !== undefined && a.altura !== undefined, `${a.tipo} precisa de largura e altura`);
      }
      if (a.tipo === "linha") exigir(a.x2 !== undefined && a.y2 !== undefined, "linha precisa de x2 e y2");
      if (a.tipo === "poligono") exigir(a.pontos && a.pontos.length >= 3, "poligono precisa de pelo menos 3 pontos");
      if (a.tipo === "texto") exigir(a.texto !== undefined, "texto precisa do campo texto");

      const id = adicionar(desenho, {
        id: novoId("el"),
        nome: a.nome,
        tipo: a.tipo,
        x: a.x,
        y: a.y,
        largura: a.largura,
        altura: a.altura,
        x2: a.x2,
        y2: a.y2,
        pontos: a.pontos,
        texto: a.texto,
        tamanho_fonte: a.tamanho_fonte,
        alinhamento: a.alinhamento,
        preenchimento: a.preenchimento,
        contorno: a.contorno,
        espessura: a.espessura,
        raio_canto: a.raio_canto,
        opacidade: a.opacidade,
        rotacao: a.rotacao,
        visivel: true,
      });
      await salvarDesenho(desenho);
      return texto({ elemento_id: id, tipo: a.tipo, elementos_no_desenho: desenho.elementos.length });
    },
  }),

  definir({
    nome: "adicionar_imagem",
    titulo: "Adicionar imagem 2D",
    descricao:
      "Coloca uma imagem PNG ou JPEG pública no desenho, esticada para largura × altura. A imagem é baixada na hora de renderizar ou exportar. Use para ícones, fotos de referência e fundos.",
    schema: {
      desenho_id: campoDesenhoId,
      url: z.string().url().max(2000).describe("URL pública http(s) de uma imagem PNG ou JPEG"),
      x: z.number().default(0),
      y: z.number().default(0),
      largura: z.number().positive(),
      altura: z.number().positive(),
      opacidade: z.number().min(0).max(1).optional(),
      rotacao: z.number().optional(),
      nome: z.string().max(80).optional(),
    },
    executar: async (a) => {
      const desenho = await carregarDesenho(a.desenho_id);
      const protocolo = new URL(a.url).protocol;
      if (protocolo !== "http:" && protocolo !== "https:") throw new Error("A URL da imagem precisa ser http ou https");
      const id = adicionar(desenho, {
        id: novoId("el"),
        nome: a.nome,
        tipo: "imagem",
        x: a.x,
        y: a.y,
        largura: a.largura,
        altura: a.altura,
        url: a.url,
        opacidade: a.opacidade,
        rotacao: a.rotacao,
        visivel: true,
      });
      await salvarDesenho(desenho);
      return texto({ elemento_id: id, elementos_no_desenho: desenho.elementos.length });
    },
  }),

  definir({
    nome: "adicionar_pixelart",
    titulo: "Adicionar pixel art",
    descricao:
      "Desenha pixel art a partir de uma grade de texto. Cada linha de 'grade' é uma linha de pixels; cada caractere é um símbolo da 'paleta'. " +
      "O símbolo '.' é transparente e não precisa estar na paleta. Exemplo: grade ['..##..', '.#oo#.'] com paleta [{simbolo:'#', cor:'#000000'}, {simbolo:'o', cor:'#ff0000'}]. " +
      "tamanho_pixel é o lado de cada pixel na tela (padrão 1). Para sprites de 16x16 use renderizar_desenho com escala 4 ou mais.",
    schema: {
      desenho_id: campoDesenhoId,
      x: z.number().int().default(0).describe("Posição do canto superior esquerdo, em pixels"),
      y: z.number().int().default(0),
      grade: z.array(z.string().max(512)).min(1).max(512).describe("Linhas de símbolos, uma string por linha de pixels"),
      paleta: z
        .array(z.object({ simbolo: z.string().length(1), cor: Cor }))
        .min(1)
        .max(64)
        .describe("Símbolo de um caractere e cor #rrggbb de cada um"),
      tamanho_pixel: z.number().int().min(1).max(200).default(1).describe("Lado de cada pixel na tela, em pixels"),
      nome: z.string().max(80).optional(),
    },
    executar: async (a) => {
      const desenho = await carregarDesenho(a.desenho_id);
      if (a.paleta.some((p) => p.simbolo === ".")) throw new Error("O símbolo '.' é reservado para transparente");
      const simbolosValidos = new Set(a.paleta.map((p) => p.simbolo));
      const desconhecidos = new Set<string>();
      for (const linha of a.grade) {
        for (const c of linha) if (c !== "." && !simbolosValidos.has(c)) desconhecidos.add(c);
      }
      if (desconhecidos.size > 0) {
        throw new Error(`Símbolos sem cor na paleta: ${[...desconhecidos].join(", ")}. Adicione-os em paleta ou troque por '.'`);
      }
      const id = adicionar(desenho, {
        id: novoId("el"),
        nome: a.nome,
        tipo: "pixelart",
        x: a.x,
        y: a.y,
        grade: a.grade,
        paleta: a.paleta,
        tamanho_pixel: a.tamanho_pixel,
        visivel: true,
      });
      await salvarDesenho(desenho);
      const colunas = Math.max(...a.grade.map((l) => l.length));
      return texto({
        elemento_id: id,
        largura_px: colunas * a.tamanho_pixel,
        altura_px: a.grade.length * a.tamanho_pixel,
        elementos_no_desenho: desenho.elementos.length,
      });
    },
  }),

  definir({
    nome: "editar_elemento",
    titulo: "Editar elemento 2D",
    descricao:
      "Altera propriedades de um elemento sem recriá-lo: posição, tamanho, texto, cores, espessura, opacidade, rotação ou visibilidade. Só os campos enviados mudam. Para mudar pixels de pixel art, apague e recrie o elemento.",
    schema: {
      desenho_id: campoDesenhoId,
      elemento_id: campoElementoId,
      nome: z.string().max(80).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      largura: z.number().positive().optional(),
      altura: z.number().positive().optional(),
      x2: z.number().optional(),
      y2: z.number().optional(),
      texto: z.string().max(2000).optional(),
      tamanho_fonte: z.number().positive().max(1000).optional(),
      alinhamento: z.enum(["esquerda", "centro", "direita"]).optional(),
      preenchimento: CorOuNenhum.optional(),
      contorno: CorOuNenhum.optional(),
      espessura: z.number().min(0).max(200).optional(),
      raio_canto: z.number().min(0).optional(),
      opacidade: z.number().min(0).max(1).optional(),
      rotacao: z.number().optional(),
      visivel: z.boolean().optional(),
    },
    executar: async (a) => {
      const desenho = await carregarDesenho(a.desenho_id);
      const elemento = acharElemento(desenho, a.elemento_id);
      const { desenho_id: _d, elemento_id: _e, ...campos } = a;
      for (const [chave, valor] of Object.entries(campos)) {
        if (valor !== undefined) (elemento as Record<string, unknown>)[chave] = valor;
      }
      await salvarDesenho(desenho);
      return texto({ elemento_id: elemento.id, tipo: elemento.tipo, atualizado: Object.keys(campos).filter((k) => campos[k as keyof typeof campos] !== undefined) });
    },
  }),

  definir({
    nome: "mover_camada",
    titulo: "Mover elemento na ordem de camadas",
    descricao: "Leva um elemento para a frente (fica por cima de todos) ou para trás (fica atrás de todos).",
    schema: {
      desenho_id: campoDesenhoId,
      elemento_id: campoElementoId,
      posicao: z.enum(["frente", "tras"]),
    },
    executar: async ({ desenho_id, elemento_id, posicao }) => {
      const desenho = await carregarDesenho(desenho_id);
      const elemento = acharElemento(desenho, elemento_id);
      desenho.elementos = desenho.elementos.filter((e) => e.id !== elemento_id);
      if (posicao === "frente") desenho.elementos.push(elemento);
      else desenho.elementos.unshift(elemento);
      await salvarDesenho(desenho);
      return texto({ elemento_id, posicao_na_pilha: posicao === "frente" ? "topo" : "base" });
    },
  }),

  definir({
    nome: "apagar_elemento",
    titulo: "Apagar elemento 2D",
    descricao: "Remove um elemento do desenho. Exige confirmar=true e só deve ser usada quando o usuário pedir.",
    destrutiva: true,
    schema: { desenho_id: campoDesenhoId, elemento_id: campoElementoId, confirmar: campoConfirmar },
    executar: async ({ desenho_id, elemento_id }) => {
      const desenho = await carregarDesenho(desenho_id);
      acharElemento(desenho, elemento_id);
      desenho.elementos = desenho.elementos.filter((e) => e.id !== elemento_id);
      await salvarDesenho(desenho);
      return texto({ apagado: elemento_id, elementos_no_desenho: desenho.elementos.length });
    },
  }),

  definir({
    nome: "renderizar_desenho",
    titulo: "Renderizar desenho 2D",
    descricao:
      "Gera uma imagem PNG do desenho para você VER o resultado. Use depois de mudanças grandes para conferir posição, cor e texto. Escala 2 ou mais deixa o texto e a pixel art mais nítidos.",
    somenteLeitura: true,
    schema: {
      desenho_id: campoDesenhoId,
      escala: z.number().int().min(1).max(4).default(1).describe("Multiplicador de resolução (1 a 4)"),
    },
    executar: async ({ desenho_id, escala }) => {
      const desenho = await carregarDesenho(desenho_id);
      const imagens = await resolverImagens(desenho);
      const svg = desenhoParaSvg(desenho, imagens);
      const png = await rasterizarSvg(svg, desenho.largura, desenho.altura, escala, desenho.fundo === null);
      const conteudo: Conteudo[] = [
        { type: "image", data: png.toString("base64"), mimeType: "image/png" },
        { type: "text", text: `Desenho ${desenho.id} (${desenho.nome}), ${desenho.largura}x${desenho.altura}, escala ${escala}` },
      ];
      return conteudo;
    },
  }),

  definir({
    nome: "exportar_desenho",
    titulo: "Exportar desenho 2D",
    descricao:
      "Exporta o desenho como PNG (raster, com transparência se o fundo for transparente) ou SVG (vetor, escalável, com imagens embutidas). " +
      "Com armazenamento configurado, devolve um link de download de 1 hora. Sem ele, devolve a imagem ou o SVG inline.",
    somenteLeitura: true,
    schema: {
      desenho_id: campoDesenhoId,
      formato: z.enum(["png", "svg"]),
      escala: z.number().int().min(1).max(4).default(1).describe("Só para PNG: multiplicador de resolução"),
    },
    executar: async ({ desenho_id, formato, escala }) => {
      const desenho = await carregarDesenho(desenho_id);
      const imagens = await resolverImagens(desenho);
      const svg = desenhoParaSvg(desenho, imagens);
      const nomeBase = desenho.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "desenho";

      let dados: Buffer;
      let mime: string;
      if (formato === "svg") {
        dados = Buffer.from(svg, "utf8");
        mime = "image/svg+xml";
      } else {
        dados = await rasterizarSvg(svg, desenho.largura, desenho.altura, escala, desenho.fundo === null);
        mime = "image/png";
      }
      if (dados.length > LIMITE_ARQUIVO_BYTES) {
        throw new Error(`Arquivo com ${(dados.length / 1e6).toFixed(1)} MB excede o limite de ${LIMITE_ARQUIVO_BYTES / 1e6} MB`);
      }

      const link = await publicarExportacao(`${desenho.id}.${formato}`, dados, mime);
      const relatorio = {
        arquivo: `${nomeBase}.${formato}`,
        formato,
        bytes: dados.length,
        largura_px: desenho.largura * (formato === "png" ? escala : 1),
        altura_px: desenho.altura * (formato === "png" ? escala : 1),
      };
      if (link) {
        return texto({ ...relatorio, download_url: link.url, link_expira_em: link.expira_em });
      }
      if (formato === "png") {
        return [
          { type: "image", data: dados.toString("base64"), mimeType: "image/png" },
          { type: "text", text: JSON.stringify(relatorio, null, 2) },
        ];
      }
      if (dados.length > 3_500_000) {
        throw new Error("SVG grande demais para entregar inline. Configure o armazenamento ou reduza o número de imagens.");
      }
      return [{ type: "text", text: svg }, { type: "text", text: JSON.stringify(relatorio, null, 2) }];
    },
  }),
];
