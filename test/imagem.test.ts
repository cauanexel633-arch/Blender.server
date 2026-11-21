import { beforeEach, describe, expect, it, vi } from "vitest";
import { definirLoja } from "../src/armazenamento/loja.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import { paraAgente } from "../src/ferramentas/imagem.js";
import type { Conteudo, Ferramenta } from "../src/ferramentas/tipos.js";

async function chamar(nome: string, args: Record<string, unknown> = {}): Promise<Conteudo[]> {
  const f = todasFerramentas.find((t) => t.nome === nome)!;
  return f.executar(args);
}

beforeEach(() => definirLoja(undefined));

describe("retorno de imagens dos prints", () => {
  it("sem armazenamento, o padrão (link) cai para a imagem inline com aviso", async () => {
    const { cena_id } = JSON.parse((await chamar("criar_cena", { nome: "Print" })).find((c) => c.type === "text")!.text as string);
    await chamar("criar_primitiva", { cena_id, forma: "cubo", tamanho: 1 });
    const conteudo = await chamar("renderizar_cena", { cena_id, largura: 200, altura: 200 });
    expect(conteudo.some((c) => c.type === "image")).toBe(true);
    const aviso = conteudo.find((c) => c.type === "text" && c.text.includes("Armazenamento não configurado"));
    expect(aviso).toBeDefined();
  });

  it("formato imagem devolve a imagem direto, sem aviso", async () => {
    const { cena_id } = JSON.parse((await chamar("criar_cena", { nome: "Print2" })).find((c) => c.type === "text")!.text as string);
    await chamar("criar_primitiva", { cena_id, forma: "cubo", tamanho: 1 });
    const conteudo = await chamar("renderizar_cena", { cena_id, largura: 200, altura: 200, formato: "imagem" });
    expect(conteudo.some((c) => c.type === "image")).toBe(true);
    expect(conteudo.some((c) => c.type === "text" && c.text.includes("Armazenamento não configurado"))).toBe(false);
  });

  it("o padrão de formato do print é link na definição da ferramenta", () => {
    const f = todasFerramentas.find((t) => t.nome === "renderizar_desenho")!;
    expect(Object.keys(f.schema)).toContain("formato");
  });
});

describe("agentes sempre recebem a imagem", () => {
  it("paraAgente força formato imagem em ferramentas de print", async () => {
    const capturado: unknown[] = [];
    const falsa: Ferramenta = {
      nome: "renderizar_cena",
      titulo: "t",
      descricao: "d",
      schema: {},
      executar: async (a) => {
        capturado.push(a);
        return [];
      },
    };
    await paraAgente(falsa).executar({ cena_id: "x" });
    expect(capturado[0]).toMatchObject({ cena_id: "x", formato: "imagem" });
  });

  it("ferramentas que não são de print ficam como estavam", () => {
    const outra = todasFerramentas.find((t) => t.nome === "listar_cenas")!;
    expect(paraAgente(outra)).toBe(outra);
  });
});
