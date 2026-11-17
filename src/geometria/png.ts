import { deflateSync } from "node:zlib";

export type Padrao = "xadrez" | "listras" | "bolinhas" | "gradiente" | "ruido";

const TAMANHO = 256;
const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = TABELA_CRC[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function bloco(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const tipoBuf = Buffer.from(tipo, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, dados])), 0);
  return Buffer.concat([tamanho, tipoBuf, dados, crc]);
}

/** Codifica pixels RGB (8 bits por canal) em PNG sem dependências externas. */
export function codificarPng(largura: number, altura: number, rgb: Uint8Array): Buffer {
  const linha = largura * 3;
  const bruto = Buffer.alloc((linha + 1) * altura);
  for (let y = 0; y < altura; y++) {
    bruto[y * (linha + 1)] = 0; // filtro "None"
    Buffer.from(rgb.buffer, rgb.byteOffset + y * linha, linha).copy(bruto, y * (linha + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // profundidade de bits
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    ASSINATURA,
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(bruto)),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}

function hexParaRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function ruidoHash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function ruidoSuave(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = ruidoHash(xi, yi);
  const b = ruidoHash(xi + 1, yi);
  const c = ruidoHash(xi, yi + 1);
  const d = ruidoHash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Gera uma textura procedural 256×256 em PNG. Os padrões são repetidos pela escala do UV. */
export function gerarTexturaPng(padrao: Padrao, corPrimaria: string, corSecundaria: string): Buffer {
  const c1 = hexParaRgb(corPrimaria);
  const c2 = hexParaRgb(corSecundaria);
  const rgb = new Uint8Array(TAMANHO * TAMANHO * 3);

  for (let y = 0; y < TAMANHO; y++) {
    for (let x = 0; x < TAMANHO; x++) {
      const u = x / TAMANHO;
      const v = y / TAMANHO;
      let usaPrimaria: boolean;
      let mistura = 0; // 0 = c1, 1 = c2 (usado por gradiente e ruído)

      switch (padrao) {
        case "xadrez":
          usaPrimaria = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0;
          break;
        case "listras":
          usaPrimaria = Math.floor(u * 8) % 2 === 0;
          break;
        case "bolinhas": {
          const fx = (u * 6) % 1;
          const fy = (v * 6) % 1;
          usaPrimaria = Math.hypot(fx - 0.5, fy - 0.5) < 0.3;
          break;
        }
        case "gradiente":
          usaPrimaria = true;
          mistura = v;
          break;
        case "ruido": {
          usaPrimaria = true;
          const bruto =
            0.5 * ruidoSuave(u * 8, v * 8) +
            0.3 * ruidoSuave(u * 16, v * 16) +
            0.2 * ruidoSuave(u * 32, v * 32);
          // O ruído de valor fica concentrado entre ~0,3 e ~0,7; esticamos para usar a faixa toda.
          mistura = Math.min(1, Math.max(0, (bruto - 0.3) / 0.4));
          break;
        }
      }

      const t = padrao === "gradiente" || padrao === "ruido" ? mistura : usaPrimaria ? 0 : 1;
      const i = (y * TAMANHO + x) * 3;
      for (let k = 0; k < 3; k++) {
        rgb[i + k] = Math.round(c1[k] + (c2[k] - c1[k]) * t);
      }
    }
  }
  return codificarPng(TAMANHO, TAMANHO, rgb);
}
