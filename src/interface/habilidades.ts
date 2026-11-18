/**
 * Base de conhecimento do agente criador de interfaces. Regras de layout, paleta, tipografia e
 * componentes no padrão do Roblox Studio. Entra no prompt do agente, não é executada.
 */
export const HABILIDADES_INTERFACE = `REGRAS DE LAYOUT (Roblox Studio)
- Tela de referência: a interface usa a largura e a altura informadas. Tudo que for "fora da tela" é erro.
- Posição e tamanho em UDim2 [escala_x, offset_x, escala_y, offset_y]. Escala 0.5 é metade do pai. Use escala para responsividade e offset para tamanhos fixos (botões, ícones).
- Centralizar: Position [0.5,0,0.5,0] + AnchorPoint [0.5,0.5].
- Margens: 16 px nas bordas. Espaço entre elementos: 8 a 16 px.
- Listas e grades: use UIListLayout (vertical ou horizontal, Padding) ou UIGridLayout (CellSize) dentro do painel, no lugar de posições manuais. Os filhos não precisam de Position nesse caso.
- Painel: Frame com UICorner (CornerRadius 8 a 16 px) e, se útil, UIPadding (8 a 16 px) para não encostar nas bordas.
- Hierarquia: ScreenGui > painéis > grupos > controles. Nunca deixe texto solto na raiz.

PALETA
- Use 4 cores: fundo (escuro ou claro), superfície (painéis, 5 a 10% mais clara que o fundo), destaque (ação principal) e texto.
- Texto sobre cor de destaque: branco ou quase branco. Contraste mínimo 4.5:1 entre texto e fundo (use revisar_interface para conferir).
- Ações secundárias usam a superfície; a ação principal usa o destaque. Não use mais de um destaque na mesma tela.

TIPOGRAFIA
- Título: GothamBold, TextSize 28 a 40. Subtítulo: GothamSemibold, 18 a 22. Corpo e botões: Gotham ou GothamMedium, 14 a 18.
- Texto sempre com caixa de altura suficiente: altura mínima = TextSize. Use TextScaled true só em títulos curtos.
- Textos com TextXAlignment Left para leitura, Center para botões e títulos.

COMPONENTES
- Botão: TextButton, altura 40 a 56 px, largura 60% a 80% do painel, UICorner, texto centralizado. Mínimo 36 px.
- Barra (vida, progresso): Frame de fundo com UICorner + Frame preenchido com Size escala X igual ao valor.
- Caixa de texto: TextBox com PlaceholderText e altura 36 a 44 px.
- Imagem de ícone: ImageLabel quadrado (ex.: 48x48) com BackgroundTransparency 1.
- Lista rolável: ScrollingFrame com AutomaticCanvasSize Y e UIListLayout dentro.
- Diálogo e legendas: painel na parte inferior, largura total, nome do personagem em destaque.
- HUD: informações nos cantos (vida em cima à esquerda, munição em baixo à direita, mapa em cima à direita). Não cubra o centro da tela.

NOMES E ORGANIZAÇÃO
- Todo elemento tem Name descritivo (BotaoJogar, PainelConfiguracoes, BarraVida). Nunca deixe "Frame" ou "TextLabel".
- Agrupe: um painel por tela ou por função. Ordem dos filhos: fundo primeiro, depois conteúdo.

CHECKLIST ANTES DE ENTREGAR
1. Todos os elementos cabem na tela (revisar_interface sem "fora_da_tela").
2. Botões com 36 px ou mais; texto sem corte.
3. Contraste de texto acima de 4.5:1.
4. Nomes descritivos, sem sobreposição indevida.
5. Preview visto e conferido, com a última alteração já refletida.`;
