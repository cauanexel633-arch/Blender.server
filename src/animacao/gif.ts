/**
 * Codificador de GIF animado (GIF89a) escrito à mão: LZW com tabela de cores local por quadro.
 * Sem dependências nativas, para rodar na função serverless.
 */

export interface QuadroGif {
  largura: number;
  altura: number;
  /** Índice da cor de cada pixel na paleta do quadro. */
  indices: Uint8Array;
  /** Cores RGB do quadro (até 256). */
  paleta: [number, number, number][];
  /** Índice da cor transparente, ou -1 se o quadro não tem transparência. */
  transparente: number;
}

/** Bits necessários para indexar a paleta (mínimo 2, como exige a maioria dos decodificadores). */
function bitsDaPaleta(tamanho: number): number {
  let bits = 2;
  while (1 << bits < tamanho) bits++;
  return bits;
}

/** LZW do GIF: códigos de largura variável, emitidos do bit menos significativo. */
export function lzwCodificar(indices: Uint8Array, tamanhoMinimo: number): Buffer {
  const limpar = 1 << tamanhoMinimo;
  const fim = limpar + 1;
  const saida: number[] = [];
  let acumulado = 0;
  let bits = 0;
  let larguraCodigo = tamanhoMinimo + 1;
  let proximo = fim + 1;
  let tabela = new Map<number, number>();

  const emitir = (codigo: number) => {
    acumulado |= codigo << bits;
    bits += larguraCodigo;
    while (bits >= 8) {
      saida.push(acumulado & 0xff);
      acumulado >>>= 8;
      bits -= 8;
    }
  };
  const reiniciar = () => {
    tabela = new Map();
    proximo = fim + 1;
    larguraCodigo = tamanhoMinimo + 1;
  };

  if (indices.length === 0) {
    emitir(limpar);
    emitir(fim);
  } else {
    emitir(limpar);
    let prefixo = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const byte = indices[i];
      const chave = prefixo * 256 + byte;
      const achado = tabela.get(chave);
      if (achado !== undefined) {
        prefixo = achado;
        continue;
      }
      emitir(prefixo);
      if (proximo < 4096) {
        // O decodificador adiciona cada entrada um código depois do encoder. Por isso a largura só
        // cresce depois de emitir o código que encheu a tabela: antes disso, ambos ainda leem com a largura antiga.
        if (proximo >= 1 << larguraCodigo && larguraCodigo < 12) larguraCodigo++;
        tabela.set(chave, proximo++);
      } else {
        emitir(limpar);
        reiniciar();
      }
      prefixo = byte;
    }
    emitir(prefixo);
    emitir(fim);
  }
  if (bits > 0) saida.push(acumulado & 0xff);
  return Buffer.from(saida);
}

/** Divide os dados em blocos de até 255 bytes, como o formato exige. */
function blocos(dados: Buffer): Buffer {
  const partes: Buffer[] = [];
  for (let i = 0; i < dados.length; i += 255) {
    const bloco = dados.subarray(i, Math.min(i + 255, dados.length));
    partes.push(Buffer.from([bloco.length]), bloco);
  }
  partes.push(Buffer.from([0]));
  return Buffer.concat(partes);
}

/** Gera o arquivo GIF animado. `atrasoMs` é o tempo de cada quadro; loop 0 repete para sempre. */
export function gerarGif(quadros: QuadroGif[], atrasoMs: number, loop = 0): Buffer {
  if (quadros.length === 0) throw new Error("Nenhum quadro para gerar o GIF");
  const { largura, altura } = quadros[0];
  const partes: Buffer[] = [];

  const cabecalho = Buffer.alloc(13);
  cabecalho.write("GIF89a", 0, "ascii");
  cabecalho.writeUInt16LE(largura, 6);
  cabecalho.writeUInt16LE(altura, 8);
  cabecalho.writeUInt8(0, 10); // sem tabela global
  partes.push(cabecalho);

  // Extensão NETSCAPE2.0: controla a repetição.
  partes.push(
    Buffer.from([0x21, 0xff, 0x0b]),
    Buffer.from("NETSCAPE2.0", "ascii"),
    Buffer.from([0x03, 0x01, loop & 0xff, (loop >> 8) & 0xff, 0x00]),
  );

  const atrasoCentesimos = Math.max(1, Math.round(atrasoMs / 10));
  for (const q of quadros) {
    if (q.largura !== largura || q.altura !== altura) throw new Error("Todos os quadros do GIF precisam ter o mesmo tamanho");
    const bits = bitsDaPaleta(q.paleta.length);
    const tamanhoTabela = 1 << bits;
    const temTransparencia = q.transparente >= 0;

    // Extensão de controle gráfico: atraso, método de descarte e transparência.
    const controle = Buffer.alloc(8);
    controle[0] = 0x21;
    controle[1] = 0xf9;
    controle[2] = 0x04;
    controle[3] = (1 << 2) | (temTransparencia ? 1 : 0); // descarte: não descartar
    controle.writeUInt16LE(atrasoCentesimos, 4);
    controle[6] = temTransparencia ? q.transparente : 0;
    controle[7] = 0x00;
    partes.push(controle);

    // Descritor de imagem com tabela de cores local.
    const descritor = Buffer.alloc(10);
    descritor[0] = 0x2c;
    descritor.writeUInt16LE(0, 1);
    descritor.writeUInt16LE(0, 3);
    descritor.writeUInt16LE(largura, 5);
    descritor.writeUInt16LE(altura, 7);
    descritor[9] = 0x80 | (bits - 1);
    partes.push(descritor);

    const tabela = Buffer.alloc(tamanhoTabela * 3);
    q.paleta.forEach(([r, g, b], i) => {
      tabela[i * 3] = r;
      tabela[i * 3 + 1] = g;
      tabela[i * 3 + 2] = b;
    });
    partes.push(tabela);

    partes.push(Buffer.from([bits]), blocos(lzwCodificar(q.indices, bits)));
  }

  partes.push(Buffer.from([0x3b]));
  return Buffer.concat(partes);
}
