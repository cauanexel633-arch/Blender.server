import { beforeEach, describe, expect, it } from "vitest";
import { aplicarQuadro } from "../src/animacao/avaliar.js";
import { definirLojaDesenhos } from "../src/desenho2d/loja.js";
import { Desenho, type Chave, type Elemento } from "../src/desenho2d/tipos.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";

const elemento = (id: string): Elemento => ({ id, tipo: "retangulo", x: 0, y: 0, largura: 10, altura: 10, visivel: true });

const base = (chaves: Chave[]): Desenho => ({
  id: "d",
  nome: "d",
  largura: 100,
  altura: 100,
  fundo: null,
  elementos: [elemento("a")],
  fps: 10,
  duracao_quadros: 10,
  chaves,
  criada_em: "",
  atualizada_em: "",
});

const chave = (quadro: number, valor: number, interpolacao: Chave["interpolacao"] = "linear"): Chave => ({
  elemento_id: "a",
  propriedade: "x",
  quadro,
  valor,
  interpolacao,
});

const xNoQuadro = (chaves: Chave[], q: number) => aplicarQuadro(base(chaves), q).elementos[0].x;

describe("interpolação de keyframes", () => {
  it("sem keyframes, o desenho fica igual", () => {
    const d = base([]);
    expect(aplicarQuadro(d, 5)).toBe(d);
  });

  it("linear: interpola entre dois keyframes", () => {
    const chaves = [chave(0, 0), chave(10, 100)];
    expect(xNoQuadro(chaves, 0)).toBe(0);
    expect(xNoQuadro(chaves, 5)).toBe(50);
    expect(xNoQuadro(chaves, 10)).toBe(100);
  });

  it("antes do primeiro e depois do último, segura os valores das pontas", () => {
    const chaves = [chave(3, 30), chave(6, 60)];
    expect(xNoQuadro(chaves, 0)).toBe(30);
    expect(xNoQuadro(chaves, 9)).toBe(60);
  });

  it("constante: mantém o valor até o próximo keyframe", () => {
    const chaves = [chave(0, 0, "constante"), chave(10, 100)];
    expect(xNoQuadro(chaves, 4)).toBe(0);
    expect(xNoQuadro(chaves, 9)).toBe(0);
  });

  it("suave: começa e termina devagar (no meio fica no meio)", () => {
    const chaves = [chave(0, 0, "suave"), chave(10, 100)];
    expect(xNoQuadro(chaves, 5)).toBe(50);
    expect(xNoQuadro(chaves, 2.5 as never)).toBeLessThan(25);
  });

  it("não altera o desenho original", () => {
    const d = base([chave(0, 0), chave(10, 100)]);
    aplicarQuadro(d, 5);
    expect(d.elementos[0].x).toBe(0);
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

describe("ferramentas de animação (loja em memória)", () => {
  beforeEach(() => definirLojaDesenhos(undefined));

  it("anima um retângulo do quadro 0 ao 10 e confere o estado no meio", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "Bola", largura: 200, altura: 100 });
    const { elemento_id } = await chamar("adicionar_forma", { desenho_id, tipo: "retangulo", largura: 10, altura: 10 });
    await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "x", quadro: 0, valor: 0 });
    const r = await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "x", quadro: 10, valor: 100 });
    expect(r.chaves_do_elemento).toBe(2);

    const d = await chamar("obter_desenho", { desenho_id });
    expect(aplicarQuadro(d, 5).elementos[0].x).toBe(50);
  });

  it("keyframe no mesmo quadro substitui o anterior", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "S" });
    const { elemento_id } = await chamar("adicionar_forma", { desenho_id, tipo: "retangulo", largura: 5, altura: 5 });
    await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "opacidade", quadro: 2, valor: 0.2 });
    const r = await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "opacidade", quadro: 2, valor: 0.9 });
    expect(r.chaves_do_elemento).toBe(1);
  });

  it("keyframe além da duração estende a animação", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "E" });
    const { elemento_id } = await chamar("adicionar_forma", { desenho_id, tipo: "retangulo", largura: 5, altura: 5 });
    const r = await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "x", quadro: 30, valor: 1 });
    expect(r.duracao_aumentou).toBe(true);
    expect(r.duracao_quadros).toBe(31);
  });

  it("recusa keyframe de elemento inexistente e apagar_chaves remove só a propriedade pedida", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "F" });
    const { elemento_id } = await chamar("adicionar_forma", { desenho_id, tipo: "retangulo", largura: 5, altura: 5 });
    await expect(chamar("animar_propriedade", { desenho_id, elemento_id: "nao_existe", propriedade: "x", quadro: 0, valor: 1 })).rejects.toThrow(/não existe/);
    await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "x", quadro: 0, valor: 1 });
    await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "y", quadro: 0, valor: 1 });
    const r = await chamar("apagar_chaves", { desenho_id, elemento_id, propriedade: "x" });
    expect(r.removidas).toBe(1);
    expect(r.chaves_restantes).toBe(1);
  });

  it("configurar_animacao muda fps e duração", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "G" });
    const r = await chamar("configurar_animacao", { desenho_id, fps: 24, duracao_quadros: 48 });
    expect(r.fps).toBe(24);
    expect(r.duracao_segundos).toBe(2);
  });

  it("exportar_animacao recusa intervalo invertido e excesso de quadros", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "H" });
    await expect(chamar("exportar_animacao", { desenho_id, formato: "gif", quadro_inicial: 5, quadro_final: 2 })).rejects.toThrow(/maior ou igual/);
    await chamar("configurar_animacao", { desenho_id, duracao_quadros: 300 });
    await expect(chamar("exportar_animacao", { desenho_id, formato: "gif" })).rejects.toThrow(/limite é 120/);
  });
});

describe.skipIf(!process.env.CHROME_PATH)("exportação com Chromium", () => {
  beforeEach(() => definirLojaDesenhos(undefined));

  it("gera GIF e folha de sprites a partir de uma animação", async () => {
    const { desenho_id } = await chamar("criar_desenho", { nome: "Pulo", largura: 40, altura: 40, fundo: "#ffffff" });
    const { elemento_id } = await chamar("adicionar_forma", { desenho_id, tipo: "elipse", x: 5, y: 5, largura: 30, altura: 30, preenchimento: "#ff0000" });
    await chamar("configurar_animacao", { desenho_id, fps: 10, duracao_quadros: 6 });
    await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "y", quadro: 0, valor: 5 });
    await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "y", quadro: 3, valor: 20, interpolacao: "suave" });
    await chamar("animar_propriedade", { desenho_id, elemento_id, propriedade: "y", quadro: 5, valor: 5 });

    const conteudoGif = await todasFerramentas.find((f) => f.nome === "exportar_animacao")!.executar({ desenho_id, formato: "gif" });
    const img = conteudoGif.find((c) => c.type === "image") as { data: string; mimeType: string };
    expect(img.mimeType).toBe("image/gif");
    const gif = Buffer.from(img.data, "base64");
    expect(gif.toString("ascii", 0, 6)).toBe("GIF89a");
    expect(gif[gif.length - 1]).toBe(0x3b);

    const conteudoFolha = await todasFerramentas.find((f) => f.nome === "exportar_animacao")!.executar({ desenho_id, formato: "folha_png" });
    const folha = conteudoFolha.find((c) => c.type === "image") as { data: string };
    const png = Buffer.from(folha.data, "base64");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    // 6 quadros em grade de 3 colunas e 2 linhas: 120x80
    expect(png.readUInt32BE(16)).toBe(120);
    expect(png.readUInt32BE(20)).toBe(80);
  });
});
