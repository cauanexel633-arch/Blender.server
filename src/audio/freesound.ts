/**
 * Cliente mínimo da API da Freesound (sons com licença livre).
 * A busca e os metadados usam a chave da API (FREESOUND_API_KEY), enviada no cabeçalho Authorization.
 * Baixar o arquivo original exige OAuth2 na Freesound; aqui usamos as prévias MP3 públicas.
 */

const BASE = "https://freesound.org/apiv2";
const TIMEOUT_MS = 15_000;
export const LIMITE_PREVIA_BYTES = 15 * 1024 * 1024;

export interface Som {
  id: number;
  titulo: string;
  autor: string;
  licenca: string;
  uso_comercial: boolean;
  duracao_seg: number;
  pagina: string;
  previa_url: string | null;
  tags: string[];
}

interface RespostaBusca {
  results?: BrutoSom[];
}

interface BrutoSom {
  id: number;
  name: string;
  username: string;
  license: string;
  url: string;
  duration: number;
  previews?: Record<string, string>;
  tags?: string[];
}

function chave(): string {
  const valor = process.env.FREESOUND_API_KEY;
  if (!valor) throw new Error("FREESOUND_API_KEY não está configurada no servidor");
  return valor;
}

async function pedir(caminho: string, parametros: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}${caminho}`);
  for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v);
  const resposta = await fetch(url, {
    headers: { Authorization: `Token ${chave()}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) throw new Error(`Freesound respondeu ${resposta.status}`);
  return resposta.json();
}

/** Interpreta a URL de licença da Freesound e diz se permite uso comercial e modificação. */
export function interpretarLicenca(url: string): { nome: string; uso_comercial: boolean } {
  if (/creativecommons\.org\/publicdomain\/zero/i.test(url)) return { nome: "CC0 (domínio público)", uso_comercial: true };
  const cc = url.match(/creativecommons\.org\/licenses\/([a-z-]+)\//i);
  if (cc) {
    const tipo = cc[1].toLowerCase();
    return { nome: `CC ${tipo.toUpperCase()}`, uso_comercial: !tipo.includes("nc") };
  }
  return { nome: url, uso_comercial: false };
}

function paraSom(bruto: BrutoSom): Som {
  const lic = interpretarLicenca(bruto.license);
  return {
    id: bruto.id,
    titulo: bruto.name,
    autor: bruto.username,
    licenca: lic.nome,
    uso_comercial: lic.uso_comercial,
    duracao_seg: Math.round(bruto.duration * 10) / 10,
    pagina: bruto.url,
    previa_url: bruto.previews?.["preview-hq-mp3"] ?? bruto.previews?.["preview-lq-mp3"] ?? null,
    tags: (bruto.tags ?? []).slice(0, 10),
  };
}

export interface OpcoesBusca {
  consulta: string;
  quantidade: number;
  duracao_max_seg?: number;
  apenas_uso_comercial: boolean;
}

export async function buscarSons(opcoes: OpcoesBusca): Promise<Som[]> {
  // Pede mais do que o necessário, porque os filtros de licença e duração são aplicados aqui.
  const resposta = (await pedir("/search/text/", {
    query: opcoes.consulta,
    page_size: String(Math.min(50, opcoes.quantidade * 3)),
    fields: "id,name,username,license,url,duration,previews,tags",
  })) as RespostaBusca;

  return (resposta.results ?? [])
    .map(paraSom)
    .filter((s) => !opcoes.apenas_uso_comercial || s.uso_comercial)
    .filter((s) => opcoes.duracao_max_seg === undefined || s.duracao_seg <= opcoes.duracao_max_seg)
    .slice(0, opcoes.quantidade);
}

export async function obterSom(id: number): Promise<Som> {
  const bruto = (await pedir(`/sounds/${id}/`, {
    fields: "id,name,username,license,url,duration,previews,tags",
  })) as BrutoSom;
  return paraSom(bruto);
}

/** Baixa a prévia MP3 de um som, com limite de tamanho. */
export async function baixarPrevia(url: string): Promise<Buffer> {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!resposta.ok) throw new Error(`Não foi possível baixar a prévia (${resposta.status})`);
  const declarado = Number(resposta.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_PREVIA_BYTES) throw new Error("Arquivo de áudio grande demais");
  const dados = Buffer.from(await resposta.arrayBuffer());
  if (dados.length > LIMITE_PREVIA_BYTES) throw new Error("Arquivo de áudio grande demais");
  return dados;
}
