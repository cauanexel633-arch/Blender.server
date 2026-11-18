import { beforeEach, describe, expect, it } from "vitest";
import { definirLoja, obterLoja } from "../src/armazenamento/loja.js";
import { gerarGlbDaCena } from "../src/geometria/exportar.js";
import type { Cena, EfeitoCena } from "../src/geometria/tipos.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";
import { expandirEfeitos } from "../src/vfx3d/efeitos.js";
import { renderizarQuadrosCena } from "../src/render/renderizar.js";

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

const efeitoBase = (extra: Partial<EfeitoCena> = {}): EfeitoCena => ({
  grupo: "fx",
  tipo: "explosao",
  centro: [0, 0, 0],
  quantidade: 10,
  inicio_quadro: 5,
  duracao_quadros: 20,
  velocidade: 1,
  tamanho: 0.05,
  cor_inicial: "#ffcc33",
  cor_final: "#ff3300",
  emissiva: true,
  semente: 42,
  area: [2, 3, 2],
  ...extra,
});

const cenaComEfeito = (efeito: EfeitoCena): Cena => ({
  id: "c",
  nome: "c",
  objetos: [],
  efeitos: [efeito],
  criada_em: "",
  atualizada_em: "",
});

const escalaDe = (cena: Cena, objetoId: string, quadro: number): number[] => {
  const chave = cena.animacao!.chaves.find(
    (c) => c.objeto_id === objetoId && c.propriedade === "escala" && c.quadro === quadro,
  );
  return chave!.valor;
};

describe("expansão de efeitos 3D", () => {
  it("mesma semente gera o mesmo efeito; semente diferente gera outro", () => {
    const a = JSON.stringify(expandirEfeitos(cenaComEfeito(efeitoBase())).animacao);
    const b = JSON.stringify(expandirEfeitos(cenaComEfeito(efeitoBase())).animacao);
    const c = JSON.stringify(expandirEfeitos(cenaComEfeito(efeitoBase({ semente: 7 }))).animacao);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("cria um objeto por partícula, com nomes do grupo, e estende a duração", () => {
    const expandida = expandirEfeitos(cenaComEfeito(efeitoBase()));
    expect(expandida.objetos).toHaveLength(10);
    expect(expandida.objetos[0].nome).toBe("fx_0");
    expect(expandida.animacao!.duracao_quadros).toBeGreaterThanOrEqual(5 + 30);
  });

  it("partículas ficam escondidas (escala zero) antes do início do efeito", () => {
    const expandida = expandirEfeitos(cenaComEfeito(efeitoBase()));
    for (const o of expandida.objetos) {
      expect(escalaDe(expandida, o.id, 0)).toEqual([0, 0, 0]);
    }
  });

  it("todos os tipos geram posições e escalas finitas e algumas partículas visíveis", () => {
    for (const tipo of ["explosao", "fogo", "fumaca", "faiscas", "neve", "chuva"] as const) {
      const expandida = expandirEfeitos(cenaComEfeito(efeitoBase({ tipo, quantidade: 20 })));
      const chaves = expandida.animacao!.chaves;
      expect(chaves.every((c) => c.valor.every(Number.isFinite))).toBe(true);
      expect(chaves.some((c) => c.propriedade === "escala" && c.valor.some((v) => v > 0))).toBe(true);
    }
  });
});

describe("ferramentas de efeitos 3D", () => {
  beforeEach(() => definirLoja(undefined));

  it("cria, lista e apaga um efeito pelo grupo", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Fogo" });
    const r = await chamar("criar_efeito_3d", { cena_id, tipo: "fogo", quantidade: 5, grupo: "chama" });
    expect(r.grupo).toBe("chama");
    expect((await chamar("listar_efeitos_3d", { cena_id }))[0].grupo).toBe("chama");

    await expect(chamar("apagar_efeito_3d", { cena_id, grupo: "chama", confirmar: false })).rejects.toThrow();
    const apagado = await chamar("apagar_efeito_3d", { cena_id, grupo: "chama", confirmar: true });
    expect(apagado.efeitos_restantes).toBe(0);
  });

  it("recusa grupo repetido, efeito que passa do quadro 599 e excesso de amostras", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Limites" });
    await chamar("criar_efeito_3d", { cena_id, tipo: "neve", grupo: "a" });
    await expect(chamar("criar_efeito_3d", { cena_id, tipo: "neve", grupo: "a" })).rejects.toThrow(/Já existe/);
    await expect(
      chamar("criar_efeito_3d", { cena_id, tipo: "neve", grupo: "b", inicio_quadro: 500, duracao_quadros: 100 }),
    ).rejects.toThrow(/quadro 599/);
    await chamar("criar_efeito_3d", { cena_id, tipo: "chuva", grupo: "c", quantidade: 300, duracao_quadros: 200 });
    await expect(
      chamar("criar_efeito_3d", { cena_id, tipo: "chuva", grupo: "d", quantidade: 300, duracao_quadros: 200 }),
    ).rejects.toThrow(/amostras/);
  });

  it("o GLB exportado inclui as partículas com canais de animação", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "GLB" });
    await chamar("criar_efeito_3d", { cena_id, tipo: "faiscas", quantidade: 8, grupo: "f", duracao_quadros: 10 });
    const cena = (await obterLoja().obter(cena_id))!;
    const glb = await gerarGlbDaCena(cena);
    const tamanhoJson = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + tamanhoJson).toString("utf8").trimEnd());
    expect(json.nodes).toHaveLength(8);
    expect(json.animations).toHaveLength(8);
  });
});

describe.skipIf(!process.env.CHROME_PATH)("efeito 3D renderizado com Chromium", () => {
  beforeEach(() => definirLoja(undefined));

  it("a explosão muda de forma entre o começo e o meio do efeito", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Boom" });
    await chamar("criar_efeito_3d", { cena_id, tipo: "explosao", quantidade: 30, inicio_quadro: 0, duracao_quadros: 12, tamanho: 0.2, grupo: "boom" });
    const cena = (await obterLoja().obter(cena_id))!;
    const [inicio, meio] = await renderizarQuadrosCena(cena, "frente", 120, 100, [0, 6]);
    expect(Buffer.compare(inicio, meio)).not.toBe(0);
  }, 90_000);
});
