import { createHash } from "node:crypto";
import type * as THREE from "three";
import type { Material } from "./tipos.js";

export interface MalhaGlb {
  nome: string;
  geometria: THREE.BufferGeometry;
  material: Material;
  imagem?: { mime: "image/png" | "image/jpeg"; dados: Buffer; escala: number };
}

const FLOAT = 5126;
const UINT32 = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

function hexParaLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const converter = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [converter((n >> 16) & 0xff), converter((n >> 8) & 0xff), converter(n & 0xff)];
}

function alinhar4(n: number): number {
  return (4 - (n % 4)) % 4;
}

/**
 * Escreve um arquivo GLB (glTF 2.0 binário) com malhas, materiais PBR e texturas embutidas.
 * Escrito à mão para não depender de canvas, FileReader ou DOM no ambiente serverless.
 */
export function gerarGlb(malhas: MalhaGlb[]): Buffer {
  if (malhas.length === 0) throw new Error("Nenhuma malha visível para exportar");

  const partes: Buffer[] = [];
  let tamanho = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const meshes: Record<string, unknown>[] = [];
  const materiais: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  const imagens: Record<string, unknown>[] = [];
  const texturas: Record<string, unknown>[] = [];
  const cacheImagens = new Map<string, number>();

  const adicionarDados = (bytes: Buffer, alvo?: number): number => {
    const pad = alinhar4(tamanho);
    if (pad) {
      partes.push(Buffer.alloc(pad));
      tamanho += pad;
    }
    const view: Record<string, unknown> = { buffer: 0, byteOffset: tamanho, byteLength: bytes.length };
    if (alvo !== undefined) view.target = alvo;
    partes.push(bytes);
    tamanho += bytes.length;
    bufferViews.push(view);
    return bufferViews.length - 1;
  };

  const adicionarAcessor = (
    view: number,
    componente: number,
    contagem: number,
    tipo: string,
    extra: Record<string, unknown> = {},
  ) => {
    accessors.push({ bufferView: view, componentType: componente, count: contagem, type: tipo, ...extra });
    return accessors.length - 1;
  };

  const adicionarTextura = (imagem: NonNullable<MalhaGlb["imagem"]>): number => {
    const hash = createHash("sha1").update(imagem.dados).digest("hex");
    const existente = cacheImagens.get(hash);
    if (existente !== undefined) return existente;
    const view = adicionarDados(imagem.dados);
    imagens.push({ bufferView: view, mimeType: imagem.mime });
    texturas.push({ source: imagens.length - 1 });
    cacheImagens.set(hash, texturas.length - 1);
    return texturas.length - 1;
  };

  for (const malha of malhas) {
    const geo = malha.geometria;
    const posicao = geo.getAttribute("position");
    const normal = geo.getAttribute("normal");
    const uvAttr = geo.getAttribute("uv");
    const contagem = posicao.count;
    const escala = malha.imagem?.escala ?? 1;

    const posicoes = Float32Array.from(posicao.array as ArrayLike<number>);
    const normais = Float32Array.from(normal.array as ArrayLike<number>);
    const uvs = Float32Array.from(uvAttr.array as ArrayLike<number>, (v) => v * escala);
    const indices = geo.index
      ? Uint32Array.from(geo.index.array as ArrayLike<number>)
      : Uint32Array.from({ length: contagem }, (_, i) => i);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < posicoes.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], posicoes[i + k]);
        max[k] = Math.max(max[k], posicoes[i + k]);
      }
    }
    if (contagem === 0) {
      min.fill(0);
      max.fill(0);
    }

    const viewPos = adicionarDados(Buffer.from(posicoes.buffer), ARRAY_BUFFER);
    const viewNor = adicionarDados(Buffer.from(normais.buffer), ARRAY_BUFFER);
    const viewUv = adicionarDados(Buffer.from(uvs.buffer), ARRAY_BUFFER);
    const viewIdx = adicionarDados(Buffer.from(indices.buffer), ELEMENT_ARRAY_BUFFER);

    const accPos = adicionarAcessor(viewPos, FLOAT, contagem, "VEC3", { min, max });
    const accNor = adicionarAcessor(viewNor, FLOAT, contagem, "VEC3");
    const accUv = adicionarAcessor(viewUv, FLOAT, contagem, "VEC2");
    const accIdx = adicionarAcessor(viewIdx, UINT32, indices.length, "SCALAR");

    const m = malha.material;
    const [r, g, b] = hexParaLinear(m.cor);
    const temTextura = malha.imagem !== undefined;
    const pbr: Record<string, unknown> = {
      baseColorFactor: temTextura ? [1, 1, 1, m.opacidade] : [r, g, b, m.opacidade],
      metallicFactor: m.metalico,
      roughnessFactor: m.rugosidade,
    };
    if (malha.imagem) pbr.baseColorTexture = { index: adicionarTextura(malha.imagem) };

    const material: Record<string, unknown> = { name: malha.nome, pbrMetallicRoughness: pbr, doubleSided: true };
    if (m.opacidade < 1) material.alphaMode = "BLEND";
    if (m.emissiva) material.emissiveFactor = hexParaLinear(m.emissiva);
    materiais.push(material);

    meshes.push({
      name: malha.nome,
      primitives: [
        {
          attributes: { POSITION: accPos, NORMAL: accNor, TEXCOORD_0: accUv },
          indices: accIdx,
          material: materiais.length - 1,
          mode: 4,
        },
      ],
    });
    nodes.push({ name: malha.nome, mesh: meshes.length - 1 });
  }

  const binario = Buffer.concat(partes);
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "bender-3d-mcp" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    materials: materiais,
    buffers: [{ byteLength: binario.length }],
  };
  if (imagens.length > 0) {
    for (const t of texturas) t.sampler = 0;
    json.images = imagens;
    json.textures = texturas;
    json.samplers = [{}];
  }

  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc(alinhar4(jsonBuf.length), 0x20)]);
  const binPad = Buffer.concat([binario, Buffer.alloc(alinhar4(binario.length), 0)]);

  const cabecalho = Buffer.alloc(12);
  cabecalho.writeUInt32LE(0x46546c67, 0); // "glTF"
  cabecalho.writeUInt32LE(2, 4);
  cabecalho.writeUInt32LE(12 + 8 + jsonPad.length + 8 + binPad.length, 8);

  const cabJson = Buffer.alloc(8);
  cabJson.writeUInt32LE(jsonPad.length, 0);
  cabJson.writeUInt32LE(0x4e4f534a, 4); // "JSON"
  const cabBin = Buffer.alloc(8);
  cabBin.writeUInt32LE(binPad.length, 0);
  cabBin.writeUInt32LE(0x004e4942, 4); // "BIN\0"

  return Buffer.concat([cabecalho, cabJson, jsonPad, cabBin, binPad]);
}
