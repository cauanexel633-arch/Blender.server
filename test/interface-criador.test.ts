import { beforeEach, describe, expect, it } from "vitest";
import { LojaMemoriaInterfaces, definirLojaInterfaces } from "../src/interface/loja.js";
import { analisarInterface } from "../src/interface/revisao.js";
import { criarDeModelo, MODELOS_INTERFACE, PaletaUI } from "../src/interface/modelos.js";
import { HABILIDADES_INTERFACE } from "../src/interface/habilidades.js";
import { htmlPreview } from "../src/interface/preview.js";
import { FERRAMENTAS_DO_CRIADOR } from "../src/ferramentas/interface_criador.js";
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

describe("modelos prontos", () => {
  for (const modelo of MODELOS_INTERFACE) {
    it(`${modelo} monta sem erro de propriedade e sem erros de revisão`, () => {
      const ui = criarDeModelo(modelo, "Teste", 1280, 720, PaletaUI.parse({}));
      expect(ui.elementos.length).toBeGreaterThan(3);
      const erros = analisarInterface(ui).filter((p) => p.severidade === "erro");
      expect(erros).toEqual([]);
    });
  }

  it("o inventário tem 16 slots na grade", () => {
    const ui = criarDeModelo("inventario", "Inv", 1280, 720, PaletaUI.parse({}));
    expect(ui.elementos.filter((e) => /^Slot\d+$/.test(String(e.propriedades.Name)))).toHaveLength(16);
  });

  it("a paleta personalizada entra nas cores do fundo", () => {
    const ui = criarDeModelo("menu_principal", "M", 800, 600, PaletaUI.parse({ destaque: "#ff0000" }));
    const jogar = ui.elementos.find((e) => e.propriedades.Name === "BotaoJogar")!;
    expect(jogar.propriedades.BackgroundColor3).toBe("#ff0000");
  });
});

describe("preview do grid de inventário", () => {
  it("o grid fica no div interno do ScrollingFrame, onde estão os slots", () => {
    const html = htmlPreview(criarDeModelo("inventario", "I", 640, 360, PaletaUI.parse({})));
    const interno = html.match(/<div style="position:relative;width:100%;min-height:auto;([^"]*)"/);
    expect(interno).not.toBeNull();
    expect(interno![1]).toContain("display:grid");
    expect(html).not.toMatch(/data-nome="Slots"[^>]*display:grid/);
  });
});

describe("ferramentas do criador", () => {
  it("criar_interface_de_modelo salva e devolve o id", async () => {
    const r = await chamar("criar_interface_de_modelo", { nome: "HUD", modelo: "hud_jogo" });
    expect(r.interface_id).toMatch(/^ui_/);
    const revisado = await chamar("revisar_interface", { interface_id: r.interface_id });
    expect(revisado.detalhes.filter((p: any) => p.severidade === "erro")).toEqual([]);
  });

  it("o criador não recebe ferramentas de apagar nem de exportar", () => {
    for (const proibida of ["apagar_elemento_ui", "apagar_interface", "exportar_interface", "criar_interface"]) {
      expect(FERRAMENTAS_DO_CRIADOR.has(proibida)).toBe(false);
    }
    expect(FERRAMENTAS_DO_CRIADOR.has("gerar_preview_interface")).toBe(true);
  });

  it("sem chave de provedor, o criador falha com erro claro e não deixa interface incompleta sem aviso", async () => {
    await expect(
      chamar("agente_criador_interface", { nome: "Menu", descricao: "menu simples com três botões" }),
    ).rejects.toThrow();
  });

  it("as habilidades cobrem layout, paleta, tipografia e checklist", () => {
    for (const secao of ["REGRAS DE LAYOUT", "PALETA", "TIPOGRAFIA", "COMPONENTES", "CHECKLIST"]) {
      expect(HABILIDADES_INTERFACE).toContain(secao);
    }
  });
});
