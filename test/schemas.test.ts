import { describe, expect, it } from "vitest";
import { z } from "zod";
import { todasFerramentas } from "../src/ferramentas/index.js";

/**
 * Clientes de function calling (ChatGPT, entre outros) rejeitam certas construções do JSON Schema:
 * "items" em forma de lista (tupla) e "const". Este teste impede que elas voltem.
 */
function problemas(no: unknown, caminho: string, achados: string[]): void {
  if (Array.isArray(no)) {
    no.forEach((item, i) => problemas(item, `${caminho}[${i}]`, achados));
    return;
  }
  if (!no || typeof no !== "object") return;
  const obj = no as Record<string, unknown>;
  for (const [chave, valor] of Object.entries(obj)) {
    if (chave === "const") achados.push(`${caminho}: const`);
    if (chave === "items" && Array.isArray(valor)) achados.push(`${caminho}: items em forma de lista`);
    problemas(valor, `${caminho}.${chave}`, achados);
  }
}

describe("schemas das ferramentas compatíveis com clientes de function calling", () => {
  for (const ferramenta of todasFerramentas) {
    it(`${ferramenta.nome} não usa tupla nem const`, () => {
      const json = z.toJSONSchema(z.object(ferramenta.schema), { target: "draft-7" });
      const achados: string[] = [];
      problemas(json, ferramenta.nome, achados);
      expect(achados).toEqual([]);
    });
  }

  it("vetores continuam validados em tamanho, mesmo sem tupla", () => {
    const criar = todasFerramentas.find((f) => f.nome === "criar_primitiva");
    expect(criar).toBeDefined();
    // posicao com 2 números é recusada pelo refine
    expect(() =>
      z.object(criar!.schema).parse({ cena_id: "x", forma: "cubo", posicao: [1, 2] }),
    ).toThrow();
  });
});
