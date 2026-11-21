import { describe, expect, it } from "vitest";
import { parseVeredito } from "../src/agentes/veredito.js";
import { FERRAMENTAS_DO_REVISOR } from "../src/ferramentas/revisor.js";
import { ferramentasBase, todasFerramentas } from "../src/ferramentas/index.js";

describe("veredito do revisor", () => {
  it("aprova quando não há problema bloqueante nem importante", () => {
    const v = parseVeredito('```json\n{"aprovado": true, "nota": 9, "problemas": [{"gravidade":"menor","onde":"x","o_que":"y","como_corrigir":"z"}]}\n```');
    expect(v.aprovado).toBe(true);
    expect(v.nota).toBe(9);
    expect(v.problemas).toHaveLength(1);
  });

  it("reprova mesmo com aprovado true quando há problema importante", () => {
    const v = parseVeredito('{"aprovado": true, "nota": 8, "problemas": [{"gravidade":"importante","onde":"botão","o_que":"texto cortado","como_corrigir":"aumentar altura"}]}');
    expect(v.aprovado).toBe(false);
  });

  it("resposta fora do formato vira reprovação bloqueante com o texto guardado", () => {
    const v = parseVeredito("achei tudo ótimo, sem problemas");
    expect(v.aprovado).toBe(false);
    expect(v.problemas[0].gravidade).toBe("bloqueante");
    expect(v.resposta_bruta).toContain("ótimo");
  });

  it("gravidade desconhecida vira importante e nota é limitada a 0..10", () => {
    const v = parseVeredito('{"aprovado": true, "nota": 42, "problemas": [{"gravidade":"estranha","o_que":"x"}]}');
    expect(v.nota).toBe(10);
    expect(v.problemas[0].gravidade).toBe("importante");
    expect(v.aprovado).toBe(false);
  });
});

describe("ferramentas do revisor", () => {
  it("só usa ferramentas de leitura e renderização", () => {
    for (const proibida of ["adicionar_elemento_ui", "editar_elemento_ui", "apagar_interface", "exportar_interface", "criar_cena", "exportar_modelo", "transformar", "criar_primitiva"]) {
      expect(FERRAMENTAS_DO_REVISOR.has(proibida)).toBe(false);
    }
  });

  it("todas as ferramentas do revisor existem no servidor", () => {
    const nomes = new Set(ferramentasBase.map((f) => f.nome));
    for (const nome of FERRAMENTAS_DO_REVISOR) expect(nomes.has(nome)).toBe(true);
  });

  it("revisar_trabalho está registrada", () => {
    expect(todasFerramentas.some((f) => f.nome === "revisar_trabalho")).toBe(true);
  });
});
