import { Redis } from "@upstash/redis";
import type { Cena } from "../geometria/tipos.js";

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

const INDICE = "bender:cenas";
const chave = (id: string) => `bender:cena:${id}`;

class LojaRedis implements Loja {
  readonly persistente = true;
  constructor(private readonly redis: Redis) {}

  async listar(): Promise<Cena[]> {
    const ids = await this.redis.smembers(INDICE);
    if (ids.length === 0) return [];
    const itens = await this.redis.mget<Cena[]>(...ids.map(chave));
    return itens.filter((c): c is Cena => c !== null);
  }
  async obter(id: string): Promise<Cena | null> {
    return this.redis.get<Cena>(chave(id));
  }
  async salvar(cena: Cena): Promise<void> {
    await Promise.all([this.redis.set(chave(cena.id), cena), this.redis.sadd(INDICE, cena.id)]);
  }
  async apagar(id: string): Promise<boolean> {
    const removidos = await this.redis.del(chave(id));
    await this.redis.srem(INDICE, id);
    return removidos > 0;
  }
}

let instancia: Loja | undefined;

/**
 * Usa Upstash Redis quando as variáveis estiverem definidas (a integração Upstash da Vercel
 * cria KV_REST_API_URL/KV_REST_API_TOKEN). Sem elas, cai na memória, útil só para testes.
 */
export function obterLoja(): Loja {
  if (instancia) return instancia;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  instancia = url && token ? new LojaRedis(new Redis({ url, token })) : new LojaMemoria();
  return instancia;
}

/** Permite trocar a loja (usado nos testes). */
export function definirLoja(loja: Loja | undefined): void {
  instancia = loja;
}
