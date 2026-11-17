import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Cena } from "../geometria/tipos.js";

export interface Loja {
  /** false quando as cenas vivem só na memória desta instância (não sobrevive entre invocações). */
  readonly persistente: boolean;
  listar(): Promise<Cena[]>;
  obter(id: string): Promise<Cena | null>;
  salvar(cena: Cena): Promise<void>;
  apagar(id: string): Promise<boolean>;
}

class LojaMemoria implements Loja {
  readonly persistente = false;
  private readonly cenas = new Map<string, Cena>();

  async listar(): Promise<Cena[]> {
    return [...this.cenas.values()].map((c) => structuredClone(c));
  }
  async obter(id: string): Promise<Cena | null> {
    const cena = this.cenas.get(id);
    return cena ? structuredClone(cena) : null;
  }
  async salvar(cena: Cena): Promise<void> {
    this.cenas.set(cena.id, structuredClone(cena));
  }
  async apagar(id: string): Promise<boolean> {
    return this.cenas.delete(id);
  }
}

const TABELA = "cenas";

/**
 * Cenas em Postgres (Supabase). A tabela `cenas` tem RLS ligado sem políticas públicas:
 * só o servidor, com a chave service_role, lê e escreve. Essa chave nunca vai ao cliente MCP.
 */
class LojaSupabase implements Loja {
  readonly persistente = true;
  constructor(private readonly db: SupabaseClient) {}

  async listar(): Promise<Cena[]> {
    const { data, error } = await this.db
      .from(TABELA)
      .select("dados")
      .order("atualizada_em", { ascending: false });
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).map((linha) => Cena.parse(linha.dados));
  }

  async obter(id: string): Promise<Cena | null> {
    const { data, error } = await this.db.from(TABELA).select("dados").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data ? Cena.parse(data.dados) : null;
  }

  async salvar(cena: Cena): Promise<void> {
    const { error } = await this.db.from(TABELA).upsert({
      id: cena.id,
      nome: cena.nome,
      dados: cena,
      criada_em: cena.criada_em,
      atualizada_em: cena.atualizada_em,
    });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  async apagar(id: string): Promise<boolean> {
    const { data, error } = await this.db.from(TABELA).delete().eq("id", id).select("id");
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).length > 0;
  }
}

let instancia: Loja | undefined;

/**
 * Usa Supabase quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estiverem definidas.
 * Sem elas, cai na memória: útil só para testes e desenvolvimento.
 */
export function obterLoja(): Loja {
  if (instancia) return instancia;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  instancia =
    url && chave
      ? new LojaSupabase(createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }))
      : new LojaMemoria();
  return instancia;
}

/** Permite trocar a loja (usado nos testes). */
export function definirLoja(loja: Loja | undefined): void {
  instancia = loja;
}
