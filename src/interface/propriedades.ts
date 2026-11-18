/**
 * Classes e propriedades de interface no mesmo formato do Roblox Studio (nomes e tipos).
 * Valores no JSON: número, texto, booleano, "#rrggbb" para Color3, [xs, xo, ys, yo] para UDim2,
 * [s, o] para UDim, [x, y] para Vector2 e [x0, y0, x1, y1] para Rect. Enums são o nome do item (ex.: "Center").
 */

export const CLASSES_UI = [
  "ScreenGui",
  "Frame",
  "ScrollingFrame",
  "TextLabel",
  "TextButton",
  "TextBox",
  "ImageLabel",
  "ImageButton",
  "UICorner",
  "UIStroke",
  "UIPadding",
  "UIListLayout",
  "UIGridLayout",
  "UIAspectRatioConstraint",
  "UISizeConstraint",
  "UITextSizeConstraint",
  "UIScale",
  "UIGradient",
] as const;
export type ClasseUI = (typeof CLASSES_UI)[number];

export type Valor = string | number | boolean | number[];

export interface Definicao {
  tipo: "string" | "bool" | "number" | "color" | "udim2" | "udim" | "vector2" | "rect" | "enum";
  padrao: Valor;
  /** Para enum: itens válidos e o nome do Enum no Roblox (ex.: "TextXAlignment"). */
  valores?: readonly string[];
  roblox?: string;
}

const S = (padrao: string): Definicao => ({ tipo: "string", padrao });
const B = (padrao: boolean): Definicao => ({ tipo: "bool", padrao });
const N = (padrao: number): Definicao => ({ tipo: "number", padrao });
const C = (padrao: string): Definicao => ({ tipo: "color", padrao });
const U2 = (padrao: number[]): Definicao => ({ tipo: "udim2", padrao });
const U1 = (padrao: number[]): Definicao => ({ tipo: "udim", padrao });
const V2 = (padrao: number[]): Definicao => ({ tipo: "vector2", padrao });
const R4 = (padrao: number[]): Definicao => ({ tipo: "rect", padrao });
const E = (roblox: string, valores: readonly string[], padrao: string): Definicao => ({
  tipo: "enum",
  padrao,
  valores,
  roblox,
});

const FONTES = [
  "Legacy", "Arial", "ArialBold", "SourceSans", "SourceSansBold", "SourceSansSemibold", "SourceSansLight",
  "SourceSansItalic", "Gotham", "GothamMedium", "GothamSemibold", "GothamBold", "Roboto", "RobotoMono",
  "Bangers", "Cartoon", "Code", "Fantasy", "Garamond", "Highway", "Kalam", "Merriweather", "Nunito",
  "Oswald", "PermanentMarker", "Sarpanch", "SciFi", "Ubuntu",
] as const;

const ALINHAMENTO_X = ["Left", "Center", "Right"] as const;
const ALINHAMENTO_Y = ["Top", "Center", "Bottom"] as const;
const ALINHAMENTO_LAYOUT_X = ["Left", "Center", "Right"] as const;
const ALINHAMENTO_LAYOUT_Y = ["Top", "Center", "Bottom"] as const;

const OBJETO_GUI = {
  Name: S(""),
  Visible: B(true),
  Position: U2([0, 0, 0, 0]),
  Size: U2([0, 100, 0, 100]),
  AnchorPoint: V2([0, 0]),
  BackgroundColor3: C("#ffffff"),
  BackgroundTransparency: N(0),
  BorderColor3: C("#1b1a1c"),
  BorderSizePixel: N(1),
  ClipsDescendants: B(false),
  Rotation: N(0),
  ZIndex: N(1),
  LayoutOrder: N(0),
  AutomaticSize: E("AutomaticSize", ["None", "X", "Y", "XY"], "None"),
  Active: B(false),
};

const TEXTO = {
  Text: S(""),
  TextColor3: C("#191919"),
  TextTransparency: N(0),
  TextSize: N(14),
  TextScaled: B(false),
  TextWrapped: B(false),
  TextXAlignment: E("TextXAlignment", ALINHAMENTO_X, "Center"),
  TextYAlignment: E("TextYAlignment", ALINHAMENTO_Y, "Center"),
  Font: E("Font", FONTES, "Legacy"),
  RichText: B(false),
  LineHeight: N(1),
  TextStrokeColor3: C("#000000"),
  TextStrokeTransparency: N(1),
};

const IMAGEM = {
  Image: S(""),
  ImageColor3: C("#ffffff"),
  ImageTransparency: N(0),
  ScaleType: E("ScaleType", ["Stretch", "Slice", "Tile", "Fit", "Crop"], "Stretch"),
  SliceCenter: R4([0, 0, 0, 0]),
  ImageRectOffset: V2([0, 0]),
  ImageRectSize: V2([0, 0]),
};

const LAYOUT = {
  FillDirection: E("FillDirection", ["Horizontal", "Vertical"], "Vertical"),
  HorizontalAlignment: E("HorizontalAlignment", ALINHAMENTO_LAYOUT_X, "Left"),
  VerticalAlignment: E("VerticalAlignment", ALINHAMENTO_LAYOUT_Y, "Top"),
  SortOrder: E("SortOrder", ["LayoutOrder", "Name"], "LayoutOrder"),
};

/** Propriedades de cada classe, na ordem em que são escritas no script gerado. */
export const DEFINICOES: Record<ClasseUI, Record<string, Definicao>> = {
  ScreenGui: {
    Name: S("ScreenGui"),
    Enabled: B(true),
    ResetOnSpawn: B(true),
    ZIndexBehavior: E("ZIndexBehavior", ["Sibling", "Global"], "Sibling"),
    IgnoreGuiInset: B(false),
    DisplayOrder: N(0),
  },
  Frame: { ...OBJETO_GUI, Name: S("Frame"), BackgroundColor3: C("#a3a2a5") },
  ScrollingFrame: {
    ...OBJETO_GUI,
    Name: S("ScrollingFrame"),
    BackgroundColor3: C("#a3a2a5"),
    CanvasSize: U2([0, 0, 0, 0]),
    AutomaticCanvasSize: E("AutomaticSize", ["None", "X", "Y", "XY"], "None"),
    CanvasPosition: V2([0, 0]),
    ScrollBarThickness: N(12),
    ScrollingDirection: E("ScrollingDirection", ["X", "Y", "XY"], "XY"),
    ScrollBarImageColor3: C("#000000"),
    ScrollBarImageTransparency: N(0),
  },
  TextLabel: { ...OBJETO_GUI, ...TEXTO, Name: S("TextLabel"), BackgroundTransparency: N(1) },
  TextButton: { ...OBJETO_GUI, ...TEXTO, Name: S("TextButton"), BackgroundColor3: C("#a3a2a5"), AutoButtonColor: B(true) },
  TextBox: {
    ...OBJETO_GUI,
    ...TEXTO,
    Name: S("TextBox"),
    PlaceholderText: S(""),
    PlaceholderColor3: C("#b2b2b2"),
    ClearTextOnFocus: B(true),
    MultiLine: B(false),
  },
  ImageLabel: { ...OBJETO_GUI, ...IMAGEM, Name: S("ImageLabel"), BackgroundTransparency: N(1) },
  ImageButton: { ...OBJETO_GUI, ...IMAGEM, Name: S("ImageButton"), BackgroundColor3: C("#a3a2a5"), AutoButtonColor: B(true) },
  UICorner: { Name: S("UICorner"), CornerRadius: U1([0, 8]) },
  UIStroke: {
    Name: S("UIStroke"),
    Color: C("#000000"),
    Thickness: N(1),
    Transparency: N(0),
    ApplyStrokeMode: E("ApplyStrokeMode", ["Contextual", "Border"], "Contextual"),
    LineJoinMode: E("LineJoinMode", ["Round", "Bevel", "Miter"], "Round"),
    Enabled: B(true),
  },
  UIPadding: {
    Name: S("UIPadding"),
    PaddingTop: U1([0, 0]),
    PaddingBottom: U1([0, 0]),
    PaddingLeft: U1([0, 0]),
    PaddingRight: U1([0, 0]),
  },
  UIListLayout: {
    Name: S("UIListLayout"),
    ...LAYOUT,
    Padding: U1([0, 0]),
  },
  UIGridLayout: {
    Name: S("UIGridLayout"),
    CellSize: U2([0, 100, 0, 100]),
    CellPadding: U2([0, 10, 0, 10]),
    FillDirection: E("FillDirection", ["Horizontal", "Vertical"], "Horizontal"),
    HorizontalAlignment: E("HorizontalAlignment", ALINHAMENTO_LAYOUT_X, "Left"),
    VerticalAlignment: E("VerticalAlignment", ALINHAMENTO_LAYOUT_Y, "Top"),
    SortOrder: E("SortOrder", ["LayoutOrder", "Name"], "LayoutOrder"),
    StartCorner: E("StartCorner", ["TopLeft", "TopRight", "BottomLeft", "BottomRight"], "TopLeft"),
    FillDirectionMaxCells: N(0),
  },
  UIAspectRatioConstraint: {
    Name: S("UIAspectRatioConstraint"),
    AspectRatio: N(1),
    AspectType: E("AspectType", ["FitWithinMaxSize", "ScaleWithParentSize"], "FitWithinMaxSize"),
    DominantAxis: E("DominantAxis", ["Width", "Height"], "Width"),
  },
  UISizeConstraint: { Name: S("UISizeConstraint"), MinSize: V2([0, 0]), MaxSize: V2([10000, 10000]) },
  UITextSizeConstraint: { Name: S("UITextSizeConstraint"), MinTextSize: N(1), MaxTextSize: N(100) },
  UIScale: { Name: S("UIScale"), Scale: N(1) },
  UIGradient: { Name: S("UIGradient"), Color1: C("#ffffff"), Color2: C("#a3a2a5"), Rotation: N(0) },
};

/** Classes que são modificadores (UI*) e não têm área própria; ficam dentro de um elemento. */
export const MODIFICADORES: readonly ClasseUI[] = [
  "UICorner", "UIStroke", "UIPadding", "UIListLayout", "UIGridLayout",
  "UIAspectRatioConstraint", "UISizeConstraint", "UITextSizeConstraint", "UIScale", "UIGradient",
];

/** Elementos visíveis, que podem ter filhos. */
export const ELEMENTOS_GUI: readonly ClasseUI[] = [
  "Frame", "ScrollingFrame", "TextLabel", "TextButton", "TextBox", "ImageLabel", "ImageButton",
];

const COR = /^#[0-9a-fA-F]{6}$/;

function numeroFinito(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function listaNumeros(v: unknown, tamanho: number): v is number[] {
  return Array.isArray(v) && v.length === tamanho && v.every(numeroFinito);
}

/** Valida e normaliza o valor de uma propriedade. Lança erro com o motivo quando é inválido. */
export function validarPropriedade(classe: ClasseUI, nome: string, valor: unknown): Valor {
  const def = DEFINICOES[classe][nome];
  if (!def) {
    const validas = Object.keys(DEFINICOES[classe]).join(", ");
    throw new Error(`"${nome}" não é propriedade de ${classe}. Propriedades: ${validas}`);
  }
  const erro = (esperado: string) => new Error(`${classe}.${nome} espera ${esperado}`);
  switch (def.tipo) {
    case "string":
      if (typeof valor !== "string") throw erro("texto");
      return valor;
    case "bool":
      if (typeof valor !== "boolean") throw erro("true ou false");
      return valor;
    case "number":
      if (!numeroFinito(valor)) throw erro("um número");
      return valor;
    case "color":
      if (typeof valor !== "string" || !COR.test(valor)) throw erro('uma cor "#rrggbb"');
      return valor.toLowerCase();
    case "udim2":
      if (!listaNumeros(valor, 4)) throw erro("[xs, xo, ys, yo]");
      return valor;
    case "udim":
      if (!listaNumeros(valor, 2)) throw erro("[escala, offset]");
      return valor;
    case "vector2":
      if (!listaNumeros(valor, 2)) throw erro("[x, y]");
      return valor;
    case "rect":
      if (!listaNumeros(valor, 4)) throw erro("[x0, y0, x1, y1]");
      return valor;
    case "enum":
      if (typeof valor !== "string" || !def.valores!.includes(valor)) {
        throw erro(`um destes valores: ${def.valores!.join(", ")}`);
      }
      return valor;
  }
}

/** Propriedades de uma classe com os valores padrão, já normalizados. */
export function padroesDe(classe: ClasseUI): Record<string, Valor> {
  const saida: Record<string, Valor> = {};
  for (const [nome, def] of Object.entries(DEFINICOES[classe])) {
    saida[nome] = Array.isArray(def.padrao) ? [...def.padrao] : def.padrao;
  }
  return saida;
}
