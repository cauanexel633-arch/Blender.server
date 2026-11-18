import { DEFINICOES, type Valor } from "./propriedades.js";
import { filhosDe, raizDe, type ElementoUI, type InterfaceUI } from "./tipos.js";

const num = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6))));

/** Texto Lua entre aspas, com escapes. */
function luaTexto(t: string): string {
  return `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "").replace(/\n/g, "\\n")}"`;
}

function luaValor(def: { tipo: string; roblox?: string }, valor: Valor): string {
  const v = valor as number[];
  switch (def.tipo) {
    case "string":
      return luaTexto(String(valor));
    case "bool":
      return String(valor);
    case "number":
      return num(Number(valor));
    case "color": {
      const h = String(valor);
      return `Color3.fromRGB(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
    }
    case "udim2":
      return `UDim2.new(${v.map(num).join(", ")})`;
    case "udim":
      return `UDim.new(${v.map(num).join(", ")})`;
    case "vector2":
      return `Vector2.new(${v.map(num).join(", ")})`;
    case "rect":
      return `Rect.new(${v.map(num).join(", ")})`;
    case "enum":
      return `Enum.${def.roblox}.${valor}`;
    default:
      throw new Error(`Tipo de propriedade desconhecido: ${def.tipo}`);
  }
}

/** Ordem em que os elementos são escritos: raiz primeiro, depois cada filho logo após o pai. */
function ordemDeEscrita(ui: InterfaceUI): ElementoUI[] {
  const saida: ElementoUI[] = [];
  const visitar = (el: ElementoUI) => {
    saida.push(el);
    for (const f of filhosDe(ui, el.id)) visitar(f);
  };
  visitar(raizDe(ui));
  return saida;
}

/**
 * LocalScript em Luau que cria a interface inteira no PlayerGui. Escreve todas as propriedades
 * de cada elemento (com os valores da interface), para que o resultado seja o mesmo do preview.
 */
export function gerarLuau(ui: InterfaceUI): string {
  const ordem = ordemDeEscrita(ui);
  const variavel = new Map<string, string>();
  ordem.forEach((el, i) => variavel.set(el.id, `e${i + 1}`));

  const linhas: string[] = [
    `-- Interface "${ui.nome.replace(/[\r\n]/g, " ")}" gerada pelo bender-3d-mcp (${ui.largura}x${ui.altura}).`,
    "-- Coloque como LocalScript em StarterPlayer > StarterPlayerScripts.",
    'local Players = game:GetService("Players")',
    "local jogador = Players.LocalPlayer",
    "",
  ];

  for (const el of ordem) {
    const v = variavel.get(el.id)!;
    const defs = DEFINICOES[el.classe];
    linhas.push(`local ${v} = Instance.new("${el.classe}")`);
    for (const [nome, def] of Object.entries(defs)) {
      if (el.classe === "UIGradient" && (nome === "Color1" || nome === "Color2")) continue;
      const valor = el.propriedades[nome] ?? def.padrao;
      linhas.push(`${v}.${nome} = ${luaValor(def, valor)}`);
    }
    if (el.classe === "UIGradient") {
      const c1 = luaValor(DEFINICOES.UIGradient.Color1, el.propriedades.Color1 ?? DEFINICOES.UIGradient.Color1.padrao);
      const c2 = luaValor(DEFINICOES.UIGradient.Color2, el.propriedades.Color2 ?? DEFINICOES.UIGradient.Color2.padrao);
      linhas.push(`${v}.Color = ColorSequence.new(${c1}, ${c2})`);
    }
    if (el.pai_id === null) {
      linhas.push(`${v}.Parent = jogador:WaitForChild("PlayerGui")`);
    } else {
      linhas.push(`${v}.Parent = ${variavel.get(el.pai_id)}`);
    }
    linhas.push("");
  }
  return linhas.join("\n");
}
