import { beforeEach, describe, expect, it } from "vitest";
import { definirLojaInterfaces, LojaMemoriaInterfaces } from "../src/interface/loja.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import { validarPropriedade } from "../src/interface/propriedades.js";
import { gerarLuau } from "../src/interface/luau.js";
import { htmlPreview } from "../src/interface/preview.js";
import { adicionarElementoUI, criarInterfaceUI, moverElementoUI, raizDe } from "../src/interface/tipos.js";
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

beforeEach(() => definirLojaInterfaces(new LojaMemoriaInterfaces()));

describe("propriedades no padrão do Roblox Studio", () => {
  it("aceita nomes e formatos corretos e recusa valores inválidos", () => {
    expect(validarPropriedade("Frame", "BackgroundColor3", "#1e1e1e")).toEqual("#1e1e1e");
    expect(validarPropriedade("TextLabel", "Font", "GothamBold")).toEqual("GothamBold");
    expect(() => validarPropriedade("Frame", "BackgroundColor3", "vermelho")).toThrow();
    expect(() => validarPropriedade("Frame", "NaoExiste", 1)).toThrow();
    expect(() => validarPropriedade("TextLabel", "Font", "Comic")).toThrow();
  });
});

describe("hierarquia da interface", () => {
  it("adiciona filhos e impede colocar um elemento dentro de si mesmo", () => {
    const ui = criarInterfaceUI("Menu", 800, 600);
    const painel = adicionarElementoUI(ui, "Frame", raizDe(ui).id, { Name: "Painel" });
    const botao = adicionarElementoUI(ui, "TextButton", painel.id, { Text: "Jogar" });
    expect(botao.pai_id).toBe(painel.id);
    expect(() => moverElementoUI(ui, painel.id, botao.id)).toThrow();
  });

  it("modificador (UICorner) só fica dentro de elemento visível", () => {
    const ui = criarInterfaceUI("Menu", 800, 600);
    expect(() => adicionarElementoUI(ui, "UICorner", raizDe(ui).id, {})).toThrow();
    const painel = adicionarElementoUI(ui, "Frame", raizDe(ui).id, {});
    expect(() => adicionarElementoUI(ui, "UICorner", painel.id, { CornerRadius: [0, 8] })).not.toThrow();
  });
});

describe("ferramentas de interface", () => {
  it("cria, edita e obtém a árvore só com propriedades alteradas", async () => {
    const { interface_id } = await chamar("criar_interface", { nome: "HUD", largura: 640, altura: 360 });
    const { elemento_id } = await chamar("adicionar_elemento_ui", {
      interface_id,
      classe: "TextLabel",
      propriedades: { Text: "Vida", Size: [0, 120, 0, 30] },
    });
    await chamar("editar_elemento_ui", { interface_id, elemento_id, propriedades: { Text: "Vida 100" } });
    const obtida = await chamar("obter_interface", { interface_id });
    const label = obtida.arvore.filhos.find((f: any) => f.id === elemento_id);
    expect(label.propriedades_alteradas.Text).toBe("Vida 100");
    expect(label.propriedades_alteradas.Size).toEqual([0, 120, 0, 30]);
  });

  it("exportar sem preview aprovado é recusado", async () => {
    const { interface_id } = await chamar("criar_interface", { nome: "X" });
    await expect(
      chamar("exportar_interface", { interface_id, preview_id: "qualquer", confirmar: true }),
    ).rejects.toThrow(/preview/);
  });

  it("qualquer alteração depois do preview bloqueia a exportação até novo preview", async () => {
    const { interface_id } = await chamar("criar_interface", { nome: "Y" });
    const conteudo: Conteudo[] = await todasFerramentas
      .find((t) => t.nome === "gerar_preview_interface")!
      .executar({ interface_id });
    const meta = JSON.parse((conteudo.find((c) => c.type === "text") as { text: string }).text);
    expect(typeof meta.preview_id).toBe("string");

    await chamar("exportar_interface", { interface_id, preview_id: meta.preview_id, confirmar: true });

    await chamar("adicionar_elemento_ui", { interface_id, classe: "Frame" });
    await expect(
      chamar("exportar_interface", { interface_id, preview_id: meta.preview_id, confirmar: true }),
    ).rejects.toThrow(/mudou/);
  });

  it("apagar exige confirmar=true", async () => {
    const { interface_id } = await chamar("criar_interface", { nome: "Z" });
    await expect(chamar("apagar_interface", { interface_id, confirmar: false })).rejects.toThrow();
    expect(await chamar("apagar_interface", { interface_id, confirmar: true })).toEqual({ apagada: interface_id });
  });
});

describe("exportação e visualização", () => {
  it("o Luau cria cada elemento com Instance.new e grava as propriedades", () => {
    const ui = criarInterfaceUI("Menu", 800, 600);
    adicionarElementoUI(ui, "TextButton", raizDe(ui).id, { Name: "Jogar", Text: "Jogar", Size: [0, 200, 0, 50] });
    const lua = gerarLuau(ui);
    expect(lua).toContain('Instance.new("TextButton")');
    expect(lua).toContain('.Text = "Jogar"');
    expect(lua).toContain("UDim2.new(0, 200, 0, 50)");
    expect(lua).toContain("PlayerGui");
  });

  it("o HTML de preview contém o texto e o nome do elemento", () => {
    const ui = criarInterfaceUI("Menu", 800, 600);
    adicionarElementoUI(ui, "TextLabel", raizDe(ui).id, { Name: "Titulo", Text: "Bem-vindo" });
    const html = htmlPreview(ui);
    expect(html).toContain("Bem-vindo");
    expect(html).toContain("Titulo");
  });
});

describe.skipIf(!process.env.CHROME_PATH)("preview PNG com Chromium", () => {
  it("gera um PNG válido", async () => {
    const { renderizarPreviewPng } = await import("../src/interface/preview.js");
    const ui = criarInterfaceUI("Teste", 320, 200);
    adicionarElementoUI(ui, "Frame", raizDe(ui).id, { BackgroundColor3: "#ff0000", Size: [0, 100, 0, 50] });
    const png = await renderizarPreviewPng(ui);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  }, 90_000);
});
