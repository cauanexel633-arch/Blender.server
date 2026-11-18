import { gerador, misturarCor } from "../vfx/particulas.js";
import type { ChaveObjeto, Cena, EfeitoCena, ObjetoCena } from "../geometria/tipos.js";

const SEGMENTOS = 6;

/** Ponto e escala de uma partícula em cada quadro (escala zero = escondida). */
interface Amostra {
  posicao: [number, number, number];
  escala: [number, number, number];
}

/**
 * Trajetória de uma partícula, em função da idade (quadros desde o nascimento).
 * `vida` é o tempo visível. Fora dele, a partícula fica escondida.
 */
function trajetoria(
  e: EfeitoCena,
  r: () => number,
): { nascimento: number; vida: number; amostra: (idade: number) => Amostra; cor: string } {
  const [ox, oy, oz] = e.centro;
  const [aL, aA, aP] = e.area;
  const s = e.tamanho;
  const vel = e.velocidade;
  const cor = misturarCor(e.cor_inicial, e.cor_final, r());
  const burst = e.tipo === "explosao" || e.tipo === "faiscas";
  const espalhamento = burst ? 2 : e.duracao_quadros * 0.5;
  const nascimento = e.inicio_quadro + Math.floor(r() * espalhamento);

  switch (e.tipo) {
    case "explosao":
    case "faiscas": {
      // Direção aleatória sobre a esfera, com gravidade. Encolhe até sumir.
      const teta = r() * Math.PI * 2;
      const fi = Math.acos(2 * r() - 1);
      const forca = (e.tipo === "explosao" ? 0.12 : 0.2) * vel * (0.5 + r());
      const dx = Math.sin(fi) * Math.cos(teta) * forca;
      const dy = Math.cos(fi) * forca;
      const dz = Math.sin(fi) * Math.sin(teta) * forca;
      const g = e.tipo === "explosao" ? -0.003 : -0.012;
      const vida = e.duracao_quadros * (e.tipo === "explosao" ? 0.5 + 0.5 * r() : 0.3 + 0.5 * r());
      return {
        nascimento,
        vida,
        cor,
        amostra: (a) => ({
          posicao: [ox + dx * a, oy + dy * a + 0.5 * g * a * a, oz + dz * a],
          escala: [s, s, s].map((v) => v * Math.max(0, 1 - a / vida)) as [number, number, number],
        }),
      };
    }
    case "fogo": {
      // Sobe com leve espalhamento e oscilação; cresce e some.
      const dx = (r() - 0.5) * 0.03 * vel;
      const dy = 0.05 * vel * (0.6 + 0.8 * r());
      const dz = (r() - 0.5) * 0.03 * vel;
      const fase = r() * Math.PI * 2;
      const vida = e.duracao_quadros * (0.4 + 0.6 * r());
      return {
        nascimento,
        vida,
        cor,
        amostra: (a) => {
          const t = Math.min(a / vida, 1);
          const k = s * Math.sin(Math.PI * t);
          return {
            posicao: [ox + dx * a + Math.sin(a * 0.4 + fase) * 0.02, oy + dy * a, oz + dz * a],
            escala: [k, k, k],
          };
        },
      };
    }
    case "fumaca": {
      // Sobe devagar e cresce; some no fim da vida.
      const dx = (r() - 0.5) * 0.01 * vel;
      const dy = 0.025 * vel * (0.6 + 0.8 * r());
      const dz = (r() - 0.5) * 0.01 * vel;
      const vida = e.duracao_quadros * (0.6 + 0.4 * r());
      return {
        nascimento,
        vida,
        cor,
        amostra: (a) => {
          const k = s * (1 + (4 * a) / vida);
          return { posicao: [ox + dx * a, oy + dy * a, oz + dz * a], escala: [k, k, k] };
        },
      };
    }
    case "neve":
    case "chuva": {
      // Cai dentro da área, do topo ao chão. Neve deriva; chuva é rápida e alongada.
      const x0 = ox + (r() - 0.5) * aL;
      const z0 = oz + (r() - 0.5) * aP;
      const topo = oy + aA / 2;
      const chuva = e.tipo === "chuva";
      const queda = (chuva ? 0.15 : 0.02) * vel * (0.6 + 0.8 * r());
      const fase = r() * Math.PI * 2;
      const vida = Math.min(e.duracao_quadros, aA / queda);
      const alongar: [number, number, number] = chuva ? [s * 0.3, s * 2.5, s * 0.3] : [s, s, s];
      return {
        nascimento,
        vida,
        cor,
        amostra: (a) => ({
          posicao: [x0 + (chuva ? 0 : Math.sin(a * 0.1 + fase) * 0.02 * vel), topo - queda * a, z0],
          escala: alongar,
        }),
      };
    }
  }
}

/** Partícula de um efeito: um objeto esfera com keyframes de posição e escala em todos os quadros. */
function particula(e: EfeitoCena, indice: number, r: () => number): { objeto: ObjetoCena; chaves: ChaveObjeto[]; fim: number } {
  const traj = trajetoria(e, r);
  const id = `${e.grupo}_p${indice}`;
  const emissiva = e.emissiva ? traj.cor : undefined;
  const objeto: ObjetoCena = {
    id,
    nome: `${e.grupo}_${indice}`,
    origem: { tipo: "primitiva", primitiva: { forma: "esfera", raio: 1, segmentos: SEGMENTOS } },
    transformacao: { posicao: [0, 0, 0], rotacao_graus: [0, 0, 0], escala: [1, 1, 1] },
    material: { cor: traj.cor, metalico: 0, rugosidade: 0.6, opacidade: 1, emissiva },
    visivel: true,
  };

  const fim = e.inicio_quadro + Math.ceil(e.duracao_quadros * 1.5);
  const chaves: ChaveObjeto[] = [];
  for (let quadro = 0; quadro <= fim; quadro++) {
    const idade = quadro - traj.nascimento;
    const ativa = idade >= 0 && idade <= traj.vida;
    const amostra: Amostra = ativa
      ? traj.amostra(idade)
      : { posicao: [e.centro[0], e.centro[1], e.centro[2]], escala: [0, 0, 0] };
    chaves.push({ objeto_id: id, propriedade: "posicao", quadro, valor: amostra.posicao, interpolacao: "linear" });
    chaves.push({ objeto_id: id, propriedade: "escala", quadro, valor: amostra.escala, interpolacao: "linear" });
  }
  return { objeto, chaves, fim };
}

/**
 * Cena com os efeitos expandidos em partículas e keyframes. A cena original não muda.
 * Sem efeitos, devolve a própria cena.
 */
export function expandirEfeitos(cena: Cena): Cena {
  if (!cena.efeitos?.length) return cena;
  const objetos = [...cena.objetos];
  const chaves = [...(cena.animacao?.chaves ?? [])];
  let duracao = cena.animacao?.duracao_quadros ?? 0;

  for (const efeito of cena.efeitos) {
    const r = gerador(efeito.semente);
    for (let i = 0; i < efeito.quantidade; i++) {
      const p = particula(efeito, i, r);
      objetos.push(p.objeto);
      chaves.push(...p.chaves);
      duracao = Math.max(duracao, p.fim + 1);
    }
  }
  return {
    ...cena,
    objetos,
    animacao: { fps: cena.animacao?.fps ?? 24, duracao_quadros: duracao, chaves },
  };
}

/** Quadro final ocupado pelo efeito (inclusive). Usado para validar o limite de quadros. */
export function ultimoQuadroDoEfeito(e: EfeitoCena): number {
  return e.inicio_quadro + Math.ceil(e.duracao_quadros * 1.5);
}
