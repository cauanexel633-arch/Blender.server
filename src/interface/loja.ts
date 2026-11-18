import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { InterfaceUI } from "./tipos.js";

export interface LojaInterfaces {
  /** false quando as interfaces vivem só na memória desta instância. */
  readonly persistente: boolean;
  listar(): Promise<InterfaceUI[]>;
  obter(id: string): Promise<InterfaceUI | null>;
  salvar(ui: InterfaceUI): Promise<void>;
  apagar(id: string): Promise<boolean>;
}

export class LojaMemoriaInterfaces implements LojaInterfaces {
  readonly persistente = false;
  private readonly itens = new Map<string, InterfaceUI>();

  async listar(): Promise<InterfaceUI[]> {
    return [...this.itens.values()].map((u) => structuredClone(u));
  }
  async obter(id: string): Promise<InterfaceUI | null> {
    const u = this.itens.get(id);
    return u ? structuredClone(u) : null;
  }
  async salvar(ui: InterfaceUI): Promise<void> {
    this.itens.set(ui.id, structuredClone(ui));
  }
  async apagar(id: string): Promise<boolean> {
    return this.itens.delete(id);
  }
}

const TABELA = "interfaces";

/** Interfaces em Postgres (tabela `interfaces`, RLS ligado sem políticas públicas). */
class LojaSupabaseInterfaces implements LojaInterfaces {
  readonly persistente = true;
  constructor(private readonly db: SupabaseClient) {}

  async listar(): Promise<InterfaceUI[]> {
    const { data, error } = await this.db.from(TABELA).select("dados").order("atualizada_em", { ascending: false });
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).map((linha) => InterfaceUI.parse(linha.dados));
  }

  async obter(id: string): Promise<InterfaceUI | null> {
    const { data, error } = await this.db.from(TABELA).select("dados").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data ? InterfaceUI.parse(data.dados) : null;
  }

  async salvar(ui: InterfaceUI): Promise<void> {
    const { error } = await this.db.from(TABELA).upsert({
      id: ui.id,
      nome: ui.nome,
      dados: ui,
      criada_em: ui.criada_em,
      atualizada_em: ui.atualizada_em,
    });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  async apagar(id: string): Promise<boolean> {
    const { data, error } = await this.db.from(TABELA).delete().eq("id", id).select("id");
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).length > 0;
  }
}

let instancia: LojaInterfaces | undefined;

export function obterLojaInterfaces(): LojaInterfaces {
  if (instancia) return instancia;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  instancia =
    url && chave
      ? new LojaSupabaseInterfaces(createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }))
      : new LojaMemoriaInterfaces();
  return instancia;
}

/** Permite trocar a loja (usado nos testes). */
export function definirLojaInterfaces(loja: LojaInterfaces | undefined): void {
  instancia = loja;
}
