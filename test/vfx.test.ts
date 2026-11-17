import { beforeEach, describe, expect, it } from "vitest";
import { definirLojaDesenhos } from "../src/desenho2d/loja.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import { gerador, misturarCor, particulasDoEfeito, type ParamsEfeito } from "../src/vfx/particulas.js";

const base = (extra: Partial<ParamsEfeito> = {}): ParamsEfeito => ({
  tipo: "explosao",
  x: 100,
  y: 100,
  largura: 0,
  altura: 0,
  quantidade: 100,
  progresso: 0.5,
  semente: 7,
  corInicial: "#ffcc00",
  corFinal: "#ff3300",
  tamanho: 6,
  raio: 50,
  ...extra,
});

describe("gerador e cores", () => {
  it("mesma semente gera a mesma sequência; sementes diferentes geram sequências diferentes", () => {
    const a = gerador(42);
    const b = gerador(42);
    const c = gerador(43);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect(c()).not.toBe(sa[0]);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("misturarCor vai da primeira à segunda cor", () => {
    expect(misturarCor("#000000", "#ffffff", 0)).toBe("#000000");
    expect(misturarCor("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(misturarCor("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("efeitos de partículas", () => {
  it("explosão começa todo no centro e termina sem partículas", () => {
    const inicio = particulasDoEfeito(base({ progresso: 0 }));
    expect(inicio).toHaveLength(100);
    expect(inicio.every((p) => Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y - 100) < 1e-9)).toBe(true);
    expect(particulasDoEfeito(base({ progresso: 1 }))).toHaveLength(0);
  });

  it("fogo e fumaça são emissores contínuos: sobem a partir do centro e ficam dentro do alcance", () => {
    // Emissor contínuo: a média não muda com o tempo (fases aleatórias), mas cada partícula fica acima do emissor.
    for (const tipo of ["fogo", "fumaca"] as const) {
      for (const progresso of [0.1, 0.5, 0.9]) {
        const ps = particulasDoEfeito(base({ tipo, progresso, raio: 50 }));
        expect(ps.length).toBeGreaterThan(50);
        expect(ps.every((p) => p.y <= 100 + 1e-9)).toBe(true);
        expect(ps.every((p) => p.y >= 100 - 50 * 3.1)).toBe(true);
      }
    }
  });

  it("chuva e neve ficam dentro da área", () => {
    const area = { x: 10, y: 20, largura: 200, altura: 100 };
    for (const tipo of ["chuva", "neve"] as const) {
      const ps = particulasDoEfeito(base({ tipo, ...area, x: area.x, y: area.y, progresso: 0.37, quantidade: 300 }));
      expect(ps.length).toBeGreaterThan(200);
      for (const p of ps) {
        expect(p.x).toBeGreaterThanOrEqual(area.x - 1e-9);
        expect(p.x).toBeLessThanOrEqual(area.x + area.largura + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(area.y - 1e-9);
        expect(p.y).toBeLessThanOrEqual(area.y + area.altura + 1e-9);
      }
    }
  });

  it("brilho mantém todas as partículas e é transparente", () => {
    const ps = particulasDoEfeito(base({ tipo: "brilho", quantidade: 50 }));
    expect(ps).toHaveLength(50);
    expect(ps.every((p) => p.opacidade <= 0.25)).toBe(true);
  });

  it("o mesmo instante e semente dão exatamente o mesmo resultado", () => {
    expect(particulasDoEfeito(base({ tipo: "faiscas" }))).toEqual(particulasDoEfeito(base({ tipo: "faiscas" })));
  });
});

async function chamar(nome: string, args: Record<string, unknown> = {}): Promise<any> {
  const f = todasFerramentas.find((t) => t.nome === nome);
  if (!f) throw new Error(`ferramenta ${nome} não existe`);
  const conteudo = await f.executar(args);
  const texto = conteudo.find((c) => c.type === "text") as { text: string } | undefined;
  return JSON.parse(texto?.text ?? "null");
}

describe("ferramentas de VFX", () => {
  beforeEach(() => definirLojaDesenhos(undefined));

  it("criar_efeito_2d adiciona elipses agrupadas e é reproduzível", async () => {
    const a = await chamar("criar_desenho", { nome: "A", largura: 300, altura: 300 });
    const b = await chamar("criar_desenho", { nome: "B", largura: 300, altura: 300 });
    const args = { tipo: "explosao", x: 150, y: 150, quantidade: 80, progresso: 0.4, semente: 3, raio: 60 };
    const ra = await chamar("criar_efeito_2d", { desenho_id: a.desenho_id, ...args, grupo: "boom" });
    await chamar("criar_efeito_2d", { desenho_id: b.desenho_id, ...args, grupo: "boom" });
    expect(ra.grupo).toBe("boom");
    expect(ra.particulas_visiveis).toBeGreaterThan(0);

    const da = await chamar("obter_desenho", { desenho_id: a.desenho_id });
    const db = await chamar("obter_desenho", { desenho_id: b.desenho_id });
    const pos = (d: any) => d.elementos.map((e: any) => [e.x, e.y, e.largura, e.opacidade]);
    expect(pos(da)).toEqual(pos(db));
    expect(da.elementos.every((e: any) => e.tipo === "elipse" && e.grupo === "boom")).toBe(true);
  });

  it("chuva sem área é recusada", async () => {
    const d = await chamar("criar_desenho", { nome: "C" });
    await expect(chamar("criar_efeito_2d", { desenho_id: d.desenho_id, tipo: "chuva", x: 0, y: 0 })).rejects.toThrow(/largura e altura/);
  });

  it("apagar_efeito_2d remove só o grupo pedido", async () => {
    const d = await chamar("criar_desenho", { nome: "D", largura: 200, altura: 200 });
    await chamar("criar_efeito_2d", { desenho_id: d.desenho_id, tipo: "brilho", x: 50, y: 50, quantidade: 10, grupo: "g1" });
    await chamar("criar_efeito_2d", { desenho_id: d.desenho_id, tipo: "brilho", x: 150, y: 150, quantidade: 5, grupo: "g2" });
    const apagado = await chamar("apagar_efeito_2d", { desenho_id: d.desenho_id, grupo: "g1", confirmar: true });
    expect(apagado.removidos).toBe(10);
    const restante = await chamar("obter_desenho", { desenho_id: d.desenho_id });
    expect(restante.elementos).toHaveLength(5);
    await expect(chamar("apagar_efeito_2d", { desenho_id: d.desenho_id, grupo: "g1", confirmar: true })).rejects.toThrow(/Nenhum elemento/);
  });
});
