import { afterEach, describe, expect, it, vi } from "vitest";
import { previaPermitida } from "../src/audio/freesound.js";
import { todasFerramentas } from "../src/ferramentas/index.js";
import type { Conteudo } from "../src/ferramentas/tipos.js";

async function chamar(nome: string, args: Record<string, unknown>): Promise<Conteudo[]> {
  const f = todasFerramentas.find((t) => t.nome === nome)!;
  return f.executar(args);
}

afterEach(() => vi.unstubAllGlobals());

describe("validação de prévias da Freesound", () => {
  it("aceita só https do domínio da Freesound", () => {
    expect(previaPermitida("https://cdn.freesound.org/previews/1/1_2-hq.mp3")).toBe(true);
    expect(previaPermitida("https://freesound.org/data/previews/1/1_2-hq.mp3")).toBe(true);
    expect(previaPermitida("http://cdn.freesound.org/previews/1.mp3")).toBe(false);
    expect(previaPermitida("https://evil.example.com/freesound.org.mp3")).toBe(false);
    expect(previaPermitida("https://freesound.org.evil.com/a.mp3")).toBe(false);
    expect(previaPermitida("não é url")).toBe(false);
  });

  it("recusa prévia de outro host sem chamar a rede", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    await expect(
      chamar("baixar_audio", { id: 1, confirmar: true, previa_url: "https://evil.example.com/a.mp3", titulo: "x", autor: "y", licenca: "CC0", pagina: "https://freesound.org/s/1/" }),
    ).rejects.toThrow(/Freesound/);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("com os dados de buscar_audio, baixa a prévia sem consultar os metadados (uma chamada só)", async () => {
    const fetchFalso = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    const conteudo = await chamar("baixar_audio", {
      id: 42,
      confirmar: true,
      previa_url: "https://cdn.freesound.org/previews/42/42_1-hq.mp3",
      titulo: "Explosao",
      autor: "autor",
      licenca: "CC0 (domínio público)",
      pagina: "https://freesound.org/s/42/",
      uso_comercial: true,
    });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const texto = conteudo.find((c) => c.type === "text") as { text: string } | undefined;
    expect(texto?.text).toContain("Explosao");
  });

  it("sem os dados de atribuição, consulta os metadados antes de baixar", async () => {
    const fetchFalso = vi.fn(async (url: string) => {
      if (String(url).includes("/sounds/")) {
        return new Response(JSON.stringify({ id: 7, name: "Som", username: "a", license: "https://creativecommons.org/publicdomain/zero/1.0/", url: "https://freesound.org/s/7/", duration: 1, previews: { "preview-hq-mp3": "https://cdn.freesound.org/previews/7.mp3" } }), { status: 200 });
      }
      return new Response(new Uint8Array([9]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    process.env.FREESOUND_API_KEY = "teste";
    await chamar("baixar_audio", { id: 7, confirmar: true });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });
});
