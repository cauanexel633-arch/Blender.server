import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Desenho } from "./tipos.js";

export interface LojaDesenhos {
  /** false quando os desenhos vivem só na memória desta instância. */
  readonly persistente: boolean;
  listar(): Promise<Desenho[]>;
  obter(id: string): Promise<Desenho | null>;
  salvar(desenho: Desenho): Promise<void>;
  apagar(id: string): Promise<boolean>;
}

class LojaMemoriaDesenhos implements LojaDesenhos {
  readonly persistente = false;
  private readonly desenhos = new Map<string, Desenho>();

  async listar(): Promise<Desenho[]> {
    return [...this.desenhos.values()].map((d) => structuredClone(d));
  }
  async obter(id: string): Promise<Desenho | null> {
    const d = this.desenhos.get(id);
    return d ? structuredClone(d) : null;
  }
  async salvar(desenho: Desenho): Promise<void> {
    this.desenhos.set(desenho.id, structuredClone(desenho));
  }
  async apagar(id: string): Promise<boolean> {
    return this.desenhos.delete(id);
  }
}

const TABELA = "desenhos";

/** Desenhos em Postgres (tabela `desenhos`, RLS ligado sem políticas públicas). */
class LojaSupabaseDesenhos implements LojaDesenhos {
  readonly persistente = true;
  constructor(private readonly db: SupabaseClient) {}

  async listar(): Promise<Desenho[]> {
    const { data, error } = await this.db.from(TABELA).select("dados").order("atualizada_em", { ascending: false });
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).map((linha) => Desenho.parse(linha.dados));
  }

  async obter(id: string): Promise<Desenho | null> {
    const { data, error } = await this.db.from(TABELA).select("dados").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data ? Desenho.parse(data.dados) : null;
  }

  async salvar(desenho: Desenho): Promise<void> {
    const { error } = await this.db.from(TABELA).upsert({
      id: desenho.id,
      nome: desenho.nome,
      dados: desenho,
      criada_em: desenho.criada_em,
      atualizada_em: desenho.atualizada_em,
    });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  async apagar(id: string): Promise<boolean> {
    const { data, error } = await this.db.from(TABELA).delete().eq("id", id).select("id");
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).length > 0;
  }
}

let instancia: LojaDesenhos | undefined;

export function obterLojaDesenhos(): LojaDesenhos {
  if (instancia) return instancia;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  instancia =
    url && chave
      ? new LojaSupabaseDesenhos(createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }))
      : new LojaMemoriaDesenhos();
  return instancia;
}

/** Permite trocar a loja (usado nos testes). */
export function definirLojaDesenhos(loja: LojaDesenhos | undefined): void {
  instancia = loja;
}
