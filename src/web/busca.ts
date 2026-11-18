import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface ResultadoBusca {
  titulo: string;
  url: string;
  trecho: string;
}

const LIMITE_BAIXAR_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function ipPrivado(ip: string): boolean {
  if (ip.startsWith("::ffff:")) return ipPrivado(ip.slice(7));
  if (isIP(ip) === 6) {
    const minusculo = ip.toLowerCase();
    return (
      minusculo === "::1" ||
      minusculo === "::" ||
      minusculo.startsWith("fc") ||
      minusculo.startsWith("fd") ||
      minusculo.startsWith("fe80")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/** Bloqueia URLs que apontem para redes internas (proteção contra SSRF). */
async function validarUrlPublica(entrada: string): Promise<URL> {
  const url = new URL(entrada);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Apenas URLs http(s) são permitidas");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local")) throw new Error("Endereço interno bloqueado");
  const enderecos = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (enderecos.some((e) => ipPrivado(e.address))) throw new Error("Endereço interno bloqueado");
  return url;
}

/** fetch que valida cada redirecionamento e limita o tamanho lido. */
async function buscarSeguro(entrada: string, cabecalhos: Record<string, string> = {}): Promise<Response> {
  let url = await validarUrlPublica(entrada);
  for (let salto = 0; salto < 4; salto++) {
    const resposta = await fetch(url, {
      headers: { "user-agent": "bender-3d-mcp/0.1 (+agente de pesquisa)", ...cabecalhos },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const local = resposta.headers.get("location");
    if (resposta.status >= 300 && resposta.status < 400 && local) {
      url = await validarUrlPublica(new URL(local, url).toString());
      continue;
    }
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao acessar ${url.toString()}`);
    return resposta;
  }
  throw new Error("Redirecionamentos demais");
}

async function lerLimitado(resposta: Response, limite: number): Promise<Buffer> {
  if (!resposta.body) return Buffer.alloc(0);
  const leitor = resposta.body.getReader();
  const partes: Buffer[] = [];
  let total = 0;
  while (total < limite) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(Buffer.from(value));
    total += value.length;
  }
  await leitor.cancel().catch(() => undefined);
  return Buffer.concat(partes).subarray(0, limite);
}

function decodificarEntidades(texto: string): string {
  const mapa: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
  return texto.replace(/&(#\d+|[a-z]+);/gi, (m, nome: string) => mapa[nome] ?? m);
}

export function htmlParaTexto(html: string): { titulo: string; texto: string } {
  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const semBlocos = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<title[\s\S]*?<\/title>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const texto = decodificarEntidades(semBlocos)
    .split("\n")
    .map((linha) => linha.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { titulo: decodificarEntidades(titulo), texto };
}

/**
 * Busca na web sem chave de API. Usa o DuckDuckGo (versão HTML) e, se ele não responder ou não
 * devolver nada, a Wikipédia em português como alternativa.
 */
export async function pesquisarWeb(consulta: string, quantidade: number): Promise<ResultadoBusca[]> {
  const erros: string[] = [];
  try {
    const resultados = await pesquisarDuckDuckGo(consulta, quantidade);
    if (resultados.length > 0) return resultados;
  } catch (erro) {
    erros.push(`DuckDuckGo: ${(erro as Error).message}`);
  }
  try {
    return await pesquisarWikipedia(consulta, quantidade);
  } catch (erro) {
    erros.push(`Wikipédia: ${(erro as Error).message}`);
  }
  throw new Error(`Busca web indisponível (${erros.join("; ")})`);
}

const CABECALHOS_BUSCA = {
  "user-agent": "Mozilla/5.0 (compatible; bender-3d-mcp/1.0)",
  accept: "text/html,application/json;q=0.9",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
};

function limparHtml(trecho: string): string {
  return decodificarEntidades(trecho.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

async function pesquisarDuckDuckGo(consulta: string, quantidade: number): Promise<ResultadoBusca[]> {
  const resposta = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { ...CABECALHOS_BUSCA, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ q: consulta, kl: "br-pt" }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const html = await resposta.text();

  const links = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const trechos = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  const resultados: ResultadoBusca[] = [];
  links.forEach((m, i) => {
    // O DuckDuckGo embrulha o endereço real num redirecionamento com o parâmetro uddg.
    const href = decodificarEntidades(m[1]);
    const url = new URL(href, "https://duckduckgo.com").searchParams.get("uddg") ?? href;
    if (!/^https?:\/\//.test(url)) return;
    resultados.push({ titulo: limparHtml(m[2]), url, trecho: trechos[i] ? limparHtml(trechos[i][1]) : "" });
  });
  return resultados.slice(0, quantidade);
}

async function pesquisarWikipedia(consulta: string, quantidade: number): Promise<ResultadoBusca[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: consulta,
    srlimit: String(quantidade),
    format: "json",
    origin: "*",
  });
  const resposta = await fetch(`https://pt.wikipedia.org/w/api.php?${params}`, {
    headers: CABECALHOS_BUSCA,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const dados = (await resposta.json()) as { query?: { search?: { title: string; snippet: string }[] } };
  return (dados.query?.search ?? []).map((r) => ({
    titulo: r.title,
    url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    trecho: limparHtml(r.snippet),
  }));
}

/** Lê uma página e devolve texto limpo, truncado em `maxCaracteres`. */
export async function lerPagina(url: string, maxCaracteres: number) {
  const resposta = await buscarSeguro(url, { accept: "text/html,text/plain;q=0.9,*/*;q=0.5" });
  const tipo = resposta.headers.get("content-type") ?? "";
  const bruto = (await lerLimitado(resposta, LIMITE_BAIXAR_BYTES)).toString("utf8");
  const { titulo, texto } = tipo.includes("html") ? htmlParaTexto(bruto) : { titulo: "", texto: bruto };
  return {
    url,
    titulo,
    texto: texto.length > maxCaracteres ? `${texto.slice(0, maxCaracteres)}…` : texto,
    truncado: texto.length > maxCaracteres,
  };
}

/** Baixa uma imagem PNG ou JPEG (detectada pelos bytes iniciais), sem decodificar. */
export async function baixarImagem(url: string): Promise<{ mime: "image/png" | "image/jpeg"; dados: Buffer }> {
  const resposta = await buscarSeguro(url, { accept: "image/png,image/jpeg" });
  const dados = await lerLimitado(resposta, 4 * 1024 * 1024);
  if (dados.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { mime: "image/png", dados };
  if (dados[0] === 0xff && dados[1] === 0xd8 && dados[2] === 0xff) return { mime: "image/jpeg", dados };
  throw new Error("A URL não aponta para uma imagem PNG ou JPEG");
}
