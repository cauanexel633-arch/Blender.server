import { z } from "zod";
import { executarAgente } from "../agentes/agente.js";
import { obterLojaInterfaces } from "../interface/loja.js";
import { HABILIDADES_INTERFACE } from "../interface/habilidades.js";
import { analisarInterface } from "../interface/revisao.js";
import { criarDeModelo, DESCRICOES_MODELOS, MODELOS_INTERFACE, PaletaUI, type ModeloInterface } from "../interface/modelos.js";
import { criarInterfaceUI, type InterfaceUI } from "../interface/tipos.js";
import { ferramentasInterface } from "./interface.js";
import { definir, texto, type Conteudo, type Ferramenta } from "./tipos.js";

/** O criador vê o preview (imagem) e edita, mas não apaga, não exporta e não apaga nada. */
export const FERRAMENTAS_DO_CRIADOR = new Set([
  "obter_interface",
  "listar_propriedades_ui",
  "adicionar_elemento_ui",
  "editar_elemento_ui",
  "mover_elemento_ui",
  "duplicar_elemento_ui",
  "gerar_preview_interface",
]);

const FLUXO_CRIADOR = `FLUXO OBRIGATÓRIO
1. Leia o pedido e planeje a estrutura: telas, painéis, grupos e controles. Se houver um modelo base, use-o como ponto de partida (obter_interface) e ajuste.
2. Monte por partes: primeiro o fundo e os painéis, depois os controles de cada painel.
3. Depois de cada parte, chame gerar_preview_interface e OLHE a imagem. Procure: texto cortado, elementos fora da tela, sobreposição, cores sem contraste, espaçamento irregular.
4. Corrija o que viu, chame revisar_interface e resolva os erros e avisos relevantes.
5. Ao final, chame gerar_preview_interface por último e confirme que a imagem está como o pedido.
6. Responda em português com um resumo curto: o que foi criado e os pontos que você escolheu (cores, textos, layout).
Não invente funções que o pedido não pediu. Use textos em português.`;

const CAMPOS_BASE = {
  nome: z.string().min(1).max(80),
  largura: z.number().int().min(100).max(4000).default(1280),
  altura: z.number().int().min(100).max(4000).default(720),
};

export const ferramentasInterfaceCriador: Ferramenta[] = [
  definir({
    nome: "criar_interface_de_modelo",
    titulo: "Criar interface de um modelo pronto",
    descricao:
      "Cria uma interface pronta e bem organizada a partir de um modelo: menu_principal, hud_jogo, dialogo ou inventario. Use como base e depois ajuste com as ferramentas de elemento. Devolve o interface_id.",
    schema: {
      ...CAMPOS_BASE,
      modelo: z.enum(MODELOS_INTERFACE),
      paleta: PaletaUI.optional().describe("Cores: fundo, superficie, destaque, texto (#rrggbb). Padrão: tema escuro roxo"),
    },
    executar: async ({ nome, largura, altura, modelo, paleta }) => {
      const ui = criarDeModelo(modelo as ModeloInterface, nome, largura, altura, PaletaUI.parse(paleta ?? {}));
      await obterLojaInterfaces().salvar(ui);
      return texto({ interface_id: ui.id, modelo, descricao: DESCRICOES_MODELOS[modelo as ModeloInterface], elementos: ui.elementos.length });
    },
  }),

  definir({
    nome: "agente_criador_interface",
    titulo: "Criar interface a partir de descrição",
    descricao:
      "Agente de IA que cria uma interface completa a partir de uma descrição em texto (ex.: 'menu de jogo de terror com título sangrento e três botões'). Ele monta, vê o preview em imagem, corrige o que estiver errado e devolve o preview final. Você pode partir de um modelo (menu_principal, hud_jogo, dialogo, inventario). Depois, pergunte ao usuário se pode implementar o modelo antes de exportar. Precisa de OPENROUTER_API_KEY ou ANTHROPIC_API_KEY.",
    schema: {
      ...CAMPOS_BASE,
      descricao: z.string().min(10).max(2000).describe("O que a tela deve ter: função, elementos, estilo e cores"),
      modelo: z.enum(MODELOS_INTERFACE).optional().describe("Modelo base opcional"),
      paleta: PaletaUI.optional(),
      max_passos: z.number().int().min(1).max(40).default(25),
    },
    executar: async ({ nome, largura, altura, descricao, modelo, paleta, max_passos }): Promise<Conteudo[]> => {
      const loja = obterLojaInterfaces();
      const base: InterfaceUI = modelo
        ? criarDeModelo(modelo as ModeloInterface, nome, largura, altura, PaletaUI.parse(paleta ?? {}))
        : criarInterfaceUI(nome, largura, altura);
      await loja.salvar(base);

      const ferramentas = ferramentasInterface.filter((f) => FERRAMENTAS_DO_CRIADOR.has(f.nome));
      const instrucao =
        `Crie a interface "${nome}" (id "${base.id}", ${largura}x${altura}).\n\n` +
        `PEDIDO: ${descricao}\n` +
        (modelo ? `Modelo base: ${modelo}. Use obter_interface para ver a estrutura.\n` : "Comece com criar do zero: a interface já existe, só adicione elementos.\n") +
        `\n${HABILIDADES_INTERFACE}\n\n${FLUXO_CRIADOR}`;

      const resultado = await executarAgente({ instrucao, ferramentas, maxPassos: max_passos });

      const final = (await loja.obter(base.id)) ?? base;
      const problemas = analisarInterface(final);
      const erros = problemas.filter((p) => p.severidade === "erro");

      // Preview final sempre entregue ao usuário, com a imagem, para a aprovação.
      const previewTool = ferramentasInterface.find((f) => f.nome === "gerar_preview_interface")!;
      const previewConteudo = await previewTool.executar({ interface_id: base.id });

      return [
        {
          type: "text",
          text: JSON.stringify(
            {
              interface_id: base.id,
              modelo_base: modelo ?? null,
              resposta_do_agente: resultado.resposta,
              passos: resultado.passos,
              ferramentas_usadas: [...new Set(resultado.ferramentas_usadas)],
              limite_atingido: resultado.limite_atingido,
              modelo_ia: `${resultado.provedor}/${resultado.modelo}`,
              problemas_restantes: problemas.length,
              erros_restantes: erros.length,
              problemas: problemas.slice(0, 20),
              proximo_passo:
                "Mostre o preview ao usuário e pergunte se pode implementar esse modelo. Só exporte depois da aprovação.",
            },
            null,
            2,
          ),
        },
        ...previewConteudo,
      ];
    },
  }),
];
