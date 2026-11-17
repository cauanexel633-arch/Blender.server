import { describe, expect, it } from "vitest";
import { construirGeometriaObjeto } from "../src/geometria/construir.js";
import { gerarGlb } from "../src/geometria/glb.js";
import { gerarStl, gerarObj, inspecionarCena, volumeDaGeometria, malhasDaCena } from "../src/geometria/exportar.js";
import { codificarPng, gerarTexturaPng } from "../src/geometria/png.js";
import { Cena, Material, ObjetoCena, type Transformacao } from "../src/geometria/tipos.js";

const materialPadrao = Material.parse({});
const transformacao: Transformacao = { posicao: [0, 0, 0], rotacao_graus: [0, 0, 0], escala: [1, 1, 1] };

function cenaCom(objetos: ObjetoCena[]): Cena {
  return { id: "cena_teste", nome: "Teste", objetos, criada_em: "", atualizada_em: "" };
}

const cubo = (id: string, tamanho = 1, posicao: [number, number, number] = [0, 0, 0]): ObjetoCena => ({
  id,
  nome: id,
  origem: { tipo: "primitiva", primitiva: { forma: "cubo", tamanho } },
  transformacao: { ...transformacao, posicao },
  material: materialPadrao,
  visivel: true,
});

describe("volume e geometria", () => {
  it("cubo de aresta 1 tem volume 1", () => {
    const cena = cenaCom([cubo("a", 1)]);
    const g = construirGeometriaObjeto(cena, cena.objetos[0]);
    expect(volumeDaGeometria(g)).toBeCloseTo(1, 5);
  });

  it("transformação de escala altera o volume", () => {
    const obj = cubo("a", 1);
    obj.transformacao = { ...transformacao, escala: [2, 2, 2] };
    const cena = cenaCom([obj]);
    expect(volumeDaGeometria(construirGeometriaObjeto(cena, obj))).toBeCloseTo(8, 5);
  });

  it("extrusão de triângulo (área 0,5) com profundidade 2 tem volume 1", () => {
    const obj: ObjetoCena = {
      id: "e",
      nome: "e",
      origem: {
        tipo: "extrusao",
        contorno: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        profundidade: 2,
      },
      transformacao,
      material: materialPadrao,
      visivel: true,
    };
    const cena = cenaCom([obj]);
    expect(Math.abs(volumeDaGeometria(construirGeometriaObjeto(cena, obj)))).toBeCloseTo(1, 5);
  });

  it("revolução de retângulo gera cilindro de volume próximo de π·r²·h", () => {
    const obj: ObjetoCena = {
      id: "r",
      nome: "r",
      origem: {
        tipo: "revolucao",
        perfil: [
          [0, 0],
          [1, 0],
          [1, 2],
          [0, 2],
        ],
        segmentos: 64,
      },
      transformacao,
      material: materialPadrao,
      visivel: true,
    };
    const cena = cenaCom([obj]);
    const v = Math.abs(volumeDaGeometria(construirGeometriaObjeto(cena, obj)));
    expect(v).toBeGreaterThan(Math.PI * 2 * 0.98);
    expect(v).toBeLessThan(Math.PI * 2 * 1.02);
  });
});

describe("booleanas (CSG)", () => {
  it("subtração de esfera interna cria cavidade: volume = cubo − esfera", () => {
    const esfera: ObjetoCena = {
      id: "esf",
      nome: "esf",
      origem: { tipo: "primitiva", primitiva: { forma: "esfera", raio: 0.5, segmentos: 64 } },
      transformacao,
      material: materialPadrao,
      visivel: true,
    };
    const bool: ObjetoCena = {
      id: "bool",
      nome: "bool",
      origem: { tipo: "booleana", operacao: "subtracao", a: "cubo2", b: "esf" },
      transformacao,
      material: materialPadrao,
      visivel: true,
    };
    const cena = cenaCom([cubo("cubo2", 2), esfera, bool]);
    const v = volumeDaGeometria(construirGeometriaObjeto(cena, bool));
    const esperado = 8 - (4 / 3) * Math.PI * 0.5 ** 3;
    expect(Math.abs(v)).toBeCloseTo(esperado, 1);
  });

  it("operandos de booleana ficam ocultos e a booleana aparece no modelo", () => {
    const bool: ObjetoCena = {
      id: "bool",
      nome: "bool",
      origem: { tipo: "booleana", operacao: "uniao", a: "a", b: "b" },
      transformacao,
      material: materialPadrao,
      visivel: true,
    };
    const cena = cenaCom([cubo("a"), cubo("b", 1, [2, 0, 0]), bool]);
    expect(malhasDaCena(cena).map((m) => m.nome)).toEqual(["bool"]);
  });

  it("detecta ciclo entre booleanas", () => {
    const b1: ObjetoCena = {
      id: "b1",
      nome: "b1",
      origem: { tipo: "booleana", operacao: "uniao", a: "b2", b: "c" },
      transformacao,
      material: materialPadrao,
      visivel: true,
    };
    const b2: ObjetoCena = { ...b1, id: "b2", nome: "b2", origem: { tipo: "booleana", operacao: "uniao", a: "b1", b: "c" } };
    const cena = cenaCom([cubo("c"), b1, b2]);
    expect(() => construirGeometriaObjeto(cena, b1)).toThrow(/Ciclo/);
  });
});

describe("exportação", () => {
  it("GLB tem cabeçalho glTF válido e JSON com uma malha por objeto", () => {
    const cena = cenaCom([cubo("a"), cubo("b", 1, [2, 0, 0])]);
    const glb = gerarGlb(
      malhasDaCena(cena).map((m) => ({ nome: m.nome, geometria: m.geometria, material: m.material })),
    );
    expect(glb.readUInt32LE(0)).toBe(0x46546c67);
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const jsonLen = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
    expect(json.meshes).toHaveLength(2);
    expect(json.asset.version).toBe("2.0");
  });

  it("STL binário de um cubo tem 12 triângulos", () => {
    const cena = cenaCom([cubo("a")]);
    const stl = gerarStl(cena, "binario");
    expect(stl.readUInt32LE(80)).toBe(12);
    expect(stl.length).toBe(84 + 12 * 50);
  });

  it("STL ASCII e OBJ contêm as marcas esperadas", () => {
    const cena = cenaCom([cubo("a")]);
    expect(gerarStl(cena, "ascii").toString("utf8")).toMatch(/^solid .*\nfacet normal/);
    expect(gerarObj(cena)).toMatch(/^o a\n/m);
  });

  it("inspeção reporta volume e avisa sobre objeto plano", () => {
    const plano: ObjetoCena = {
      id: "p",
      nome: "placa",
      origem: { tipo: "primitiva", primitiva: { forma: "plano", largura: 1, profundidade: 1 } },
      transformacao,
      material: materialPadrao,
      visivel: true,
    };
    const relatorio = inspecionarCena(cenaCom([cubo("a"), plano]));
    expect(relatorio.objetos_visiveis).toBe(2);
    expect(relatorio.volume_total).toBeCloseTo(1, 5);
    expect(relatorio.avisos.join(" ")).toMatch(/placa/);
  });
});

describe("PNG e texturas procedurais", () => {
  it("gera PNG 256×256 com assinatura e cabeçalho corretos", () => {
    const png = gerarTexturaPng("xadrez", "#000000", "#ffffff");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
  });

  it("todos os padrões produzem PNG válido", () => {
    for (const p of ["xadrez", "listras", "bolinhas", "gradiente", "ruido"] as const) {
      const png = gerarTexturaPng(p, "#112233", "#ddeeff");
      expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    }
  });

  it("codificarPng aceita um pixel", () => {
    const png = codificarPng(1, 1, new Uint8Array([255, 0, 0]));
    expect(png.readUInt32BE(16)).toBe(1);
  });
});
