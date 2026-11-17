import { beforeEach, describe, expect, it } from "vitest";
import { definirLoja } from "../src/armazenamento/loja.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";

// Chama a ferramenta e devolve o JSON do texto (mesmo padrão de ferramentas.test.ts).
async function chamar(nome: string, args: Record<string, unknown> = {}): Promise<any> {
  const f = todasFerramentas.find((t) => t.nome === nome);
  if (!f) throw new Error(`ferramenta ${nome} não existe`);
  const conteudo: Conteudo[] = await f.executar(args);
  const texto = conteudo.find((c): c is { type: "text"; text: string } => c.type === "text");
  return JSON.parse(texto?.text ?? "null");
}

// Exporta e devolve o recurso (com o blob) e o relatório JSON que acompanha o arquivo.
async function exportar(cena_id: string, args: Record<string, unknown>) {
  const f = todasFerramentas.find((t) => t.nome === "exportar_modelo")!;
  const conteudo: Conteudo[] = await f.executar({ cena_id, ...args });
  const recurso = conteudo.find((c) => c.type === "resource") as unknown as { resource: { uri: string; blob: string } };
  const texto = conteudo.find((c) => c.type === "text") as unknown as { text: string };
  return { recurso: recurso.resource, relatorio: JSON.parse(texto.text) };
}

async function cenaComCubo(posicao: [number, number, number], tamanho = 20) {
  const { cena_id } = await chamar("criar_cena", { nome: "Exportação" });
  await chamar("criar_primitiva", { cena_id, forma: "cubo", tamanho, posicao, nome: "bloco" });
  return cena_id as string;
}

describe("exportação: escala e posicionamento", () => {
  beforeEach(() => definirLoja(undefined));

  it("escala 0.1 converte mm para cm nas dimensões do relatório", async () => {
    const cena_id = await cenaComCubo([0, 10, 0], 20);
    const { relatorio } = await exportar(cena_id, { formato: "stl", escala: 0.1 });
    expect(relatorio.dimensoes).toEqual([2, 2, 2]);
    expect(relatorio.escala_aplicada).toBe(0.1);
  });

  it("sem base_no_chao o modelo mantém a posição original", async () => {
    const cena_id = await cenaComCubo([0, 30, 0], 20);
    const { relatorio } = await exportar(cena_id, { formato: "stl" });
    expect(relatorio.menor_y).toBe(20);
    expect(relatorio.base_no_chao).toBe(false);
  });

  it("base_no_chao assenta o menor ponto em y = 0 sem mudar as dimensões", async () => {
    const cena_id = await cenaComCubo([0, 30, 0], 20);
    const { relatorio } = await exportar(cena_id, { formato: "stl", base_no_chao: true });
    expect(relatorio.menor_y).toBe(0);
    expect(relatorio.dimensoes).toEqual([20, 20, 20]);
  });

  it("escala e base_no_chao combinam e valem para GLB e OBJ também", async () => {
    const cena_id = await cenaComCubo([0, 30, 0], 20);
    const glb = await exportar(cena_id, { formato: "glb", escala: 0.5, base_no_chao: true });
    expect(glb.relatorio.dimensoes).toEqual([10, 10, 10]);
    expect(glb.relatorio.menor_y).toBe(0);
    const obj = await exportar(cena_id, { formato: "obj", escala: 0.5, base_no_chao: true });
    expect(obj.relatorio.dimensoes).toEqual([10, 10, 10]);
  });

  it("OBJ escrito com escala tem as coordenadas já escaladas", async () => {
    const cena_id = await cenaComCubo([0, 0, 0], 20);
    const { recurso } = await exportar(cena_id, { formato: "obj", escala: 0.1 });
    const texto = Buffer.from(recurso.blob, "base64").toString("utf8");
    const vertices = texto.split("\n").filter((l) => l.startsWith("v "));
    const maiorAbs = Math.max(...vertices.flatMap((l) => l.split(" ").slice(1).map(Number).map(Math.abs)));
    expect(maiorAbs).toBeCloseTo(1, 5);
  });
});

describe("exportação: arquivo e erros", () => {
  beforeEach(() => definirLoja(undefined));

  it("nome do arquivo mantém letras e troca espaços e símbolos por _", async () => {
    const cena_id = await cenaComCubo([0, 0, 0]);
    const { recurso, relatorio } = await exportar(cena_id, { formato: "stl" });
    expect(recurso.uri).toMatch(/\/Exportacao\.stl$/);
    expect(relatorio.arquivo).toBe("Exportacao.stl");

    const { cena_id: outra } = await chamar("criar_cena", { nome: "Teste de conexão" });
    await chamar("criar_primitiva", { cena_id: outra, forma: "cubo", nome: "c" });
    const { relatorio: r2 } = await exportar(outra, { formato: "glb" });
    expect(r2.arquivo).toBe("Teste_de_conexao.glb");
  });

  it("cena sem objetos visíveis dá erro claro em todos os formatos", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Vazia" });
    for (const formato of ["glb", "stl", "obj"]) {
      await expect(exportar(cena_id, { formato })).rejects.toThrow(/Nenhum objeto visível/);
    }
  });

  it("relatório lista os avisos de malha sem volume", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Plano" });
    await chamar("criar_primitiva", { cena_id, forma: "plano", largura: 10, profundidade: 10, nome: "chao" });
    const { relatorio } = await exportar(cena_id, { formato: "stl" });
    expect(relatorio.avisos.length).toBeGreaterThan(0);
    expect(relatorio.avisos[0]).toMatch(/chao/);
  });

  it("exportações em sequência da mesma cena reaproveitam as malhas e geram arquivos iguais", async () => {
    const cena_id = await cenaComCubo([0, 0, 0]);
    const a = await exportar(cena_id, { formato: "stl" });
    const b = await exportar(cena_id, { formato: "stl" });
    expect(a.recurso.blob).toBe(b.recurso.blob);
  });
});
