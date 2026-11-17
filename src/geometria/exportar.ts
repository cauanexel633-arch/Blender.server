import type * as THREE from "three";
import { construirGeometriaObjeto } from "./construir.js";
import { gerarGlb, type MalhaGlb } from "./glb.js";
import { gerarTexturaPng } from "./png.js";
import { baixarImagem } from "../web/busca.js";
import type { Cena, Material, ObjetoCena } from "./tipos.js";

export interface MalhaCena {
  nome: string;
  geometria: THREE.BufferGeometry;
  material: Material;
}

/**
 * Objetos que entram no modelo final: visíveis e não usados como operando de booleana.
 * Operandos ficam ocultos enquanto a booleana existir e reaparecem se ela for apagada.
 */
export function objetosVisiveis(cena: Cena): ObjetoCena[] {
  const operandos = new Set<string>();
  for (const o of cena.objetos) {
    if (o.origem.tipo === "booleana") {
      operandos.add(o.origem.a);
      operandos.add(o.origem.b);
    }
  }
  return cena.objetos.filter((o) => o.visivel && !operandos.has(o.id));
}

export function malhasDaCena(cena: Cena): MalhaCena[] {
  return objetosVisiveis(cena).map((o) => ({
    nome: o.nome,
    geometria: construirGeometriaObjeto(cena, o),
    material: o.material,
  }));
}

export interface OpcoesExportacao {
  /** Multiplica todas as coordenadas (0.1 converte mm para cm; 0.001 converte mm para m). */
  escala: number;
  /** Move o conjunto para que a menor altura fique em y = 0. */
  baseNoChao: boolean;
}

export const OPCOES_PADRAO: OpcoesExportacao = { escala: 1, baseNoChao: false };

/**
 * Aplica escala e posicionamento às malhas sem alterar a cena original.
 * Escala uniforme não inverte normais, então as normais continuam válidas.
 */
export function aplicarAjuste(malhas: MalhaCena[], opcoes: OpcoesExportacao): MalhaCena[] {
  if (opcoes.escala === 1 && !opcoes.baseNoChao) return malhas;
  const ajustadas = malhas.map((m) => ({
    ...m,
    geometria: m.geometria.clone().scale(opcoes.escala, opcoes.escala, opcoes.escala),
  }));
  if (opcoes.baseNoChao) {
    let menorY = Infinity;
    for (const m of ajustadas) {
      m.geometria.computeBoundingBox();
      menorY = Math.min(menorY, m.geometria.boundingBox?.min.y ?? 0);
    }
    if (Number.isFinite(menorY) && menorY !== 0) {
      for (const m of ajustadas) m.geometria.translate(0, -menorY, 0);
    }
  }
  return ajustadas;
}

// Cache por requisição: a mesma cena (objeto novo a cada carregamento) não refaz as booleanas
// quando o resumo e o arquivo são gerados em sequência.
const cachePorCena = new WeakMap<Cena, Map<string, MalhaCena[]>>();

/** Malhas prontas para escrever em qualquer formato: objetos visíveis com escala e posição aplicadas. */
export function malhasParaExportar(cena: Cena, opcoes: OpcoesExportacao = OPCOES_PADRAO): MalhaCena[] {
  const chave = `${opcoes.escala}|${opcoes.baseNoChao}`;
  let porOpcao = cachePorCena.get(cena);
  if (!porOpcao) {
    porOpcao = new Map();
    cachePorCena.set(cena, porOpcao);
  }
  const existente = porOpcao.get(chave);
  if (existente) return existente;

  const malhas = malhasDaCena(cena);
  if (malhas.length === 0) throw new Error("Nenhum objeto visível para exportar");
  const pronto = aplicarAjuste(malhas, opcoes);
  porOpcao.set(chave, pronto);
  return pronto;
}

/** Resumo do arquivo exportado para a IA: tamanho do modelo final, triângulos e avisos de impressão. */
export function resumoExportacao(malhas: MalhaCena[]) {
  const avisos: string[] = [];
  let triangulos = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of malhas) {
    const idx = trianguloIndices(m.geometria);
    triangulos += idx.length / 3;
    const volume = volumeDaGeometria(m.geometria);
    if (Math.abs(volume) < 1e-9) avisos.push(`"${m.nome}" tem volume zero (plano ou malha aberta): não imprime sólido`);
    m.geometria.computeBoundingBox();
    const caixa = m.geometria.boundingBox;
    if (caixa) {
      min[0] = Math.min(min[0], caixa.min.x); min[1] = Math.min(min[1], caixa.min.y); min[2] = Math.min(min[2], caixa.min.z);
      max[0] = Math.max(max[0], caixa.max.x); max[1] = Math.max(max[1], caixa.max.y); max[2] = Math.max(max[2], caixa.max.z);
    }
  }
  const dimensoes = min.map((v, k) => (Number.isFinite(v) ? round(max[k] - v) : 0));
  return {
    objetos: malhas.length,
    triangulos,
    dimensoes,
    menor_y: Number.isFinite(min[1]) ? round(min[1]) : 0,
    avisos,
  };
}

async function resolverImagem(material: Material): Promise<MalhaGlb["imagem"]> {
  const textura = material.textura;
  if (!textura) return undefined;
  if (textura.tipo === "procedural") {
    return {
      mime: "image/png",
      dados: gerarTexturaPng(textura.padrao, material.cor, textura.cor_secundaria),
      escala: textura.escala,
    };
  }
  const imagem = await baixarImagem(textura.url);
  return { ...imagem, escala: textura.escala };
}

export async function gerarGlbDaCena(cena: Cena, opcoes: OpcoesExportacao = OPCOES_PADRAO): Promise<Buffer> {
  const prontas: MalhaGlb[] = [];
  for (const m of malhasParaExportar(cena, opcoes)) {
    prontas.push({ nome: m.nome, geometria: m.geometria, material: m.material, imagem: await resolverImagem(m.material) });
  }
  return gerarGlb(prontas);
}

function trianguloIndices(geo: THREE.BufferGeometry): ArrayLike<number> {
  if (geo.index) return geo.index.array as ArrayLike<number>;
  const n = geo.getAttribute("position").count;
  return Array.from({ length: n }, (_, i) => i);
}

/** Volume assinado de uma malha fechada pelo teorema da divergência (soma de tetraedros). */
export function volumeDaGeometria(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute("position").array as ArrayLike<number>;
  const idx = trianguloIndices(geo);
  let vol = 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const cx = pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1];
    const cy = pos[b + 2] * pos[c] - pos[b] * pos[c + 2];
    const cz = pos[b] * pos[c + 1] - pos[b + 1] * pos[c];
    vol += pos[a] * cx + pos[a + 1] * cy + pos[a + 2] * cz;
  }
  return vol / 6;
}

function caixaDelimitadora(malhas: MalhaCena[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of malhas) {
    const pos = m.geometria.getAttribute("position").array as ArrayLike<number>;
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[i + k]);
        max[k] = Math.max(max[k], pos[i + k]);
      }
    }
  }
  const dimensoes = min.map((v, k) => (Number.isFinite(v) ? round(max[k] - v) : 0));
  return {
    min: min.map((v) => (Number.isFinite(v) ? round(v) : 0)),
    max: max.map((v) => (Number.isFinite(v) ? round(v) : 0)),
    dimensoes,
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Relatório para a IA: contagem, dimensões, volume e avisos de impressão. */
export function inspecionarCena(cena: Cena) {
  const malhas = malhasDaCena(cena);
  const avisos: string[] = [];
  const objetos = malhas.map((m) => {
    const volume = volumeDaGeometria(m.geometria);
    const caixa = caixaDelimitadora([m]);
    const triangulos = trianguloIndices(m.geometria).length / 3;
    if (Math.abs(volume) < 1e-9) avisos.push(`"${m.nome}" tem volume zero (plano ou malha aberta): não imprime sólido`);
    return { nome: m.nome, triangulos, volume: round(Math.abs(volume)), ...caixa };
  });
  const total = caixaDelimitadora(malhas);
  if (malhas.length === 0) avisos.push("A cena não tem objetos visíveis");
  return {
    cena_id: cena.id,
    nome: cena.nome,
    objetos_visiveis: malhas.length,
    objetos_ocultos: cena.objetos.length - malhas.length,
    triangulos_total: objetos.reduce((s, o) => s + o.triangulos, 0),
    volume_total: round(objetos.reduce((s, o) => s + o.volume, 0)),
    caixa_delimitadora: total,
    unidades: "unidades arbitrárias (use 1 unidade = 1 mm se for imprimir)",
    avisos,
    objetos,
  };
}

/** STL binário ou ASCII com todas as malhas visíveis (coordenadas de mundo, sem texturas). */
export function gerarStl(cena: Cena, formato: "binario" | "ascii", opcoes: OpcoesExportacao = OPCOES_PADRAO): Buffer {
  const malhas = malhasParaExportar(cena, opcoes);
  const triangulos: number[][] = [];
  for (const m of malhas) {
    const pos = m.geometria.getAttribute("position").array as ArrayLike<number>;
    const idx = trianguloIndices(m.geometria);
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const v = [idx[i], idx[i + 1], idx[i + 2]].map((k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]);
      triangulos.push(v.flat());
    }
  }
  if (triangulos.length === 0) throw new Error("Nenhum triângulo para exportar");

  const normal = (t: number[]) => {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  };

  if (formato === "ascii") {
    const linhas = [`solid ${cena.nome.replace(/\s+/g, "_")}`];
    for (const t of triangulos) {
      const n = normal(t);
      linhas.push(`facet normal ${n.join(" ")}`, "outer loop");
      for (let k = 0; k < 9; k += 3) linhas.push(`vertex ${t[k]} ${t[k + 1]} ${t[k + 2]}`);
      linhas.push("endloop", "endfacet");
    }
    linhas.push(`endsolid ${cena.nome.replace(/\s+/g, "_")}`);
    return Buffer.from(linhas.join("\n"), "utf8");
  }

  const buf = Buffer.alloc(84 + triangulos.length * 50);
  buf.write("bender-3d-mcp STL", 0, "ascii");
  buf.writeUInt32LE(triangulos.length, 80);
  triangulos.forEach((t, i) => {
    const base = 84 + i * 50;
    const n = normal(t);
    [...n, ...t].forEach((valor, k) => buf.writeFloatLE(valor, base + k * 4));
  });
  return buf;
}

/** OBJ texto com grupos por objeto (sem materiais, que são exportados apenas no GLB). */
export function gerarObj(cena: Cena, opcoes: OpcoesExportacao = OPCOES_PADRAO): string {
  const linhas = [`# ${cena.nome} — bender-3d-mcp`];
  let base = 0;
  for (const m of malhasParaExportar(cena, opcoes)) {
    const g = m.geometria;
    const pos = g.getAttribute("position").array as ArrayLike<number>;
    const nor = g.getAttribute("normal")?.array as ArrayLike<number> | undefined;
    const uv = g.getAttribute("uv")?.array as ArrayLike<number> | undefined;
    const n = g.getAttribute("position").count;
    linhas.push(`o ${m.nome.replace(/\s+/g, "_")}`);
    for (let i = 0; i < n; i++) linhas.push(`v ${pos[i * 3]} ${pos[i * 3 + 1]} ${pos[i * 3 + 2]}`);
    if (uv) for (let i = 0; i < n; i++) linhas.push(`vt ${uv[i * 2]} ${uv[i * 2 + 1]}`);
    if (nor) for (let i = 0; i < n; i++) linhas.push(`vn ${nor[i * 3]} ${nor[i * 3 + 1]} ${nor[i * 3 + 2]}`);

    // Formato do vértice depende dos atributos presentes: v, v/vt, v//vn ou v/vt/vn.
    const vertice = (k: number) => {
      const i = k + base + 1;
      if (uv && nor) return `${i}/${i}/${i}`;
      if (uv) return `${i}/${i}`;
      if (nor) return `${i}//${i}`;
      return `${i}`;
    };
    const idx = trianguloIndices(g);
    for (let i = 0; i + 2 < idx.length; i += 3) {
      linhas.push(`f ${[idx[i], idx[i + 1], idx[i + 2]].map(vertice).join(" ")}`);
    }
    base += n;
  }
  return linhas.join("\n") + "\n";
}
