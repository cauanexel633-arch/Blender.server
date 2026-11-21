import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const TIPOS_REFERENCIA = ["3d", "2d", "pixelart", "interface"] as const;
export type TipoReferencia = (typeof TIPOS_REFERENCIA)[number];

/** Uma referência guarda um trabalho aprovado (cena, desenho ou interface) como ponto de partida. */
export const Referencia = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_REFERENCIA),
  nome: z.string().min(1).max(120),
  descricao: z.string().max(2000).default(""),
  fonte: z.string().max(500).optional(),
  medidas: z.string().max(500).optional(),
  paleta: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(12).optional(),
  dados: z.record(z.string(), z.any()),
  criada_em: z.string(),
  atualizada_em: z.string(),
});
export type Referencia = z.output<typeof Referencia>;

export interface LojaReferencias {
  readonly persistente: boolean;
  listar(): Promise<Referencia[]>;
  obter(id: string): Promise<Referencia | null>;
  salvar(referencia: Referencia): Promise<void>;
  apagar(id: string): Promise<boolean>;
}

export class LojaMemoriaReferencias implements LojaReferencias {
  readonly persistente = false;
  private readonly itens = new Map<string, Referencia>();

  async listar(): Promise<Referencia[]> {
    return [...this.itens.values()].map((r) => structuredClone(r));
  }
  async obter(id: string): Promise<Referencia | null> {
    const r = this.itens.get(id);
    return r ? structuredClone(r) : null;
  }
  async salvar(referencia: Referencia): Promise<void> {
    this.itens.set(referencia.id, structuredClone(referencia));
  }
  async apagar(id: string): Promise<boolean> {
    return this.itens.delete(id);
  }
}

const TABELA = "referencias";

/** Referências em Postgres (tabela `referencias`, RLS ligado sem políticas públicas). */
class LojaSupabaseReferencias implements LojaReferencias {
  readonly persistente = true;
  constructor(private readonly db: SupabaseClient) {}

  async listar(): Promise<Referencia[]> {
    const { data, error } = await this.db.from(TABELA).select("dados").order("atualizada_em", { ascending: false });
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).map((linha) => Referencia.parse(linha.dados));
  }

  async obter(id: string): Promise<Referencia | null> {
    const { data, error } = await this.db.from(TABELA).select("dados").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data ? Referencia.parse(data.dados) : null;
  }

  async salvar(referencia: Referencia): Promise<void> {
    const { error } = await this.db.from(TABELA).upsert({
      id: referencia.id,
      tipo: referencia.tipo,
      nome: referencia.nome,
      descricao: referencia.descricao,
      dados: referencia,
      criada_em: referencia.criada_em,
      atualizada_em: referencia.atualizada_em,
    });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  async apagar(id: string): Promise<boolean> {
    const { data, error } = await this.db.from(TABELA).delete().eq("id", id).select("id");
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).length > 0;
  }
}

let instancia: LojaReferencias | undefined;

export function obterLojaReferencias(): LojaReferencias {
  if (instancia) return instancia;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  instancia =
    url && chave
      ? new LojaSupabaseReferencias(createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }))
      : new LojaMemoriaReferencias();
  return instancia;
}

/** Permite trocar a loja (usado nos testes). */
export function definirLojaReferencias(loja: LojaReferencias | undefined): void {
  instancia = loja;
}
