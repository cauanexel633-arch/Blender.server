import { beforeEach, describe, expect, it } from "vitest";
import { LojaMemoriaInterfaces, definirLojaInterfaces } from "../src/interface/loja.js";
import { FERRAMENTAS_DO_AGENTE } from "../src/ferramentas/interface_agentes.js";
import { analisarInterface, razaoContraste } from "../src/interface/revisao.js";
import { adicionarElementoUI, criarInterfaceUI, raizDe } from "../src/interface/tipos.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";

async function chamar(nome: string, args: Record<string, unknown> = {}): Promise<any> {
  const f = todasFerramentas.find((t) => t.nome === nome);
  if (!f) throw new Error(`ferramenta ${nome} não existe`);
  const conteudo: Conteudo[] = await f.executar(args);
  const texto = conteudo.find((c) => c.type === "text") as { text: string } | undefined;
  return JSON.parse(texto?.text ?? "null");
}

beforeEach(() => definirLojaInterfaces(new LojaMemoriaInterfaces()));

describe("revisão de layout e legibilidade", () => {
  it("contraste WCAG: preto sobre branco dá 21:1 e cinza claro sobre branco fica abaixo de 4.5", () => {
    expect(razaoContraste("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(razaoContraste("#cccccc", "#ffffff")).toBeLessThan(4.5);
  });

  it("aponta contraste baixo, botão pequeno, elemento fora da tela e nome padrão", () => {
    const ui = criarInterfaceUI("T", 400, 300);
    const r = raizDe(ui).id;
    adicionarElementoUI(ui, "Frame", r, { BackgroundColor3: "#ffffff", Size: [0, 200, 0, 200] });
    adicionarElementoUI(ui, "TextLabel", r, { Name: "Titulo", Text: "Oi", TextColor3: "#cccccc", BackgroundColor3: "#ffffff", BackgroundTransparency: 0, Size: [0, 100, 0, 30] });
    adicionarElementoUI(ui, "TextButton", r, { Name: "Btn", Text: "Ok", Size: [0, 80, 0, 20] });
    adicionarElementoUI(ui, "Frame", r, { Name: "Solto", Position: [0.9, 0, 0, 0], Size: [0, 200, 0, 50] });
    const codigos = analisarInterface(ui).map((p) => p.codigo);
    expect(codigos).toContain("contraste_baixo");
    expect(codigos).toContain("botao_pequeno");
    expect(codigos).toContain("fora_da_tela");
    expect(codigos).toContain("nome_padrao");
  });

  it("interface limpa não gera problemas de erro", () => {
    const ui = criarInterfaceUI("Limpa", 640, 360);
    const painel = adicionarElementoUI(ui, "Frame", raizDe(ui).id, { Name: "Painel", Size: [0, 300, 0, 200], Position: [0.5, 0, 0.5, 0], AnchorPoint: [0.5, 0.5], BackgroundColor3: "#1e1e2e" });
    adicionarElementoUI(ui, "TextButton", painel.id, { Name: "BotaoJogar", Text: "Jogar", Size: [0.8, 0, 0, 48], Position: [0.1, 0, 0.4, 0], BackgroundColor3: "#4f46e5", TextColor3: "#ffffff" });
    const erros = analisarInterface(ui).filter((p) => p.severidade === "erro");
    expect(erros).toEqual([]);
  });
});

describe("ferramentas de agente de interface", () => {
  it("revisar_interface devolve a contagem e os detalhes", async () => {
    const { interface_id } = await chamar("criar_interface", { nome: "R", largura: 300, altura: 200 });
    await chamar("adicionar_elemento_ui", { interface_id, classe: "TextButton", propriedades: { Name: "Pequeno", Size: [0, 50, 0, 10] } });
    const r = await chamar("revisar_interface", { interface_id });
    expect(r.problemas_restantes).toBeGreaterThan(0);
    expect(r.detalhes.some((p: any) => p.codigo === "botao_pequeno")).toBe(true);
  });

  it("o agente não recebe ferramentas destrutivas nem a de exportar", async () => {
    const { interface_id } = await chamar("criar_interface", { nome: "A" });
    // Sem chave de provedor o agente falha antes de chamar o modelo; o erro mostra que a tool existe e valida.
    await expect(chamar("agente_interface", { interface_id, papel: "design" })).rejects.toThrow();
    for (const proibida of ["apagar_elemento_ui", "apagar_interface", "exportar_interface", "gerar_preview_interface", "criar_interface"]) {
      expect(FERRAMENTAS_DO_AGENTE.has(proibida)).toBe(false);
    }
    expect(FERRAMENTAS_DO_AGENTE.has("editar_elemento_ui")).toBe(true);
  });

  it("agente_interface recusa papel desconhecido", async () => {
    const { interface_id } = await chamar("criar_interface", { nome: "B" });
    await expect(chamar("agente_interface", { interface_id, papel: "magia" })).rejects.toThrow();
  });
});
