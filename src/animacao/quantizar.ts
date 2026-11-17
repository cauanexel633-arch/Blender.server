import type { QuadroGif } from "./gif.js";

/**
 * Converte pixels RGBA opacos em um quadro indexado de GIF.
 * Até 256 cores diferentes são mantidas exatas; acima disso, usa um cubo uniforme de 216 cores (6 níveis por canal).
 * O alfa é ignorado, porque o render 3D sempre tem fundo.
 */
export function quantizarRgba(rgba: Uint8Array, largura: number, altura: number): QuadroGif {
  const total = largura * altura;

  const exato = new Map<number, number>();
  const paleta: [number, number, number][] = [];
  const indices = new Uint8Array(total);
  let cabe = true;
  for (let i = 0; i < total && cabe; i++) {
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const chave = (r << 16) | (g << 8) | b;
    let slot = exato.get(chave);
    if (slot === undefined) {
      if (paleta.length >= 256) {
        cabe = false;
        break;
      }
      slot = paleta.length;
      exato.set(chave, slot);
      paleta.push([r, g, b]);
    }
    indices[i] = slot;
  }
  if (cabe) return { largura, altura, indices, paleta, transparente: -1 };

  const cubo = new Map<number, number>();
  const paletaCubo: [number, number, number][] = [];
  const indicesCubo = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r6 = Math.round(rgba[o] / 51);
    const g6 = Math.round(rgba[o + 1] / 51);
    const b6 = Math.round(rgba[o + 2] / 51);
    const chave = r6 * 36 + g6 * 6 + b6;
    let slot = cubo.get(chave);
    if (slot === undefined) {
      slot = paletaCubo.length;
      cubo.set(chave, slot);
      paletaCubo.push([r6 * 51, g6 * 51, b6 * 51]);
    }
    indicesCubo[i] = slot;
  }
  return { largura, altura, indices: indicesCubo, paleta: paletaCubo, transparente: -1 };
}
