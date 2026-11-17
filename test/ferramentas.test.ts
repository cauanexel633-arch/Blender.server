import { beforeEach, describe, expect, it } from "vitest";
import { definirLoja, obterLoja } from "../src/armazenamento/loja.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";
import { verificarAutorizacao } from "../src/auth.js";
import { lerPagina, htmlParaTexto } from "../src/web/busca.js";

// Chama uma ferramenta pelo nome, como faria o cliente MCP, e devolve o JSON do texto.
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

describe("fluxo completo de ferramentas (loja em memória)", () => {
  beforeEach(() => {
    definirLoja(undefined);
    expect(obterLoja().persistente).toBe(false);
  });

  it("cria cena, primitiva, transforma, faz booleana e inspeciona", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Caixa" });
    const { objeto_id: caixa } = await chamar("criar_primitiva", { cena_id, forma: "cubo", tamanho: 2, nome: "caixa" });
    const { objeto_id: furo } = await chamar("criar_primitiva", { cena_id, forma: "esfera", raio: 0.5, nome: "furo" });
    await chamar("transformar", { cena_id, objeto_id: furo, posicao: [0, 0, 0] });
    const { objeto_id: bool } = await chamar("criar_booleana", {
      cena_id,
      operacao: "subtracao",
      objeto_a: caixa,
      objeto_b: furo,
      nome: "caixa_oca",
    });

    const relatorio = await chamar("inspecionar_cena", { cena_id });
    expect(relatorio.objetos_visiveis).toBe(1);
    expect(relatorio.objetos_ocultos).toBe(2);
    expect(relatorio.objetos[0].nome).toBe("caixa_oca");
    expect(relatorio.volume_total).toBeCloseTo(8 - (4 / 3) * Math.PI * 0.125, 1);
    expect(bool).toBeTruthy();
  });

  it("não deixa apagar operando de booleana, e liberar ao apagar a booleana", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "T" });
    const { objeto_id: a } = await chamar("criar_primitiva", { cena_id, forma: "cubo" });
    const { objeto_id: b } = await chamar("criar_primitiva", { cena_id, forma: "esfera" });
    const { objeto_id: bool } = await chamar("criar_booleana", { cena_id, operacao: "uniao", objeto_a: a, objeto_b: b });

    await expect(chamar("apagar_objeto", { cena_id, objeto_id: a, confirmar: true })).rejects.toThrow(/operando/);
    await expect(chamar("criar_booleana", { cena_id, operacao: "uniao", objeto_a: a, objeto_b: b })).rejects.toThrow(
      /outra booleana/,
    );

    await chamar("apagar_objeto", { cena_id, objeto_id: bool, confirmar: true });
    const cena = await chamar("obter_cena", { cena_id });
    expect(cena.objetos.map((o: { id: string }) => o.id).sort()).toEqual([a, b].sort());
  });

  it("define material e textura procedural, depois remove a textura", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "M" });
    const { objeto_id } = await chamar("criar_primitiva", { cena_id, forma: "esfera", cor: "#ff0000" });
    await chamar("definir_material", { cena_id, objeto_id, metalico: 1, rugosidade: 0.2 });
    const com = await chamar("aplicar_textura", {
      cena_id,
      objeto_id,
      tipo: "procedural",
      padrao: "listras",
      cor_secundaria: "#000000",
      escala: 8,
    });
    expect(com.textura).toMatchObject({ tipo: "procedural", padrao: "listras", escala: 8 });

    const obj = (await chamar("obter_cena", { cena_id })).objetos[0];
    expect(obj.material).toMatchObject({ cor: "#ff0000", textura: "procedural" });

    const sem = await chamar("aplicar_textura", { cena_id, objeto_id, tipo: "remover" });
    expect(sem.textura).toBeNull();
  });

  it("somar transformações acumula; definir substitui", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "S" });
    const { objeto_id } = await chamar("criar_primitiva", { cena_id, forma: "cubo", posicao: [1, 0, 0] });
    await chamar("transformar", { cena_id, objeto_id, modo: "somar", posicao: [1, 2, 3] });
    let obj = (await chamar("obter_cena", { cena_id })).objetos[0];
    expect(obj.posicao).toEqual([2, 2, 3]);
    await chamar("transformar", { cena_id, objeto_id, posicao: [0, 0, 0] });
    obj = (await chamar("obter_cena", { cena_id })).objetos[0];
    expect(obj.posicao).toEqual([0, 0, 0]);
  });

  it("extrusão e revolução entram como objetos e exportam STL e GLB", async () => {
    const { cena_id } = await chamar("criar_cena", { nome: "Peças" });
    await chamar("criar_extrusao", {
      cena_id,
      contorno: [
        [0, 0],
        [2, 0],
        [1, 1],
      ],
      profundidade: 0.5,
      nome: "suporte",
    });
    await chamar("criar_revolucao", {
      cena_id,
      perfil: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      nome: "pino",
    });

    const stl = await chamar("exportar_modelo", { cena_id, formato: "stl" });
    expect(stl.type).toBeUndefined();
    const glbRes = await todasFerramentas.find((f) => f.nome === "exportar_modelo")!.executar({ cena_id, formato: "glb" });
    const recurso = glbRes[0] as { type: string; resource: { blob: string; mimeType: string } };
    expect(recurso.type).toBe("resource");
    expect(recurso.resource.mimeType).toBe("model/gltf-binary");
    expect(Buffer.from(recurso.resource.blob, "base64").readUInt32LE(0)).toBe(0x46546c67);
  });

  it("erros claros para cena e objeto inexistentes, e validação de argumentos", async () => {
    await expect(chamar("obter_cena", { cena_id: "nao_existe" })).rejects.toThrow(/não encontrada/);
    const { cena_id } = await chamar("criar_cena", { nome: "E" });
    await expect(chamar("transformar", { cena_id, objeto_id: "x", posicao: [0, 0, 0] })).rejects.toThrow(/não existe/);
    await expect(chamar("criar_primitiva", { cena_id, forma: "cubo", cor: "vermelho" })).rejects.toThrow();
    await expect(chamar("apagar_cena", { cena_id })).rejects.toThrow();
  });

  it("listar_cenas resume as cenas criadas", async () => {
    await chamar("criar_cena", { nome: "Uma" });
    await chamar("criar_cena", { nome: "Duas" });
    const lista = await chamar("listar_cenas");
    expect(lista.map((c: { nome: string }) => c.nome).sort()).toEqual(["Duas", "Uma"]);
  });
});

describe("autenticação", () => {
  it("aceita token correto e recusa ausente, errado ou mal formado", () => {
    expect(verificarAutorizacao("Bearer segredo-123", "segredo-123").ok).toBe(true);
    expect(verificarAutorizacao("bearer segredo-123", "segredo-123").ok).toBe(true);
    expect(verificarAutorizacao("Bearer errado", "segredo-123").ok).toBe(false);
    expect(verificarAutorizacao(undefined, "segredo-123").ok).toBe(false);
    expect(verificarAutorizacao("segredo-123", "segredo-123").ok).toBe(false);
  });

  it("falha fechada quando MCP_TOKEN não está configurado", () => {
    const r = verificarAutorizacao("Bearer qualquer", undefined);
    expect(r).toMatchObject({ ok: false, status: 500 });
  });
});

describe("web: extração de texto e proteção contra SSRF", () => {
  it("remove scripts, tags e decodifica entidades", () => {
    const { titulo, texto } = htmlParaTexto(
      "<html><head><title>Garrafa &amp; tampa</title><style>p{}</style></head><body><script>x()</script><p>Altura: 20&nbsp;cm</p></body></html>",
    );
    expect(titulo).toBe("Garrafa & tampa");
    expect(texto).toBe("Altura: 20 cm");
  });

  it("bloqueia localhost e endereços privados", async () => {
    await expect(lerPagina("http://127.0.0.1/admin", 1000)).rejects.toThrow(/interno/);
    await expect(lerPagina("http://localhost:3000", 1000)).rejects.toThrow(/interno/);
    await expect(lerPagina("http://192.168.0.10", 1000)).rejects.toThrow(/interno/);
    await expect(lerPagina("file:///etc/passwd", 1000)).rejects.toThrow(/http/);
  });
});
