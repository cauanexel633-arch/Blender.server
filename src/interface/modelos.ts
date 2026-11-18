import { z } from "zod";
import { adicionarElementoUI, criarInterfaceUI, raizDe, type InterfaceUI } from "./tipos.js";

export const MODELOS_INTERFACE = ["menu_principal", "hud_jogo", "dialogo", "inventario"] as const;
export type ModeloInterface = (typeof MODELOS_INTERFACE)[number];

export const PaletaUI = z.object({
  fundo: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#14141f"),
  superficie: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1e1e2e"),
  destaque: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4f46e5"),
  texto: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
});
export type PaletaUI = z.output<typeof PaletaUI>;

export const DESCRICOES_MODELOS: Record<ModeloInterface, string> = {
  menu_principal: "Tela inicial com título e três botões (Jogar, Configurações, Sair) em um painel centralizado",
  hud_jogo: "HUD de jogo: barra de vida, munição, mapa e área central livre",
  dialogo: "Caixa de diálogo na parte inferior, com nome do personagem, texto e botão Continuar",
  inventario: "Inventário em grade com slots, título e botão de fechar",
};

/** Monta um modelo pronto. O agente criador parte disso e ajusta, em vez de montar tudo do zero. */
export function criarDeModelo(modelo: ModeloInterface, nome: string, largura: number, altura: number, paleta: PaletaUI): InterfaceUI {
  const ui = criarInterfaceUI(nome, largura, altura);
  const raiz = raizDe(ui).id;
  const fundo = adicionarElementoUI(ui, "Frame", raiz, { Name: "Fundo", Size: [1, 0, 1, 0], BackgroundColor3: paleta.fundo });

  if (modelo === "menu_principal") {
    const painel = adicionarElementoUI(ui, "Frame", fundo.id, {
      Name: "PainelMenu", Size: [0, 360, 0, 380], Position: [0.5, 0, 0.5, 0], AnchorPoint: [0.5, 0.5], BackgroundColor3: paleta.superficie,
    });
    adicionarElementoUI(ui, "UICorner", painel.id, { CornerRadius: [0, 16] });
    adicionarElementoUI(ui, "UIPadding", painel.id, { PaddingTop: [0, 24], PaddingLeft: [0, 24], PaddingRight: [0, 24], PaddingBottom: [0, 24] });
    adicionarElementoUI(ui, "UIListLayout", painel.id, { Padding: [0, 14], HorizontalAlignment: "Center" });
    adicionarElementoUI(ui, "TextLabel", painel.id, {
      Name: "Titulo", Text: nome, Size: [1, 0, 0, 64], BackgroundTransparency: 1, TextColor3: paleta.texto, TextSize: 36, Font: "GothamBold",
    });
    for (const [n, t] of [["BotaoJogar", "Jogar"], ["BotaoConfiguracoes", "Configurações"], ["BotaoSair", "Sair"]]) {
      adicionarElementoUI(ui, "TextButton", painel.id, {
        Name: n, Text: t, Size: [1, 0, 0, 52], BackgroundColor3: n === "BotaoJogar" ? paleta.destaque : paleta.fundo,
        TextColor3: paleta.texto, TextSize: 18, Font: "GothamMedium",
      });
    }
  }

  if (modelo === "hud_jogo") {
    const vida = adicionarElementoUI(ui, "Frame", fundo.id, {
      Name: "BarraVidaFundo", Position: [0, 16, 0, 16], Size: [0, 240, 0, 22], BackgroundColor3: paleta.superficie,
    });
    adicionarElementoUI(ui, "UICorner", vida.id, { CornerRadius: [0, 8] });
    const preenchimento = adicionarElementoUI(ui, "Frame", vida.id, {
      Name: "BarraVidaPreenchimento", Size: [0.8, 0, 1, 0], BackgroundColor3: paleta.destaque,
    });
    adicionarElementoUI(ui, "UICorner", preenchimento.id, { CornerRadius: [0, 8] });
    adicionarElementoUI(ui, "TextLabel", fundo.id, {
      Name: "Municao", Text: "30 / 90", Position: [1, -176, 1, -48], Size: [0, 160, 0, 32], AnchorPoint: [0, 0],
      BackgroundTransparency: 1, TextColor3: paleta.texto, TextSize: 20, Font: "GothamBold", TextXAlignment: "Right",
    });
    adicionarElementoUI(ui, "Frame", fundo.id, {
      Name: "Mapa", Position: [1, -156, 0, 16], Size: [0, 140, 0, 140], BackgroundColor3: paleta.superficie, BackgroundTransparency: 0.2,
    });
  }

  if (modelo === "dialogo") {
    const caixa = adicionarElementoUI(ui, "Frame", fundo.id, {
      Name: "CaixaDialogo", Position: [0, 16, 1, -16], AnchorPoint: [0, 1], Size: [1, -32, 0, 160], BackgroundColor3: paleta.superficie,
    });
    adicionarElementoUI(ui, "UICorner", caixa.id, { CornerRadius: [0, 12] });
    adicionarElementoUI(ui, "TextLabel", caixa.id, {
      Name: "NomePersonagem", Text: "Personagem", Position: [0, 16, 0, 12], Size: [0, 260, 0, 28], BackgroundTransparency: 1,
      TextColor3: paleta.texto, TextSize: 20, Font: "GothamBold", TextXAlignment: "Left",
    });
    adicionarElementoUI(ui, "TextLabel", caixa.id, {
      Name: "TextoDialogo", Text: "Texto da fala aparece aqui.", Position: [0, 16, 0, 46], Size: [1, -32, 0, 70], BackgroundTransparency: 1,
      TextColor3: paleta.texto, TextSize: 18, Font: "Gotham", TextXAlignment: "Left", TextYAlignment: "Top", TextWrapped: true,
    });
    adicionarElementoUI(ui, "TextButton", caixa.id, {
      Name: "BotaoContinuar", Text: "Continuar", Position: [1, -150, 1, -48], Size: [0, 130, 0, 36], BackgroundColor3: paleta.destaque,
      TextColor3: paleta.texto, TextSize: 16, Font: "GothamMedium",
    });
  }

  if (modelo === "inventario") {
    const painel = adicionarElementoUI(ui, "Frame", fundo.id, {
      Name: "PainelInventario", Size: [0, 440, 0, 380], Position: [0.5, 0, 0.5, 0], AnchorPoint: [0.5, 0.5], BackgroundColor3: paleta.superficie,
    });
    adicionarElementoUI(ui, "UICorner", painel.id, { CornerRadius: [0, 14] });
    adicionarElementoUI(ui, "TextLabel", painel.id, {
      Name: "Titulo", Text: "Inventário", Position: [0, 16, 0, 12], Size: [1, -32, 0, 40], BackgroundTransparency: 1,
      TextColor3: paleta.texto, TextSize: 26, Font: "GothamBold", TextXAlignment: "Left",
    });
    adicionarElementoUI(ui, "TextButton", painel.id, {
      Name: "BotaoFechar", Text: "X", Position: [1, -48, 0, 12], Size: [0, 36, 0, 36], BackgroundColor3: paleta.fundo,
      TextColor3: paleta.texto, TextSize: 18, Font: "GothamBold",
    });
    const grade = adicionarElementoUI(ui, "ScrollingFrame", painel.id, {
      Name: "Slots", Position: [0, 16, 0, 64], Size: [1, -32, 1, -80], BackgroundTransparency: 1, AutomaticCanvasSize: "Y", CanvasSize: [0, 0, 0, 0],
    });
    adicionarElementoUI(ui, "UIGridLayout", grade.id, { CellSize: [0, 84, 0, 84], CellPadding: [0, 10, 0, 10] });
    for (let i = 1; i <= 16; i++) {
      const slot = adicionarElementoUI(ui, "Frame", grade.id, { Name: `Slot${i}`, BackgroundColor3: paleta.fundo });
      adicionarElementoUI(ui, "UICorner", slot.id, { CornerRadius: [0, 10] });
    }
  }

  return ui;
}
