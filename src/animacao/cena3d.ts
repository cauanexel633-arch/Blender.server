import type { Cena, ObjetoCena, Transformacao } from "../geometria/tipos.js";
import { valorNoQuadro } from "./avaliar.js";

export const PROPRIEDADES_3D = ["posicao", "rotacao_graus", "escala"] as const;
export type Propriedade3d = (typeof PROPRIEDADES_3D)[number];

/** Número máximo de amostras (quadros × objetos animados × propriedades) num GLB animado. */
export const LIMITE_AMOSTRAS = 60_000;

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

/**
 * Transformação do objeto no quadro indicado. Propriedades sem keyframes ficam como estão em
 * `transformacao`; as que têm keyframes são interpoladas componente a componente.
 */
export function poseNoQuadro(cena: Cena, objeto: ObjetoCena, quadro: number): Transformacao {
  const pose: Transformacao = {
    posicao: [...objeto.transformacao.posicao],
    rotacao_graus: [...objeto.transformacao.rotacao_graus],
    escala: [...objeto.transformacao.escala],
  };
  const chaves = (cena.animacao?.chaves ?? []).filter((c) => c.objeto_id === objeto.id);
  for (const propriedade of PROPRIEDADES_3D) {
    const lista = chaves
      .filter((c) => c.propriedade === propriedade)
      .sort((a, b) => a.quadro - b.quadro);
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

/** Propriedades que têm pelo menos um keyframe neste objeto. */
export function propriedadesAnimadas(cena: Cena, objetoId: string): Propriedade3d[] {
  const usadas = new Set(
    (cena.animacao?.chaves ?? []).filter((c) => c.objeto_id === objetoId).map((c) => c.propriedade),
  );
  return PROPRIEDADES_3D.filter((p) => usadas.has(p));
}
