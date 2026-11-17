import type { Elemento } from "../desenho2d/tipos.js";

/**
 * Efeitos de partículas em 2D. São funções puras: dados os parâmetros e o progresso (0 a 1),
 * devolvem as partículas vivas naquele instante. Mesma semente, mesmo resultado, sempre.
 */

export const TIPOS_EFEITO = ["explosao", "fogo", "fumaca", "faiscas", "brilho", "chuva", "neve"] as const;
export type TipoEfeito = (typeof TIPOS_EFEITO)[number];

export interface ParamsEfeito {
  tipo: TipoEfeito;
  x: number;
  y: number;
  largura: number;
  altura: number;
  quantidade: number;
  progresso: number;
  semente: number;
  corInicial: string;
  corFinal: string;
  tamanho: number;
  raio: number;
}

/** Gerador pseudoaleatório de 32 bits (mulberry32): rápido e reproduzível. */
export function gerador(semente: number): () => number {
  let a = semente | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexParaRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function misturarCor(a: string, b: string, t: number): string {
  const [ra, ga, ba] = hexParaRgb(a);
  const [rb, gb, bb] = hexParaRgb(b);
  const k = Math.min(1, Math.max(0, t));
  const canal = (x: number, y: number) => Math.round(x + (y - x) * k);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(canal(ra, rb))}${hex(canal(ga, gb))}${hex(canal(ba, bb))}`;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface Particula {
  x: number;
  y: number;
  tamanho: number;
  cor: string;
  opacidade: number;
  largura?: number;
  altura?: number;
}

/** Calcula a partícula i no instante do progresso. Devolve null se ela não existe nesse instante. */
function particula(p: ParamsEfeito, i: number, r: () => number): Particula | null {
  const { tipo, x, y, largura, altura, progresso, corInicial, corFinal, tamanho, raio } = p;
  // Todas as partículas consomem os mesmos números aleatórios na mesma ordem, para o resultado não depender do progresso.
  const r1 = r();
  const r2 = r();
  const r3 = r();
  const r4 = r();

  switch (tipo) {
    case "explosao": {
      const vida = 0.5 + 0.5 * r4;
      const local = progresso / vida;
      if (local > 1) return null;
      const ang = 2 * Math.PI * r1;
      const velocidade = raio * (0.4 + 0.6 * r2);
      const q = clamp01(local);
      return {
        x: x + Math.cos(ang) * velocidade * q,
        y: y + Math.sin(ang) * velocidade * q + raio * 0.3 * q * q,
        tamanho: tamanho * (1 - 0.6 * q),
        cor: misturarCor(corInicial, corFinal, q),
        opacidade: 1 - q,
      };
    }
    case "fogo": {
      const fase = (progresso + r1) % 1;
      const q = fase;
      return {
        x: x + (r2 - 0.5) * raio * 0.5 + Math.sin(q * 6 + i) * tamanho * 0.5,
        y: y - q * raio * 2.5,
        tamanho: tamanho * (1 - q) * (0.7 + 0.3 * r3),
        cor: misturarCor(corInicial, corFinal, q),
        opacidade: 0.9 * (1 - q),
      };
    }
    case "fumaca": {
      const fase = (progresso + r1) % 1;
      const q = fase;
      return {
        x: x + (r2 - 0.5) * raio * 0.4 + q * raio * 0.3,
        y: y - q * raio * 3,
        tamanho: tamanho * (0.5 + 2 * q),
        cor: misturarCor(corInicial, corFinal, q),
        opacidade: 0.35 * (1 - q),
      };
    }
    case "faiscas": {
      const vida = 0.4 + 0.6 * r4;
      const local = progresso / vida;
      if (local > 1) return null;
      const q = clamp01(local);
      const ang = -Math.PI / 2 + (r2 - 0.5) * (Math.PI * 2 / 3);
      const velocidade = raio * (0.5 + r3);
      return {
        x: x + Math.cos(ang) * velocidade * q,
        y: y + Math.sin(ang) * velocidade * q + raio * 0.8 * q * q,
        tamanho: Math.max(0.5, tamanho * 0.5 * (1 - q)),
        cor: misturarCor(corInicial, corFinal, q),
        opacidade: 1 - q,
      };
    }
    case "brilho": {
      const pulso = 0.6 + 0.4 * Math.sin(2 * Math.PI * (progresso + r1));
      const raioAtual = raio * (0.2 + 0.8 * r2);
      return {
        x,
        y,
        tamanho: raioAtual * 2,
        cor: misturarCor(corInicial, corFinal, r3),
        opacidade: (0.05 + 0.1 * r4) * pulso,
      };
    }
    case "chuva": {
      const queda = (r2 + progresso * (0.8 + 0.4 * r3)) % 1;
      return {
        x: x + r1 * largura,
        y: y + queda * altura,
        tamanho: tamanho * 0.3,
        cor: corInicial,
        opacidade: 0.6,
        largura: tamanho * 0.3,
        altura: tamanho * 2,
      };
    }
    case "neve": {
      const queda = (r2 + progresso * (0.2 + 0.2 * r3)) % 1;
      const balanco = 0.04 * Math.sin(2 * Math.PI * (progresso + r4));
      return {
        x: x + (((r1 + balanco) % 1 + 1) % 1) * largura,
        y: y + queda * altura,
        tamanho,
        cor: corInicial,
        opacidade: 0.85,
      };
    }
  }
}

/** Partículas do efeito no instante dado, prontas para virar elipses do desenho. */
export function particulasDoEfeito(p: ParamsEfeito): Particula[] {
  const saida: Particula[] = [];
  for (let i = 0; i < p.quantidade; i++) {
    // Cada partícula tem o seu gerador, derivado da semente e do índice: estável e independente.
    const r = gerador(p.semente * 7919 + i * 104729);
    const pt = particula(p, i, r);
    if (pt && pt.opacidade > 0.01 && pt.tamanho > 0.2) saida.push(pt);
  }
  return saida;
}

/** Converte as partículas em elementos de desenho (elipses), todos no mesmo grupo. */
export function elementosDoEfeito(p: ParamsEfeito, grupo: string, novoId: () => string): Elemento[] {
  return particulasDoEfeito(p).map((pt) => {
    const w = pt.largura ?? pt.tamanho;
    const h = pt.altura ?? pt.tamanho;
    return {
      id: novoId(),
      grupo,
      tipo: "elipse" as const,
      x: pt.x - w / 2,
      y: pt.y - h / 2,
      largura: round(w),
      altura: round(h),
      preenchimento: pt.cor,
      contorno: "nenhum",
      opacidade: round(clamp01(pt.opacidade)),
      visivel: true,
      espessura: 0,
    };
  });
}

const round = (v: number) => Math.round(v * 1000) / 1000;
