export type Gravidade = "bloqueante" | "importante" | "menor";

export interface ProblemaRevisao {
  gravidade: Gravidade;
  onde: string;
  o_que: string;
  como_corrigir: string;
}

export interface Veredito {
  aprovado: boolean;
  nota: number | null;
  problemas: ProblemaRevisao[];
  resposta_bruta?: string;
}

const GRAVIDADES: Gravidade[] = ["bloqueante", "importante", "menor"];

/**
 * Lê o veredito do revisor. Aprovado só quando não há problema bloqueante nem importante,
 * mesmo que o revisor escreva "aprovado": true. Resposta fora do formato vira reprovação.
 */
export function parseVeredito(texto: string): Veredito {
  const trecho = texto.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
  let dados: any;
  try {
    dados = JSON.parse(trecho);
  } catch {
    return {
      aprovado: false,
      nota: null,
      problemas: [{ gravidade: "bloqueante", onde: "revisor", o_que: "A resposta do revisor não veio no formato esperado", como_corrigir: "Revisar de novo" }],
      resposta_bruta: texto.slice(0, 2000),
    };
  }
  const problemas: ProblemaRevisao[] = (Array.isArray(dados.problemas) ? dados.problemas : []).map((p: any) => ({
    gravidade: GRAVIDADES.includes(p?.gravidade) ? p.gravidade : "importante",
    onde: String(p?.onde ?? ""),
    o_que: String(p?.o_que ?? ""),
    como_corrigir: String(p?.como_corrigir ?? ""),
  }));
  const bloqueia = problemas.some((p) => p.gravidade !== "menor");
  const nota = typeof dados.nota === "number" ? Math.max(0, Math.min(10, dados.nota)) : null;
  return { aprovado: !bloqueia && dados.aprovado === true, nota, problemas };
}
