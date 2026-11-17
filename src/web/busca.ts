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

/** Busca na web: usa Tavily se TAVILY_API_KEY existir, senão Brave Search (BRAVE_API_KEY). */
export async function pesquisarWeb(consulta: string, quantidade: number): Promise<ResultadoBusca[]> {
  const tavily = process.env.TAVILY_API_KEY;
  const brave = process.env.BRAVE_API_KEY;

  if (tavily) {
    const resposta = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tavily}` },
      body: JSON.stringify({ query: consulta, max_results: quantidade, search_depth: "basic" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) throw new Error(`Tavily respondeu HTTP ${resposta.status}`);
    const dados = (await resposta.json()) as { results?: { title: string; url: string; content: string }[] };
    return (dados.results ?? []).map((r) => ({ titulo: r.title, url: r.url, trecho: r.content }));
  }

  if (brave) {
    const params = new URLSearchParams({ q: consulta, count: String(quantidade) });
    const resposta = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { accept: "application/json", "x-subscription-token": brave },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) throw new Error(`Brave respondeu HTTP ${resposta.status}`);
    const dados = (await resposta.json()) as { web?: { results?: { title: string; url: string; description?: string }[] } };
    return (dados.web?.results ?? []).map((r) => ({ titulo: r.title, url: r.url, trecho: r.description ?? "" }));
  }

  throw new Error("Busca web não configurada: defina TAVILY_API_KEY ou BRAVE_API_KEY");
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
