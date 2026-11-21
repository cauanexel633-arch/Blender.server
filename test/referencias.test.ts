import { beforeEach, describe, expect, it } from "vitest";
import { definirLoja, obterLoja } from "../src/armazenamento/loja.js";
import { definirLojaInterfaces, LojaMemoriaInterfaces, obterLojaInterfaces } from "../src/interface/loja.js";
import { definirLojaReferencias, LojaMemoriaReferencias } from "../src/referencias/loja.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";

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

beforeEach(() => {
  definirLoja(undefined);
  definirLojaInterfaces(new LojaMemoriaInterfaces());
  definirLojaReferencias(new LojaMemoriaReferencias());
});

describe("biblioteca de referências", () => {
  it("salva uma cena como referência, lista, filtra e obtém", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Cadeira" });
    await chamar("criar_primitiva", { cena_id, forma: "cubo", tamanho: 1 });
    const ref = await chamar("salvar_referencia", {
      tipo: "3d",
      origem: { tipo: "cena", id: cena_id },
      nome: "Cadeira de madeira",
      descricao: "Cadeira simples, assento 45 cm",
      medidas: "altura 90 cm",
      paleta: ["#8b5a2b"],
    });
    expect(ref.id).toMatch(/^ref_/);
    expect((await chamar("listar_referencias", { tipo: "3d" })).length).toBe(1);
    expect((await chamar("listar_referencias", { tipo: "2d" })).length).toBe(0);
    expect((await chamar("listar_referencias", { busca: "madeira" })).length).toBe(1);
    const obtida = await chamar("obter_referencia", { id: ref.id });
    expect(obtida.medidas).toBe("altura 90 cm");
  });

  it("aplicar cria um trabalho novo e não altera a referência nem a origem", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Origem" });
    await chamar("criar_primitiva", { cena_id, forma: "cubo", tamanho: 1 });
    const ref = await chamar("salvar_referencia", { tipo: "3d", origem: { tipo: "cena", id: cena_id }, nome: "Base" });
    const novo = await chamar("aplicar_referencia", { id: ref.id, nome: "Minha versão" });
    expect(novo.novo_id).not.toBe(cena_id);
    const copia = await obterLoja().obter(novo.novo_id);
    expect(copia?.nome).toBe("Minha versão");
    expect(copia?.objetos.length).toBe(1);
    const original = await obterLoja().obter(cena_id);
    expect(original?.nome).toBe("Origem");
    copia!.objetos.push(structuredClone(copia!.objetos[0]));
    await obterLoja().salvar(copia!);
    expect((await obterLoja().obter(cena_id))!.objetos.length).toBe(1);
  });

  it("recusa tipo com origem errada", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "X" });
    await expect(
      chamar("salvar_referencia", { tipo: "2d", origem: { tipo: "cena", id: cena_id }, nome: "Errada" }),
    ).rejects.toThrow(/precisa de origem "desenho"/);
  });

  it("apagar exige confirmar=true e remove a referência", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Y" });
    const ref = await chamar("salvar_referencia", { tipo: "3d", origem: { tipo: "cena", id: cena_id }, nome: "Y" });
    await expect(chamar("apagar_referencia", { id: ref.id, confirmar: false })).rejects.toThrow();
    expect(await chamar("apagar_referencia", { id: ref.id, confirmar: true })).toEqual({ apagada: ref.id });
    await expect(chamar("obter_referencia", { id: ref.id })).rejects.toThrow(/não existe/);
  });

  it("referência de interface aplica sem preview aprovado", async () => {
    const criada = await chamar("criar_interface_de_modelo", { nome: "Dialogo base", modelo: "dialogo" });
    const ref = await chamar("salvar_referencia", { tipo: "interface", origem: { tipo: "interface", id: criada.interface_id }, nome: "Diálogo" });
    const novo = await chamar("aplicar_referencia", { id: ref.id, nome: "Diálogo do NPC" });
    const ui = await obterLojaInterfaces().obter(novo.novo_id);
    expect(ui?.nome).toBe("Diálogo do NPC");
    expect(ui?.preview_hash).toBeNull();
  });
});
