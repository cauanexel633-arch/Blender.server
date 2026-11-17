import * as THREE from "three";
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from "three-bvh-csg/src/index.js";
import type { Cena, ObjetoCena, Primitiva, Transformacao } from "./tipos.js";

const OPERACOES_CSG = {
  uniao: ADDITION,
  subtracao: SUBTRACTION,
  interseccao: INTERSECTION,
} as const;

export function geometriaDePrimitiva(p: Primitiva): THREE.BufferGeometry {
  switch (p.forma) {
    case "cubo":
      return new THREE.BoxGeometry(p.tamanho, p.tamanho, p.tamanho);
    case "esfera":
      return new THREE.SphereGeometry(p.raio, p.segmentos, Math.max(4, Math.round(p.segmentos / 2)));
    case "cilindro":
      return new THREE.CylinderGeometry(p.raio_topo, p.raio_base, p.altura, p.segmentos);
    case "cone":
      return new THREE.CylinderGeometry(0, p.raio, p.altura, p.segmentos);
    case "toro":
      return new THREE.TorusGeometry(p.raio, p.tubo, 16, p.segmentos);
    case "capsula":
      return new THREE.CapsuleGeometry(p.raio, p.altura, 8, p.segmentos);
    case "plano":
      return new THREE.PlaneGeometry(p.largura, p.profundidade);
  }
}

/** Aplica posição, rotação (graus, ordem XYZ) e escala diretamente na geometria. */
export function aplicarTransformacao(geometria: THREE.BufferGeometry, t: Transformacao): THREE.BufferGeometry {
  const [rx, ry, rz] = t.rotacao_graus.map((g) => THREE.MathUtils.degToRad(g));
  const rotacao = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
  const matriz = new THREE.Matrix4().compose(
    new THREE.Vector3(...t.posicao),
    rotacao,
    new THREE.Vector3(...t.escala),
  );
  geometria.applyMatrix4(matriz);
  return geometria;
}

function garantirAtributos(geometria: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geometria.getAttribute("normal")) geometria.computeVertexNormals();
  if (!geometria.getAttribute("uv")) {
    const quantidade = geometria.getAttribute("position").count;
    geometria.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(quantidade * 2), 2));
  }
  return geometria;
}

function buscarObjeto(cena: Cena, id: string): ObjetoCena {
  const objeto = cena.objetos.find((o) => o.id === id);
  if (!objeto) throw new Error(`Objeto "${id}" não existe na cena ${cena.id}`);
  return objeto;
}

/**
 * Gera a geometria final (em coordenadas de mundo) de um objeto da cena.
 * Booleanas são resolvidas recursivamente: cada operando já sai com a própria transformação aplicada.
 */
export function construirGeometriaObjeto(
  cena: Cena,
  objeto: ObjetoCena,
  emCurso: Set<string> = new Set(),
): THREE.BufferGeometry {
  if (emCurso.has(objeto.id)) {
    throw new Error(`Ciclo detectado em booleanas envolvendo "${objeto.nome}"`);
  }
  emCurso.add(objeto.id);

  const origem = objeto.origem;
  let geometria: THREE.BufferGeometry;

  switch (origem.tipo) {
    case "primitiva":
      geometria = geometriaDePrimitiva(origem.primitiva);
      break;
    case "extrusao": {
      const forma = new THREE.Shape(origem.contorno.map(([x, y]) => new THREE.Vector2(x, y)));
      geometria = new THREE.ExtrudeGeometry(forma, { depth: origem.profundidade, bevelEnabled: false, steps: 1 });
      break;
    }
    case "revolucao":
      geometria = new THREE.LatheGeometry(
        origem.perfil.map(([raio, y]) => new THREE.Vector2(raio, y)),
        origem.segmentos,
      );
      break;
    case "booleana": {
      const ga = construirGeometriaObjeto(cena, buscarObjeto(cena, origem.a), emCurso);
      const gb = construirGeometriaObjeto(cena, buscarObjeto(cena, origem.b), emCurso);
      const avaliador = new Evaluator();
      const resultado = avaliador.evaluate(new Brush(ga), new Brush(gb), OPERACOES_CSG[origem.operacao]);
      geometria = resultado.geometry;
      break;
    }
  }

  emCurso.delete(objeto.id);
  return garantirAtributos(aplicarTransformacao(geometria, objeto.transformacao));
}
