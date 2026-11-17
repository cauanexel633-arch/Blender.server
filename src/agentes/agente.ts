import type { Ferramenta } from "../ferramentas/tipos.js";
import { TEXTO_GUIA } from "../prompts/guia.js";
import { escolherProvedor, type ItemResultado, type Passo } from "./provedores.js";

export interface OpcoesAgente {
  instrucao: string;
  ferramentas: Ferramenta[];
  maxPassos: number;
}

export interface ResultadoAgente {
  resposta: string;
  passos: number;
  ferramentas_usadas: string[];
  limite_atingido: boolean;
  provedor: string;
  modelo: string;
}

/**
 * Agente com loop de ferramentas: o modelo pede ferramentas do próprio servidor, o servidor executa
 * e devolve o resultado, até o modelo responder sem pedir mais nada ou atingir `maxPassos`.
 */
export async function executarAgente(opcoes: OpcoesAgente): Promise<ResultadoAgente> {
  const provedor = escolherProvedor();
  const porNome = new Map(opcoes.ferramentas.map((f) => [f.nome, f]));
  const historico: Passo[] = [];
  const usadas: string[] = [];

  for (let passo = 1; passo <= opcoes.maxPassos; passo++) {
    const turno = await provedor.enviar(TEXTO_GUIA, opcoes.ferramentas, opcoes.instrucao, historico);
    historico.push({ tipo: "assistente", textos: turno.textos, chamadas: turno.chamadas });

    if (turno.chamadas.length === 0) {
      return {
        resposta: turno.textos.join("\n").trim(),
        passos: passo,
        ferramentas_usadas: usadas,
        limite_atingido: false,
        provedor: provedor.nome,
        modelo: provedor.modelo,
      };
    }

    const itens: ItemResultado[] = [];
    for (const chamada of turno.chamadas) {
      usadas.push(chamada.nome);
      const ferramenta = porNome.get(chamada.nome);
      try {
        if (!ferramenta) throw new Error(`Ferramenta desconhecida: ${chamada.nome}`);
        const conteudo = await ferramenta.executar(chamada.argumentos);
        itens.push({ id: chamada.id, nome: chamada.nome, conteudo, erro: false });
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro);
        itens.push({ id: chamada.id, nome: chamada.nome, conteudo: [{ type: "text", text: msg }], erro: true });
      }
    }
    historico.push({ tipo: "resultados", itens });
  }

  return {
    resposta: "Limite de passos atingido antes de concluir. Refine a instrução ou aumente max_passos.",
    passos: opcoes.maxPassos,
    ferramentas_usadas: usadas,
    limite_atingido: true,
    provedor: provedor.nome,
    modelo: provedor.modelo,
  };
}
