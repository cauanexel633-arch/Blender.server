import { describe, expect, it } from "vitest";
import { gerarGif, lzwCodificar, type QuadroGif } from "../src/animacao/gif.js";

/** Decodificador LZW de GIF (independente do codificador) para conferir a ida e a volta. */
function lzwDecodificar(bytes: Buffer, minCode: number): number[] {
  const limpar = 1 << minCode;
  const fim = limpar + 1;
  let tamanho = minCode + 1;
  let tabela: number[][] = [];
  const reiniciar = () => {
    tabela = [];
    for (let i = 0; i < limpar; i++) tabela[i] = [i];
    tabela[limpar] = [];
    tabela[fim] = [];
    tamanho = minCode + 1;
  };
  reiniciar();
  let pos = 0;
  let acc = 0;
  let nb = 0;
  const ler = (): number => {
    while (nb < tamanho) {
      if (pos >= bytes.length) return -1;
      acc |= bytes[pos++] << nb;
      nb += 8;
    }
    const codigo = acc & ((1 << tamanho) - 1);
    acc >>>= tamanho;
    nb -= tamanho;
    return codigo;
  };
  const saida: number[] = [];
  let anterior: number[] | null = null;
  for (;;) {
    const c = ler();
    if (c < 0 || c === fim) break;
    if (c === limpar) {
      reiniciar();
      anterior = null;
      continue;
    }
    const entrada: number[] = c < tabela.length ? tabela[c] : [...anterior!, anterior![0]];
    saida.push(...entrada);
    if (anterior) {
      tabela.push([...anterior, entrada[0]]);
      if (tabela.length >= 1 << tamanho && tamanho < 12) tamanho++;
    }
    anterior = entrada;
  }
  return saida;
}

/** Lê o GIF que geramos e devolve, para cada quadro, a paleta e os índices. */
function lerGif(gif: Buffer) {
  expect(gif.toString("ascii", 0, 6)).toBe("GIF89a");
  const largura = gif.readUInt16LE(6);
  const altura = gif.readUInt16LE(8);
  let pos = 13;
  const quadros: { paleta: number[][]; indices: number[]; transparente: number }[] = [];
  let transparente = -1;
  while (gif[pos] !== 0x3b) {
    if (gif[pos] === 0x21) {
      const rotulo = gif[pos + 1];
      pos += 2;
      if (rotulo === 0xf9) {
        transparente = gif[pos + 1] & 1 ? gif[pos + 4] : -1;
      }
      while (gif[pos] !== 0) pos += gif[pos] + 1;
      pos += 1;
    } else if (gif[pos] === 0x2c) {
      const flags = gif[pos + 9];
      expect(flags & 0x80).toBe(0x80);
      const bits = (flags & 7) + 1;
      pos += 10;
      const tamanhoTabela = 1 << bits;
      const paleta: number[][] = [];
      for (let i = 0; i < tamanhoTabela; i++) paleta.push([gif[pos + i * 3], gif[pos + i * 3 + 1], gif[pos + i * 3 + 2]]);
      pos += tamanhoTabela * 3;
      const minCode = gif[pos];
      expect(minCode).toBe(bits);
      pos += 1;
      const partes: Buffer[] = [];
      while (gif[pos] !== 0) {
        partes.push(gif.subarray(pos + 1, pos + 1 + gif[pos]));
        pos += gif[pos] + 1;
      }
      pos += 1;
      quadros.push({ paleta, indices: lzwDecodificar(Buffer.concat(partes), minCode), transparente });
      transparente = -1;
    } else {
      throw new Error(`bloco desconhecido em ${pos}: ${gif[pos]}`);
    }
  }
  return { largura, altura, quadros };
}

/** Sequência pseudoaleatória reproduzível para exercitar a tabela LZW. */
function sequencia(n: number, cores: number, semente: number): Uint8Array {
  const saida = new Uint8Array(n);
  let s = semente;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    saida[i] = s % cores;
  }
  return saida;
}

describe("LZW do GIF", () => {
  for (const [nome, dados] of [
    ["vazio", new Uint8Array(0)],
    ["um byte", new Uint8Array([3])],
    ["repetido", new Uint8Array(5000).fill(7)],
    ["aleatório pequeno", sequencia(300, 4, 1)],
    ["aleatório grande (força reset da tabela)", sequencia(60000, 256, 99)],
    ["padrão de listras", Uint8Array.from({ length: 4000 }, (_, i) => (i % 16 < 8 ? 1 : 2))],
  ] as const) {
    it(`ida e volta: ${nome}`, () => {
      const minCode = 8;
      const codificado = lzwCodificar(Uint8Array.from(dados), minCode);
      expect(lzwDecodificar(codificado, minCode)).toEqual(Array.from(dados));
    });
  }

  it("funciona com paleta pequena (2 bits)", () => {
    const dados = sequencia(20000, 4, 5);
    expect(lzwDecodificar(lzwCodificar(dados, 2), 2)).toEqual(Array.from(dados));
  });
});

describe("GIF animado", () => {
  it("gera quadros que voltam iguais após decodificar", () => {
    const largura = 37;
    const altura = 23;
    const quadros: QuadroGif[] = [0, 1, 2].map((k) => ({
      largura,
      altura,
      indices: sequencia(largura * altura, 5, 10 + k),
      paleta: [
        [0, 0, 0],
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0],
      ],
      transparente: -1,
    }));
    const gif = gerarGif(quadros, 100, 0);
    const lido = lerGif(gif);
    expect(lido.largura).toBe(largura);
    expect(lido.altura).toBe(altura);
    expect(lido.quadros).toHaveLength(3);
    lido.quadros.forEach((q, i) => {
      expect(q.indices).toEqual(Array.from(quadros[i].indices));
      expect(q.paleta.slice(0, 5)).toEqual(quadros[i].paleta);
    });
    expect(gif[gif.length - 1]).toBe(0x3b);
  });

  it("guarda o índice da cor transparente por quadro", () => {
    const quadro: QuadroGif = {
      largura: 4,
      altura: 2,
      indices: Uint8Array.from([0, 1, 1, 0, 0, 1, 1, 0]),
      paleta: [
        [10, 20, 30],
        [200, 200, 200],
        [0, 0, 0],
      ],
      transparente: 2,
    };
    const lido = lerGif(gerarGif([quadro], 50));
    expect(lido.quadros[0].transparente).toBe(2);
  });

  it("recusa quadros de tamanhos diferentes", () => {
    const a: QuadroGif = { largura: 2, altura: 2, indices: new Uint8Array(4), paleta: [[0, 0, 0]], transparente: -1 };
    const b: QuadroGif = { largura: 3, altura: 2, indices: new Uint8Array(6), paleta: [[0, 0, 0]], transparente: -1 };
    expect(() => gerarGif([a, b], 100)).toThrow(/mesmo tamanho/);
  });
});
