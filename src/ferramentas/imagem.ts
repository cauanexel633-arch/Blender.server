import { z } from "zod";
import { LIMITE_ARQUIVO_BYTES, publicarExportacao } from "../armazenamento/arquivos.js";
import type { Conteudo, Ferramenta } from "./tipos.js";

export const CAMPO_FORMATO_IMAGEM = z
  .enum(["link", "imagem"])
  .default("link")
  .describe("'link' (padrão) devolve um link temporário da imagem; 'imagem' devolve a imagem direto na resposta");

/**
 * Devolve uma imagem como link (quando há armazenamento) ou inline (quando pedido ou sem armazenamento).
 * O link vale 1 hora.
 */
export async function conteudoImagem(
  nome: string,
  png: Buffer,
  formato: "link" | "imagem",
): Promise<Conteudo[]> {
  if (formato === "link" && png.length <= LIMITE_ARQUIVO_BYTES) {
    const link = await publicarExportacao(nome, png, "image/png");
    if (link) {
      return [{ type: "text", text: JSON.stringify({ imagem_url: link.url, link_expira_em: link.expira_em, mime: "image/png" }, null, 2) }];
    }
  }
  const aviso = formato === "link" ? { aviso: "Armazenamento não configurado: imagem devolvida inline" } : {};
  return [
    { type: "image", data: png.toString("base64"), mimeType: "image/png" },
    ...(Object.keys(aviso).length ? [{ type: "text" as const, text: JSON.stringify(aviso) }] : []),
  ];
}

/** Ferramentas que devolvem imagem. Os agentes internos precisam ver a imagem para se corrigir. */
const FERRAMENTAS_DE_IMAGEM = new Set(["renderizar_cena", "renderizar_desenho", "gerar_preview_interface"]);

/** Versão da ferramenta para agentes: a imagem sempre vem inline, para o modelo enxergar. */
export function paraAgente(ferramenta: Ferramenta): Ferramenta {
  if (!FERRAMENTAS_DE_IMAGEM.has(ferramenta.nome)) return ferramenta;
  return {
    ...ferramenta,
    executar: (bruto) => ferramenta.executar({ ...(bruto as object), formato: "imagem" }),
  };
}
