import type { Chave, Desenho, Elemento } from "../desenho2d/tipos.js";

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Valor de uma propriedade no quadro, interpolando entre os keyframes vizinhos. */
function valorNoQuadro(chaves: Chave[], quadro: number): number {
  // chaves já vêm ordenadas por quadro
  const anterior = [...chaves].reverse().find((c) => c.quadro <= quadro);
  const proxima = chaves.find((c) => c.quadro > quadro);
  if (!anterior) return chaves[0].valor; // antes do primeiro keyframe, segura o primeiro valor
  if (!proxima) return anterior.valor; // depois do último, segura o último valor
  if (anterior.interpolacao === "constante") return anterior.valor;
  const t = (quadro - anterior.quadro) / (proxima.quadro - anterior.quadro);
  const k = anterior.interpolacao === "suave" ? smoothstep(t) : t;
  return anterior.valor + (proxima.valor - anterior.valor) * k;
}

/**
 * Estado do desenho no quadro indicado: cópia com as propriedades animadas já aplicadas.
 * O desenho original não muda.
 */
export function aplicarQuadro(desenho: Desenho, quadro: number): Desenho {
  if (desenho.chaves.length === 0) return desenho;

  const grupos = new Map<string, Chave[]>();
  for (const c of desenho.chaves) {
    const chave = `${c.elemento_id}|${c.propriedade}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(c);
    grupos.set(chave, lista);
  }
  for (const lista of grupos.values()) lista.sort((a, b) => a.quadro - b.quadro);

  const elementos: Elemento[] = desenho.elementos.map((e) => ({ ...e }));
  for (const lista of grupos.values()) {
    const { elemento_id, propriedade } = lista[0];
    const alvo = elementos.find((e) => e.id === elemento_id);
    if (!alvo) continue;
    (alvo as Record<string, unknown>)[propriedade] = valorNoQuadro(lista, quadro);
  }
  return { ...desenho, elementos };
}
