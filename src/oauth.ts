import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth 2.1 para o MCP (authorization code + PKCE S256, registro dinâmico de cliente).
 * Sem banco: clientes, códigos e tokens são payloads assinados com HMAC a partir de MCP_TOKEN.
 */

export const SEG = {
  codigo: 5 * 60,
  acesso: 60 * 60,
  refresh: 30 * 24 * 60 * 60,
  cliente: 10 * 365 * 24 * 60 * 60,
};

const chaveAssinatura = (): Buffer => {
  const base = process.env.MCP_TOKEN;
  if (!base) throw new Error("MCP_TOKEN não configurado");
  return createHmac("sha256", base).update("bender-oauth-v1").digest();
};

const agoraSeg = () => Math.floor(Date.now() / 1000);

export function assinar(payload: Record<string, unknown>, validadeSeg: number): string {
  const corpo = Buffer.from(JSON.stringify({ ...payload, exp: agoraSeg() + validadeSeg })).toString("base64url");
  const assinatura = createHmac("sha256", chaveAssinatura()).update(corpo).digest("base64url");
  return `${corpo}.${assinatura}`;
}

/** Devolve o payload se a assinatura for válida e o prazo não tiver vencido. */
export function verificar<T extends Record<string, unknown>>(token: string, tipo: string): (T & { exp: number }) | null {
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [corpo, assinatura] = partes;
  const esperada = createHmac("sha256", chaveAssinatura()).update(corpo).digest();
  const recebida = Buffer.from(assinatura, "base64url");
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;
  let payload: T & { exp: number; tipo?: string };
  try {
    payload = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.tipo !== tipo || typeof payload.exp !== "number" || payload.exp < agoraSeg()) return null;
  return payload;
}

/** PKCE: code_challenge = BASE64URL(SHA256(code_verifier)). */
export function verificarPkce(verificador: string, desafio: string): boolean {
  const calculado = createHash("sha256").update(verificador).digest("base64url");
  const a = Buffer.from(calculado);
  const b = Buffer.from(desafio);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function senhaCorreta(recebida: string): boolean {
  const esperada = process.env.MCP_TOKEN;
  if (!esperada || !recebida) return false;
  const a = createHash("sha256").update(recebida).digest();
  const b = createHash("sha256").update(esperada).digest();
  return timingSafeEqual(a, b);
}

export function novoSegredo(): string {
  return randomBytes(16).toString("base64url");
}

export function escapar(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Corpo de formulário ou JSON, como o runtime da Vercel pode entregar. */
export function lerCorpo(corpo: unknown): Record<string, string> {
  if (typeof corpo === "string") {
    return Object.fromEntries(new URLSearchParams(corpo)) as Record<string, string>;
  }
  if (corpo && typeof corpo === "object") {
    return Object.fromEntries(Object.entries(corpo).map(([k, v]) => [k, String(v)]));
  }
  return {};
}

export function urlBase(host: string | undefined): string {
  return (process.env.PUBLIC_URL ?? `https://${host ?? "localhost"}`).replace(/\/$/, "");
}
