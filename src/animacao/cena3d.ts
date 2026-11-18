import type { ChaveObjeto, Cena, ObjetoCena, Transformacao } from "../geometria/tipos.js";
import { valorNoQuadro } from "./avaliar.js";

export const PROPRIEDADES_3D = ["posicao", "rotacao_graus", "escala"] as const;
export type Propriedade3d = (typeof PROPRIEDADES_3D)[number];

/** Número máximo de amostras (quadros × objetos animados × propriedades) num GLB animado. */
export const LIMITE_AMOSTRAS = 200_000;

export function temAnimacao(cena: Cena): boolean {
  return (cena.animacao?.chaves.length ?? 0) > 0;
}

/** Ids dos objetos que são operandos de uma booleana: animá-los não aparece no resultado. */
export function operandosDeBooleanas(cena: Cena): Set<string> {
  const operandos = new Set<string>();
  for (const o of cena.objetos) {
    if (o.origem.tipo === "booleana") {
      operandos.add(o.origem.a);
      operandos.add(o.origem.b);
    }
  }
  return operandos;
}

/** Keyframes de cada objeto, ordenados por quadro. Agrupa uma vez para não filtrar a lista a cada quadro. */
export function agruparChaves(cena: Cena): Map<string, ChaveObjeto[]> {
  const grupos = new Map<string, ChaveObjeto[]>();
  for (const c of cena.animacao?.chaves ?? []) {
    const lista = grupos.get(c.objeto_id) ?? [];
    lista.push(c);
    grupos.set(c.objeto_id, lista);
  }
  for (const lista of grupos.values()) lista.sort((a, b) => a.quadro - b.quadro);
  return grupos;
}

/** Pose a partir da transformação guardada e dos keyframes do objeto, no quadro indicado. */
export function poseComChaves(base: Transformacao, chaves: ChaveObjeto[], quadro: number): Transformacao {
  const pose: Transformacao = {
    posicao: [...base.posicao],
    rotacao_graus: [...base.rotacao_graus],
    escala: [...base.escala],
  };
  for (const propriedade of PROPRIEDADES_3D) {
    const lista = chaves.filter((c) => c.propriedade === propriedade);
    if (lista.length === 0) continue;
    pose[propriedade] = [0, 1, 2].map((eixo) =>
      valorNoQuadro(
        lista.map((c) => ({ quadro: c.quadro, valor: c.valor[eixo], interpolacao: c.interpolacao })),
        quadro,
      ),
    );
  }
  return pose;
}

/**
 * Transformação do objeto no quadro indicado. Propriedades sem keyframes ficam como estão em
 * `transformacao`; as que têm keyframes são interpoladas componente a componente.
 */
export function poseNoQuadro(cena: Cena, objeto: ObjetoCena, quadro: number): Transformacao {
  const chaves = (cena.animacao?.chaves ?? []).filter((c) => c.objeto_id === objeto.id);
  return poseComChaves(objeto.transformacao, chaves.sort((a, b) => a.quadro - b.quadro), quadro);
}

/** Propriedades que têm pelo menos um keyframe neste objeto. */
export function propriedadesAnimadas(cena: Cena, objetoId: string): Propriedade3d[] {
  const usadas = new Set(
    (cena.animacao?.chaves ?? []).filter((c) => c.objeto_id === objetoId).map((c) => c.propriedade),
  );
  return PROPRIEDADES_3D.filter((p) => usadas.has(p));
}
