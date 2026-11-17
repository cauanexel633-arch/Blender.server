import { beforeEach, describe, expect, it } from "vitest";
import { definirLojaDesenhos } from "../src/desenho2d/loja.js";
import { desenhoParaSvg } from "../src/desenho2d/svg.js";
import { Desenho, type Elemento } from "../src/desenho2d/tipos.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";

const base = (elementos: Elemento[] = [], fundo: string | null = "#ffffff"): Desenho => ({
  id: "des_t",
  nome: "Teste",
  largura: 100,
  altura: 50,
  fundo,
  elementos,
  criada_em: "2026-01-01T00:00:00.000Z",
  atualizada_em: "2026-01-01T00:00:00.000Z",
});

const el = (extra: Partial<Elemento> & { tipo: Elemento["tipo"] }): Elemento => ({
  id: "el_" + Math.random().toString(36).slice(2, 8),
  x: 0,
  y: 0,
  visivel: true,
  ...extra,
});

describe("SVG de desenho 2D", () => {
  it("fundo sólido vira um retângulo; fundo transparente não cria nenhum", () => {
    expect(desenhoParaSvg(base([], "#ff0000"))).toMatch(/<rect x="0" y="0" width="100" height="50" fill="#ff0000"\/>/);
    expect(desenhoParaSvg(base([], null))).not.toMatch(/<rect x="0" y="0"/);
  });

  it("retângulo e elipse usam a caixa delimitadora e cores 'nenhum' viram none", () => {
    const svg = desenhoParaSvg(
      base([
        el({ tipo: "retangulo", x: 10, y: 5, largura: 20, altura: 10, preenchimento: "#00ff00", contorno: "nenhum" }),
        el({ tipo: "elipse", x: 0, y: 0, largura: 40, altura: 20 }),
      ]),
    );
    expect(svg).toContain('x="10" y="5" width="20" height="10"');
    expect(svg).toContain('fill="#00ff00" stroke="none"');
    expect(svg).toContain('cx="20" cy="10" rx="20" ry="10"');
    expect(svg).toContain('fill="#cccccc"');
  });

  it("texto escapa caracteres especiais e quebra linhas com \\n", () => {
    const svg = desenhoParaSvg(base([el({ tipo: "texto", x: 5, y: 20, texto: "A & <B>\nlinha 2", tamanho_fonte: 10 })]));
    expect(svg).toContain("A &amp; &lt;B&gt;");
    expect(svg).toContain("linha 2");
    expect(svg).toContain('dy="12.5"');
  });

  it("elemento invisível não aparece no SVG", () => {
    const svg = desenhoParaSvg(base([el({ tipo: "retangulo", largura: 5, altura: 5, visivel: false })]));
    expect(svg).not.toContain("<rect x=\"0\" y=\"0\" width=\"5\"");
  });

  it("rotação usa o centro do elemento como eixo", () => {
    const svg = desenhoParaSvg(base([el({ tipo: "retangulo", x: 10, y: 10, largura: 20, altura: 10, rotacao: 45 })]));
    expect(svg).toContain('transform="rotate(45 20 15)"');
  });

  it("pixel art agrupa corridas do mesmo símbolo e ignora '.'", () => {
    const svg = desenhoParaSvg(
      base([
        el({
          tipo: "pixelart",
          x: 0,
          y: 0,
          grade: ["##..", "#..#"],
          paleta: [{ simbolo: "#", cor: "#000000" }],
          tamanho_pixel: 2,
        }),
      ]),
    );
    // Linha 0: uma corrida de 2 pixels (largura 4). Linha 1: dois pixels separados (2 retângulos de largura 2).
    const rects = svg.match(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="2" fill="#000000"\/>/g) ?? [];
    expect(rects).toHaveLength(3);
    expect(svg).toContain('width="4" height="2"');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it("imagem sem data URI carregado é omitida, com data URI vira <image>", () => {
    const semImagem = desenhoParaSvg(base([el({ tipo: "imagem", url: "https://x/y.png", largura: 10, altura: 10 })]));
    expect(semImagem).not.toContain("<image");
    const comImagem = desenhoParaSvg(
      base([el({ tipo: "imagem", url: "https://x/y.png", largura: 10, altura: 10 })]),
      new Map([["https://x/y.png", "data:image/png;base64,AAAA"]]),
    );
    expect(comImagem).toContain('href="data:image/png;base64,AAAA"');
  });
});

async function chamar(nome: string, args: Record<string, unknown> = {}): Promise<any> {
  const f = todasFerramentas.find((t) => t.nome === nome);
  if (!f) throw new Error(`ferramenta ${nome} não existe`);
  const conteudo: Conteudo[] = await f.executar(args);
  const texto = conteudo.find((c) => c.type === "text") as { text: string } | undefined;
  try {
    return JSON.parse(texto?.text ?? "null");
  } catch {
    return texto?.text;
  }
}

describe("ferramentas de desenho 2D (loja em memória)", () => {
  beforeEach(() => definirLojaDesenhos(undefined));

  it("cria desenho, adiciona formas, edita, reordena e apaga", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "Tela", largura: 200, altura: 100, fundo: "transparente" });
    const { elemento_id: a } = await chamar("adicionar_forma", { desenho_id, tipo: "retangulo", x: 1, y: 2, largura: 10, altura: 10 });
    const { elemento_id: b } = await chamar("adicionar_forma", { desenho_id, tipo: "texto", x: 5, y: 5, texto: "oi" });

    await chamar("editar_elemento", { desenho_id, elemento_id: a, preenchimento: "#123456", rotacao: 30 });
    await chamar("mover_camada", { desenho_id, elemento_id: b, posicao: "tras" });

    const desenho = await chamar("obter_desenho", { desenho_id });
    expect(desenho.fundo).toBeNull();
    expect(desenho.elementos.map((e: Elemento) => e.id)).toEqual([b, a]);
    expect(desenho.elementos[1].preenchimento).toBe("#123456");
    expect(desenho.elementos[1].rotacao).toBe(30);

    await chamar("apagar_elemento", { desenho_id, elemento_id: b, confirmar: true });
    const depois = await chamar("obter_desenho", { desenho_id });
    expect(depois.elementos).toHaveLength(1);
  });

  it("recusa formas sem os campos exigidos por tipo", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "V" });
    await expect(chamar("adicionar_forma", { desenho_id, tipo: "retangulo", largura: 5 })).rejects.toThrow(/largura e altura/);
    await expect(chamar("adicionar_forma", { desenho_id, tipo: "linha", x: 0, y: 0 })).rejects.toThrow(/x2 e y2/);
    await expect(chamar("adicionar_forma", { desenho_id, tipo: "texto", x: 0, y: 0 })).rejects.toThrow(/campo texto/);
  });

  it("pixel art exige símbolos da paleta e não aceita '.' como cor", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "P", largura: 16, altura: 16 });
    await expect(
      chamar("adicionar_pixelart", { desenho_id, grade: ["#x"], paleta: [{ simbolo: "#", cor: "#000000" }] }),
    ).rejects.toThrow(/Símbolos sem cor na paleta: x/);
    await expect(
      chamar("adicionar_pixelart", { desenho_id, grade: ["#"], paleta: [{ simbolo: ".", cor: "#000000" }] }),
    ).rejects.toThrow(/reservado/);

    const ok = await chamar("adicionar_pixelart", {
      desenho_id,
      grade: ["..##..", ".#oo#."],
      paleta: [
        { simbolo: "#", cor: "#000000" },
        { simbolo: "o", cor: "#ff0000" },
      ],
      tamanho_pixel: 4,
    });
    expect(ok.largura_px).toBe(24);
    expect(ok.altura_px).toBe(8);
  });

  it("exclusão exige confirmar=true pelo schema", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "X" });
    const apagar = todasFerramentas.find((t) => t.nome === "apagar_desenho")!;
    await expect(async () => apagar.executar({ desenho_id, confirmar: false })).rejects.toThrow();
  });

  it("exportar em SVG sem armazenamento devolve o SVG inline com relatório", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "Ícone", largura: 32, altura: 32, fundo: "transparente" });
    await chamar("adicionar_forma", { desenho_id, tipo: "elipse", largura: 20, altura: 20, preenchimento: "#ff0000" });
    const exportar = todasFerramentas.find((t) => t.nome === "exportar_desenho")!;
    const conteudo: Conteudo[] = await exportar.executar({ desenho_id, formato: "svg", escala: 1 });
    const svg = conteudo[0] as { type: "text"; text: string };
    expect(svg.text.startsWith("<svg")).toBe(true);
    expect(svg.text).toContain('fill="#ff0000"');
    const relatorio = JSON.parse((conteudo[1] as { text: string }).text);
    expect(relatorio.arquivo).toBe("Icone.svg");
  });

  it("a validação de entrada recusa URL que não é http", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "I" });
    await expect(
      chamar("adicionar_imagem", { desenho_id, url: "file:///etc/passwd", largura: 10, altura: 10 }),
    ).rejects.toThrow();
  });
});

describe.skipIf(!process.env.CHROME_PATH)("renderização 2D com Chromium", () => {
  it("rasteriza um desenho em PNG", async () => {
    const { rasterizarSvg } = await import("../src/desenho2d/render.js");
    const svg = desenhoParaSvg(base([el({ tipo: "retangulo", largura: 50, altura: 25, preenchimento: "#00ff00" })]));
    const png = await rasterizarSvg(svg, 100, 50, 2, false);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(200);
    expect(png.readUInt32BE(20)).toBe(100);
  });
});
