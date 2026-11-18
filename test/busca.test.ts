import { afterEach, describe, expect, it, vi } from "vitest";
import { pesquisarWeb } from "../src/web/busca.js";

const HTML_DDG = `
<div class="result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexemplo.com%2Fcadeira&amp;rut=abc">Cadeira de <b>madeira</b></a></h2>
<a class="result__snippet" href="x">Medidas &amp; dicas para <b>cadeira</b>.</a></div>
<div class="result"><h2><a class="result__a" href="https://outro.com/pagina">Outro site</a></h2>
<a class="result__snippet" href="y">Trecho dois.</a></div>`;

afterEach(() => vi.unstubAllGlobals());

describe("pesquisa web gratuita", () => {
  it("lê os resultados do DuckDuckGo, decodifica o redirecionamento e limpa o HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(HTML_DDG, { status: 200 })));
    const r = await pesquisarWeb("cadeira", 5);
    expect(r).toEqual([
      { titulo: "Cadeira de madeira", url: "https://exemplo.com/cadeira", trecho: "Medidas & dicas para cadeira." },
      { titulo: "Outro site", url: "https://outro.com/pagina", trecho: "Trecho dois." },
    ]);
  });

  it("usa a Wikipédia quando o DuckDuckGo falha", async () => {
    const wiki = { query: { search: [{ title: "Cadeira", snippet: "A <span>cadeira</span> é um móvel." }] } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).includes("duckduckgo")) return new Response("bloqueado", { status: 202 });
        return new Response(JSON.stringify(wiki), { status: 200 });
      }),
    );
    const r = await pesquisarWeb("cadeira", 3);
    expect(r).toEqual([{ titulo: "Cadeira", url: "https://pt.wikipedia.org/wiki/Cadeira", trecho: "A cadeira é um móvel." }]);
  });

  it("falha com mensagem clara quando as duas fontes falham", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    await expect(pesquisarWeb("cadeira", 3)).rejects.toThrow(/indisponível/);
  });
});
