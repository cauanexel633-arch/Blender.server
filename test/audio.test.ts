import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpretarLicenca } from "../src/audio/freesound.js";
import { todasFerramentas } from "../src/ferramentas/index.js";

const sonsBrutos = [
  {
    id: 101,
    name: "Explosao curta",
    username: "autorA",
    license: "http://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/s/101/",
    duration: 2.34,
    previews: { "preview-hq-mp3": "https://cdn.test/101.mp3", "preview-lq-mp3": "https://cdn.test/101-lq.mp3" },
    tags: ["explosion", "boom"],
  },
  {
    id: 102,
    name: "Passos NC",
    username: "autorB",
    license: "http://creativecommons.org/licenses/by-nc/3.0/",
    url: "https://freesound.org/s/102/",
    duration: 4,
    previews: { "preview-hq-mp3": "https://cdn.test/102.mp3" },
    tags: ["steps"],
  },
  {
    id: 103,
    name: "Chuva longa",
    username: "autorC",
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://freesound.org/s/103/",
    duration: 120,
    previews: { "preview-lq-mp3": "https://cdn.test/103.mp3" },
    tags: ["rain"],
  },
];

const ferramenta = (nome: string) => {
  const f = todasFerramentas.find((t) => t.nome === nome);
  if (!f) throw new Error(`sem ${nome}`);
  return f;
};

describe("licenças", () => {
  it("reconhece CC0, CC BY e marca NC como sem uso comercial", () => {
    expect(interpretarLicenca("https://creativecommons.org/publicdomain/zero/1.0/")).toEqual({ nome: "CC0 (domínio público)", uso_comercial: true });
    expect(interpretarLicenca("http://creativecommons.org/licenses/by/4.0/").uso_comercial).toBe(true);
    expect(interpretarLicenca("http://creativecommons.org/licenses/by-nc/3.0/").uso_comercial).toBe(false);
    expect(interpretarLicenca("algo estranho").uso_comercial).toBe(false);
  });
});

describe("buscar_audio", () => {
  let chamadas: { url: string; headers: Record<string, string> }[];

  beforeEach(() => {
    process.env.FREESOUND_API_KEY = "chave-de-teste";
    chamadas = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        chamadas.push({ url: String(url), headers: init?.headers as Record<string, string> });
        return new Response(JSON.stringify({ results: sonsBrutos }), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FREESOUND_API_KEY;
  });

  it("envia a chave no cabeçalho, não na URL", async () => {
    await ferramenta("buscar_audio").executar({ consulta: "explosao", quantidade: 5, apenas_uso_comercial: true });
    expect(chamadas[0].headers.Authorization).toBe("Token chave-de-teste");
    expect(chamadas[0].url).not.toContain("chave-de-teste");
    expect(chamadas[0].url).toContain("query=explosao");
  });

  it("por padrão exclui licenças NC e devolve atribuição e prévia", async () => {
    const r = await ferramenta("buscar_audio").executar({ consulta: "explosao", quantidade: 5, apenas_uso_comercial: true });
    const dados = JSON.parse((r[0] as { text: string }).text);
    expect(dados.sons.map((s: { id: number }) => s.id)).toEqual([101, 103]);
    expect(dados.sons[0]).toMatchObject({ autor: "autorA", licenca: "CC BY", previa_url: "https://cdn.test/101.mp3" });
  });

  it("filtra por duração máxima", async () => {
    const r = await ferramenta("buscar_audio").executar({ consulta: "explosao", quantidade: 5, duracao_max_seg: 10, apenas_uso_comercial: true });
    const dados = JSON.parse((r[0] as { text: string }).text);
    expect(dados.sons.map((s: { id: number }) => s.id)).toEqual([101]);
  });

  it("sem chave configurada, falha com mensagem clara", async () => {
    delete process.env.FREESOUND_API_KEY;
    await expect(ferramenta("buscar_audio").executar({ consulta: "explosao", quantidade: 1, apenas_uso_comercial: true })).rejects.toThrow(/FREESOUND_API_KEY/);
  });
});

describe("baixar_audio", () => {
  beforeEach(() => {
    process.env.FREESOUND_API_KEY = "chave-de-teste";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).includes("/sounds/101/")) {
          return new Response(JSON.stringify(sonsBrutos[0]), { status: 200 });
        }
        return new Response(Buffer.from("ID3-fake-mp3"), { status: 200, headers: { "content-type": "audio/mpeg" } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FREESOUND_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("recusa a chamada sem confirmar=true", async () => {
    expect(() => ferramenta("baixar_audio").executar({ id: 101, confirmar: false })).toThrow(/confirmar|true/);
  });

  it("sem armazenamento, devolve atribuição e o áudio inline", async () => {
    const r = await ferramenta("baixar_audio").executar({ id: 101, confirmar: true });
    const texto = JSON.parse((r[0] as { text: string }).text);
    expect(texto.atribuicao).toContain("por autorA (CC BY)");
    const recurso = r[1] as { type: string; resource: { mimeType: string; blob: string } };
    expect(recurso.type).toBe("resource");
    expect(recurso.resource.mimeType).toBe("audio/mpeg");
    expect(Buffer.from(recurso.resource.blob, "base64").toString()).toBe("ID3-fake-mp3");
  });
});
