import { describe, expect, it } from "vitest";
import { AREAS, HABILIDADES, textoDaArea } from "../src/habilidades/areas.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";

async function chamar(args: Record<string, unknown>): Promise<Conteudo[]> {
  return todasFerramentas.find((t) => t.nome === "consultar_habilidades")!.executar(args);
}

describe("habilidades por área", () => {
  it("cada área tem título e conteúdo substancial com checklist", () => {
    for (const area of AREAS) {
      expect(HABILIDADES[area].titulo.length).toBeGreaterThan(3);
      expect(HABILIDADES[area].texto.length).toBeGreaterThan(300);
      expect(textoDaArea(area)).toContain(HABILIDADES[area].titulo);
    }
  });

  it("consultar_habilidades sem área lista todas as áreas", async () => {
    const r = await chamar({});
    const json = JSON.parse((r[0] as { text: string }).text);
    expect(json.areas.map((a: { area: string }) => a.area)).toEqual([...AREAS]);
  });

  it("consultar_habilidades com área devolve o guia dela", async () => {
    const r = await chamar({ area: "impressao3d" });
    const texto = (r[0] as { text: string }).text;
    expect(texto).toContain("Impressão 3D");
    expect(texto).toContain("CHECKLIST FINAL");
  });

  it("recusa área desconhecida", async () => {
    await expect(chamar({ area: "culinaria" })).rejects.toThrow();
  });
});
