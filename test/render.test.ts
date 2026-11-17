import { describe, expect, it } from "vitest";
import { renderizarCena } from "../src/render/renderizar.js";
import type { Cena } from "../src/geometria/tipos.js";

// Só roda com um Chrome disponível: CHROME_PATH=/usr/bin/google-chrome npm test
describe.skipIf(!process.env.CHROME_PATH)("renderização em Chromium headless", () => {
  it("renderiza uma cena com um cubo texturizado e devolve PNG", async () => {
    const cena: Cena = {
      id: "cena_render",
      nome: "Render",
      criada_em: "",
      atualizada_em: "",
      objetos: [
        {
          id: "cubo",
          nome: "cubo",
          origem: { tipo: "primitiva", primitiva: { forma: "cubo", tamanho: 2 } },
          transformacao: { posicao: [0, 0, 0], rotacao_graus: [20, 30, 0], escala: [1, 1, 1] },
          material: {
            cor: "#2060ff",
            metalico: 0.2,
            rugosidade: 0.4,
            opacidade: 1,
            textura: { tipo: "procedural", padrao: "xadrez", cor_secundaria: "#ffffff", escala: 3 },
          },
          visivel: true,
        },
      ],
    };

    const r = await renderizarCena(cena, "isometrica", 400, 300);
    expect(r.png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(r.png.length).toBeGreaterThan(2000);
  }, 90_000);
});
