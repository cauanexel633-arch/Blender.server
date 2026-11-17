import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Exportações guardadas no Supabase Storage. O bucket é privado: o cliente recebe só um link
 * assinado, válido por 1 hora. O caminho tem UUID, então o nome do arquivo não revela outras exportações.
 */
const BUCKET = "exportacoes";
export const VALIDADE_LINK_SEG = 60 * 60;
export const LIMITE_ARQUIVO_BYTES = 40_000_000;

let cliente: SupabaseClient | null | undefined;
let bucketPronto = false;

function clienteSupabase(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cliente = url && chave ? createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cliente;
}

export interface LinkExportacao {
  url: string;
  expira_em: string;
}

/**
 * Guarda o arquivo e devolve um link temporário.
 * Devolve null quando o Supabase não está configurado (desenvolvimento local, testes).
 */
export async function publicarExportacao(nome: string, dados: Buffer, mime: string): Promise<LinkExportacao | null> {
  const db = clienteSupabase();
  if (!db) return null;

  if (!bucketPronto) {
    const { error } = await db.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Storage: ${error.message}`);
    bucketPronto = true;
  }

  const caminho = `${randomUUID()}/${nome}`;
  const envio = await db.storage.from(BUCKET).upload(caminho, dados, { contentType: mime, upsert: false });
  if (envio.error) throw new Error(`Storage: ${envio.error.message}`);

  const link = await db.storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_LINK_SEG);
  if (link.error || !link.data) throw new Error(`Storage: ${link.error?.message ?? "link não gerado"}`);

  return {
    url: link.data.signedUrl,
    expira_em: new Date(Date.now() + VALIDADE_LINK_SEG * 1000).toISOString(),
  };
}
