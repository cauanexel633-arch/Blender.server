import { z } from "zod";
import { publicarExportacao, LIMITE_ARQUIVO_BYTES } from "../armazenamento/arquivos.js";
import { gerarLuau } from "../interface/luau.js";
import { obterLojaInterfaces } from "../interface/loja.js";
import { CLASSES_UI, DEFINICOES, padroesDe, type ClasseUI } from "../interface/propriedades.js";
import { renderizarPreviewPng } from "../interface/preview.js";
import {
  adicionarElementoUI,
  apagarElementoUI,
  criarInterfaceUI,
  duplicarElementoUI,
  editarElementoUI,
  filhosDe,
  hashEstadoUI,
  moverElementoUI,
  raizDe,
  ValorUI,
  type ElementoUI,
  type InterfaceUI,
} from "../interface/tipos.js";
import { definir, texto, type Conteudo } from "./tipos.js";
import { CAMPO_FORMATO_IMAGEM, conteudoImagem } from "./imagem.js";

const campoInterfaceId = z.string().min(1).describe("ID da interface (retornado por criar_interface)");
const campoElementoId = z.string().min(1).describe("ID do elemento (retornado por adicionar_elemento_ui ou obter_interface)");
const campoPropriedades = z
  .record(z.string(), ValorUI)
  .describe("Propriedades com os nomes do Roblox Studio. UDim2 = [xs, xo, ys, yo]; UDim = [s, o]; Vector2 = [x, y]; cor = '#rrggbb'; enum = nome do item");

async function carregar(id: string): Promise<InterfaceUI> {
  const ui = await obterLojaInterfaces().obter(id);
  if (!ui) throw new Error(`Interface "${id}" não existe`);
  return ui;
}

/** Salva e zera o preview: qualquer mudança exige um novo preview antes da exportação. */
async function salvarAlterada(ui: InterfaceUI): Promise<void> {
  ui.preview_hash = null;
  ui.atualizada_em = new Date().toISOString();
  await obterLojaInterfaces().salvar(ui);
}

/** Árvore compacta: id, classe, nome e só as propriedades diferentes do padrão. */
function arvore(ui: InterfaceUI, el: ElementoUI): Record<string, unknown> {
  const padrao = padroesDe(el.classe);
  const alteradas: Record<string, unknown> = {};
  for (const [nome, valor] of Object.entries(el.propriedades)) {
    if (nome === "Name") continue;
    if (JSON.stringify(valor) !== JSON.stringify(padrao[nome])) alteradas[nome] = valor;
  }
  return {
    id: el.id,
    classe: el.classe,
    nome: el.propriedades.Name,
    propriedades_alteradas: alteradas,
    filhos: filhosDe(ui, el.id).map((f) => arvore(ui, f)),
  };
}

const resumoPreview = (ui: InterfaceUI) => ({
  interface_id: ui.id,
  nome: ui.nome,
  largura: ui.largura,
  altura: ui.altura,
  elementos: ui.elementos.length,
  preview_aprovado: ui.preview_hash !== null,
});

export const ferramentasInterface = [
  definir({
    nome: "criar_interface",
    titulo: "Criar interface",
    descricao:
      "Cria uma interface de tela (ScreenGui) como no Roblox Studio, com resolução de referência. Depois, adicione elementos com adicionar_elemento_ui.",
    schema: {
      nome: z.string().min(1).max(80),
      largura: z.number().int().min(100).max(4000).default(1280).describe("Largura de referência em pixels"),
      altura: z.number().int().min(100).max(4000).default(720).describe("Altura de referência em pixels"),
    },
    executar: async ({ nome, largura, altura }) => {
      const ui = criarInterfaceUI(nome, largura, altura);
      await obterLojaInterfaces().salvar(ui);
      return texto({ interface_id: ui.id, elemento_raiz_id: raizDe(ui).id, largura, altura });
    },
  }),

  definir({
    nome: "listar_interfaces",
    titulo: "Listar interfaces",
    descricao: "Lista as interfaces salvas, com indicação de preview aprovado.",
    somenteLeitura: true,
    schema: {},
    executar: async () => texto((await obterLojaInterfaces().listar()).map(resumoPreview)),
  }),

  definir({
    nome: "obter_interface",
    titulo: "Obter interface",
    descricao:
      "Mostra a árvore de elementos da interface, com as propriedades alteradas de cada um (as que estão no padrão não aparecem).",
    somenteLeitura: true,
    schema: { interface_id: campoInterfaceId },
    executar: async ({ interface_id }) => {
      const ui = await carregar(interface_id);
      return texto({ ...resumoPreview(ui), arvore: arvore(ui, raizDe(ui)) });
    },
  }),

  definir({
    nome: "listar_propriedades_ui",
    titulo: "Listar propriedades de um elemento",
    descricao:
      "Mostra as propriedades de uma classe da interface (nome, tipo, valor padrão e valores aceitos). Use antes de editar para escrever os nomes certos. Classes: " +
      CLASSES_UI.join(", "),
    somenteLeitura: true,
    schema: { classe: z.enum(CLASSES_UI) },
    executar: async ({ classe }) =>
      texto(
        Object.entries(DEFINICOES[classe as ClasseUI]).map(([nome, def]) => ({
          nome,
          tipo: def.tipo,
          padrao: def.padrao,
          ...(def.valores ? { valores: def.valores } : {}),
        })),
      ),
  }),

  definir({
    nome: "adicionar_elemento_ui",
    titulo: "Adicionar elemento de interface",
    descricao:
      "Adiciona um elemento (Frame, TextLabel, TextButton, TextBox, ImageLabel, ImageButton, ScrollingFrame) ou um modificador (UICorner, UIStroke, UIPadding, UIListLayout, UIGridLayout, UIAspectRatioConstraint, UISizeConstraint, UITextSizeConstraint, UIScale, UIGradient). Modificadores ficam dentro de um elemento visível. Propriedades seguem os nomes do Roblox Studio.",
    schema: {
      interface_id: campoInterfaceId,
      classe: z.enum(CLASSES_UI),
      pai_id: z.string().optional().describe("Elemento pai (padrão: o ScreenGui raiz)"),
      nome: z.string().min(1).max(80).optional(),
      propriedades: campoPropriedades.optional(),
    },
    executar: async (a) => {
      const ui = await carregar(a.interface_id);
      const props: Record<string, unknown> = { ...(a.propriedades ?? {}) };
      if (a.nome) props.Name = a.nome;
      const el = adicionarElementoUI(ui, a.classe as ClasseUI, a.pai_id ?? raizDe(ui).id, props);
      await salvarAlterada(ui);
      return texto({ elemento_id: el.id, classe: el.classe, pai_id: el.pai_id });
    },
  }),

  definir({
    nome: "editar_elemento_ui",
    titulo: "Editar propriedades de elemento",
    descricao:
      "Altera propriedades de um elemento sem recriá-lo. Só os campos enviados mudam. Exemplo: Position [0.5, 0, 0.5, 0], BackgroundColor3 '#1e1e1e', Text 'Jogar'.",
    schema: {
      interface_id: campoInterfaceId,
      elemento_id: campoElementoId,
      propriedades: campoPropriedades,
    },
    executar: async ({ interface_id, elemento_id, propriedades }) => {
      const ui = await carregar(interface_id);
      editarElementoUI(ui, elemento_id, propriedades);
      await salvarAlterada(ui);
      return texto({ elemento_id, alteradas: Object.keys(propriedades) });
    },
  }),

  definir({
    nome: "mover_elemento_ui",
    titulo: "Mover elemento na hierarquia",
    descricao: "Muda o pai de um elemento (troca de Frame, por exemplo). Não permite colocar um elemento dentro dele mesmo.",
    schema: {
      interface_id: campoInterfaceId,
      elemento_id: campoElementoId,
      novo_pai_id: z.string().min(1),
    },
    executar: async ({ interface_id, elemento_id, novo_pai_id }) => {
      const ui = await carregar(interface_id);
      moverElementoUI(ui, elemento_id, novo_pai_id);
      await salvarAlterada(ui);
      return texto({ elemento_id, novo_pai_id });
    },
  }),

  definir({
    nome: "duplicar_elemento_ui",
    titulo: "Duplicar elemento",
    descricao: "Copia um elemento com tudo o que está dentro dele, com novos ids. Pode ser colocado em outro pai.",
    schema: {
      interface_id: campoInterfaceId,
      elemento_id: campoElementoId,
      novo_pai_id: z.string().optional().describe("Pai da cópia (padrão: o mesmo pai)"),
    },
    executar: async ({ interface_id, elemento_id, novo_pai_id }) => {
      const ui = await carregar(interface_id);
      const copia = duplicarElementoUI(ui, elemento_id, novo_pai_id);
      await salvarAlterada(ui);
      return texto({ elemento_id: copia.id, classe: copia.classe });
    },
  }),

  definir({
    nome: "apagar_elemento_ui",
    titulo: "Apagar elemento",
    descricao: "Remove um elemento e tudo o que está dentro dele. Exige confirmar=true e só deve ser usada quando o usuário pedir.",
    destrutiva: true,
    schema: {
      interface_id: campoInterfaceId,
      elemento_id: campoElementoId,
      confirmar: z
        .boolean()
        .refine((v) => v === true, { message: "Use true para confirmar" })
        .describe("Deve ser exatamente true para confirmar a remoção"),
    },
    executar: async ({ interface_id, elemento_id }) => {
      const ui = await carregar(interface_id);
      const removidos = apagarElementoUI(ui, elemento_id);
      await salvarAlterada(ui);
      return texto({ removidos });
    },
  }),

  definir({
    nome: "apagar_interface",
    titulo: "Apagar interface",
    descricao: "Remove a interface inteira. Exige confirmar=true e só deve ser usada quando o usuário pedir.",
    destrutiva: true,
    schema: {
      interface_id: campoInterfaceId,
      confirmar: z
        .boolean()
        .refine((v) => v === true, { message: "Use true para confirmar" })
        .describe("Deve ser exatamente true para confirmar a remoção"),
    },
    executar: async ({ interface_id }) => {
      const apagada = await obterLojaInterfaces().apagar(interface_id);
      if (!apagada) throw new Error(`Interface "${interface_id}" não existe`);
      return texto({ apagada: interface_id });
    },
  }),

  definir({
    nome: "gerar_preview_interface",
    titulo: "Gerar preview da interface",
    descricao:
      "Renderiza a interface como imagem, do jeito que ficará no jogo. OBRIGATÓRIO antes de exportar: mostre a imagem ao usuário e pergunte se pode implementar esse modelo. Qualquer alteração depois exige novo preview.",
    somenteLeitura: true,
    schema: { interface_id: campoInterfaceId, formato: CAMPO_FORMATO_IMAGEM },
    executar: async ({ interface_id, formato }): Promise<Conteudo[]> => {
      const ui = await carregar(interface_id);
      const png = await renderizarPreviewPng(ui);
      ui.preview_hash = hashEstadoUI(ui);
      await obterLojaInterfaces().salvar(ui);
      const imagem = await conteudoImagem(`${ui.id}-preview.png`, png, formato);
      return [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...resumoPreview(ui),
              preview_id: ui.preview_hash,
              aviso: "Mostre o preview ao usuário e pergunte se pode implementar. Só exporte depois que ele confirmar.",
            },
            null,
            2,
          ),
        },
        ...imagem,
      ];
    },
  }),

  definir({
    nome: "exportar_interface",
    titulo: "Exportar interface",
    descricao:
      "Gera o código da interface: 'luau' (LocalScript que cria a interface no PlayerGui, para colocar em StarterPlayerScripts) ou 'json' (dados da interface). Exige o preview_id do último gerar_preview_interface e confirmar=true, depois que o usuário aprovar o modelo.",
    schema: {
      interface_id: campoInterfaceId,
      formato: z.enum(["luau", "json"]).default("luau"),
      preview_id: z.string().min(1).describe("preview_id devolvido por gerar_preview_interface"),
      confirmar: z
        .boolean()
        .refine((v) => v === true, { message: "Use true somente depois que o usuário aprovar o preview" })
        .describe("Deve ser true: o usuário aprovou o preview"),
    },
    executar: async ({ interface_id, formato, preview_id }): Promise<Conteudo[]> => {
      const ui = await carregar(interface_id);
      if (ui.preview_hash === null || ui.preview_hash !== preview_id) {
        throw new Error(
          "A interface mudou desde o último preview, ou não há preview aprovado. Gere o preview com gerar_preview_interface e peça aprovação ao usuário.",
        );
      }
      const conteudo = formato === "luau" ? gerarLuau(ui) : JSON.stringify(ui, null, 2);
      const extensao = formato === "luau" ? "lua" : "json";
      const dados = Buffer.from(conteudo, "utf8");
      if (dados.length > LIMITE_ARQUIVO_BYTES) throw new Error("Código grande demais para exportar.");
      const link = await publicarExportacao(`${ui.nome.replace(/[^\w-]+/g, "_") || "interface"}.${extensao}`, dados, "text/plain");
      const cabecalho = {
        formato,
        interface_id: ui.id,
        elementos: ui.elementos.length,
        preview_id,
        ...(link ? { download_url: link.url, link_expira_em: link.expira_em } : {}),
      };
      return [
        { type: "text", text: JSON.stringify(cabecalho, null, 2) },
        { type: "text", text: conteudo },
      ];
    },
  }),
];

