/**
 * Habilidades por área: o jeito de trabalho de quem faz isso bem. A ferramenta consultar_habilidades
 * devolve o texto da área pedida, para o cliente ou o agente seguir antes de criar.
 */
export const AREAS = ["modelagem3d", "impressao3d", "animacao3d", "desenho2d", "pixelart", "vfx", "interface", "audio"] as const;
export type Area = (typeof AREAS)[number];

export const HABILIDADES: Record<Area, { titulo: string; texto: string }> = {
  modelagem3d: {
    titulo: "Modelagem 3D",
    texto: `FLUXO DE TRABALHO
1. Referência primeiro: pesquise medidas e fotos reais (pesquisar_web). Anote as dimensões principais antes de modelar.
2. Bloco básico (block-out): monte a silhueta com formas grandes, sem detalhes. Confira proporções pela vista frontal, lateral e topo.
3. Refino: separe as partes (cabo, corpo, tampa). Ajuste uma parte por vez e renderize para conferir.
4. Detalhe: furos, bordas, encaixes, relevos. Só depois que a forma geral estiver certa.
5. Acabamento: material e textura. Verifique em pelo menos duas câmeras.

MEDIDAS E PROPORÇÃO
- Use unidades reais. Se o objeto for um copo de 10 cm, modele em mm (100 unidades) e confira no inspecionar_cena.
- Proporção humana: altura da cabeça ≈ 1/7 a 1/8 da altura do corpo. Porta padrão ≈ 2,10 m por 0,80 m.
- Espessuras: paredes de objeto real entre 1 e 3 mm em plástico fino; metal e madeira mais grossos.

PEÇAS TORNEADAS
- Use criar_revolucao com o perfil de metade da seção. Pontos bem espaçados nas curvas e mais pontos onde a curva muda rápido.
- Para copos e vasos, deixe a parede com espessura constante (perfil interno e externo).

COMBINAÇÃO (BOOLEANAS)
- Operandos precisam ser malhas fechadas. Uma booleana com malha aberta gera resultado errado.
- Para furos, faça o cilindro um pouco maior que a face (overshoot) para não deixar película.
- Use segmentos baixos (16 a 32) para rascunho e altos (64 ou mais) na versão final: booleanas com malha muito densa são lentas.

ILUMINAÇÃO E CÂMERA DE CONFERÊNCIA
- Confira o modelo na isométrica e na frente. Modelo bom se sustenta sem textura: a forma tem que se ler sozinha.
- Evite objetos cortados pela borda da imagem.

ERROS COMUNS
- Escala errada (modelo gigante ou minúsculo).
- Partes flutuando ou interpenetrando sem motivo.
- Esquecer de centralizar a base em y = 0 antes de exportar (use base_no_chao).`,
  },

  impressao3d: {
    titulo: "Impressão 3D",
    texto: `ANTES DE IMPRIMIR
- Unidades: trabalhe em mm (1 unidade = 1 mm) e exporte com escala 1. Confira as dimensões finais no inspecionar_cena.
- Malha fechada: o inspecionar_cena avisa sobre malhas abertas e volume zero. Corrija antes de exportar.
- Base no chão: use base_no_chao=true na exportação STL.

MEDIDAS MÍNIMAS (FDM comum)
- Parede: 1,2 a 2 mm (3 a 4 perímetros de 0,4 mm).
- Detalhe fino e texto em relevo: no mínimo 0,6 a 1 mm de altura.
- Furo para parafuso M3: 3,2 a 3,4 mm. Para M4: 4,2 a 4,5 mm.
- Encaixe (peça dentro de peça): folga de 0,2 a 0,4 mm por lado, conforme a impressora.
- Pino ou ponte sem apoio: até cerca de 10 mm sem problema.

ORIENTAÇÃO E SUPORTE
- Ângulos de saliência acima de 45° em relação à vertical precisam de suporte. Prefira orientar a peça para reduzir o suporte.
- Peça plana na mesa dá melhor adesão e mais resistência no sentido das camadas.
- Evite partes finas em pé: quebram na direção das camadas.

FORMATO E ESCALA
- STL para impressão. GLB é para visualização web e não serve para fatiar.
- Peça grande demais para a mesa: divida em partes com encaixe, em vez de escalar para baixo sem critério.

CHECKLIST FINAL
1. Dimensões conferidas em mm.
2. Sem malha aberta, sem volume zero.
3. Paredes e furos dentro dos mínimos.
4. Folgas de encaixe definidas.
5. Base em y = 0, orientação pensada.`,
  },

  animacao3d: {
    titulo: "Animação 3D",
    texto: `PRINCÍPIOS (12 princípios da animação, aplicados aqui)
- Antecipação: antes de um movimento grande, um pequeno movimento contrário (agachar antes de pular).
- Compressão e alongamento: dá peso e flexibilidade. Use com moderação em objetos rígidos.
- Ação seguida e sobreposição: partes leves continuam se movendo depois que o corpo para (um cabelo ou uma cauda com quadros um pouco atrasados).
- Ritmo: quadros de início e fim do movimento são mais lentos; o meio é rápido.
- Arco: movimentos naturais seguem trajetórias curvas, não linhas retas.

CONFIGURAÇÃO
- 24 fps para cinema e 30 fps para jogos e web. Use 12 a 24 quadros para um movimento simples de 0,5 a 1 s.
- Pivô: anime rotações a partir do ponto certo (porta gira pela dobradiça, não pelo centro).
- Quadros-chave: primeiro os extremos (início e fim), depois os intermediários.

INTERPOLAÇÃO
- Linear: mecânico, bom para rotações constantes e esteiras.
- Suave: a maioria dos movimentos de personagens e objetos.
- Constante: troca de estado (luz que acende, porta que abre de repente).

CONFERÊNCIA
- Renderize quadros-chave com renderizar_cena (parâmetro quadro) antes de exportar.
- Confira se o objeto não atravessa outros e se o loop fecha (último quadro igual ao primeiro, se for loop).

ERROS COMUNS
- Movimento sem peso: tudo com a mesma velocidade.
- Pivô errado: objeto que parece girar em torno do ar.
- Quadros demais para pouco movimento (arquivo grande sem ganho).`,
  },

  desenho2d: {
    titulo: "Desenho 2D e interfaces",
    texto: `COMPOSIÇÃO
- Grade de 8 px: alinhe posições e tamanhos a múltiplos de 8 (ou 4 para detalhes).
- Hierarquia: o que é mais importante é maior, mais contrastado ou está mais no centro. Escolha um foco por imagem.
- Regra dos terços e margem: deixe pelo menos 5% de margem nas bordas.
- Poucas cores: uma cor de destaque, uma neutra para fundo, e tons derivados.

FORMA E ACABAMENTO
- Cantos: use raios consistentes (ex.: 8 px para botões, 16 px para painéis). Não misture raios aleatórios.
- Sombra e luz: fonte de luz em um lado só, do canto superior esquerdo (é o padrão de leitura).
- Contorno: linhas de 1 a 2 px; use uma cor mais escura que o preenchimento, não preto puro em tudo.

TEXTO
- Tamanho mínimo legível: 14 px no corpo, 20 px ou mais em títulos.
- Alinhamento à esquerda para leitura; centralizado só para títulos curtos e botões.
- Máximo de 2 fontes. Espaço entre linhas de 1,3 a 1,5 vezes o tamanho.

ORDEM DE CONSTRUÇÃO
1. Fundo.
2. Painéis e áreas grandes.
3. Controles (botões, campos).
4. Textos e ícones.
5. Ajustes finais de cor e contraste.
Use mover_camada para ajustar a ordem depois. Renderize após cada etapa grande.

EXPORTAÇÃO
- PNG para uso geral; SVG para vetor que precisa escalar.`,
  },

  pixelart: {
    titulo: "Pixel art",
    texto: `TAMANHOS
- Sprites comuns: 16x16, 24x24, 32x32, 64x64. Escolha um e mantenha em todo o projeto.
- Personagem em 32x32 ocupa cerca de 24 a 28 px de altura; deixe margem.

PALETA
- 8 a 16 cores para a maioria dos sprites. Paleta limitada dá unidade visual.
- Monte as cores em rampas: 3 a 4 tons de cada família (sombra, meio-tom, luz).
- Sombra mais saturada e mais fria, luz mais quente. Evite sombra só mais escura.
- Contorno: um tom escuro da própria cor (selout), não preto puro em tudo.

FORMA
- Pixel isolado ou em diagonal mal feita fica feio. Diagonais em degrau regular (2 px em linha, 1 px em degrau).
- Luz sempre do mesmo lado, em todo o conjunto.
- Olhe em escala pequena (1x) para checar leitura da silhueta.

ANIMAÇÃO
- Quadros típicos: parado (idle) 4 a 6 quadros, andar 6 a 8, ataque 4 a 6. Fps de 8 a 12 para a maioria.
- Mantenha o pivô (pés, centro) no mesmo lugar entre quadros.
- Use exportar_animacao com folha_png para sprite sheet.

VERIFICAÇÃO
- Renderize com escala 4 ou mais (renderizar_desenho) para conferir detalhes, mas confira também em escala 1.
- Compare o sprite com o fundo onde ele vai aparecer.`,
  },

  vfx: {
    titulo: "Efeitos visuais (VFX)",
    texto: `ESTRUTURA DE UM EFEITO
- Início rápido, pico curto, decaimento longo. Explosão: flash em 1 a 3 quadros, fumaça que sobe e some em 1 a 2 s.
- Partículas com tempo de vida diferente entre si. Todas morrendo juntas parece artificial.
- Variação: tamanho, velocidade e cor levemente diferentes em cada partícula (use semente para repetir).

COR E LUZ
- Brilho: cores quentes (amarelo, laranja) no centro, vermelho e escuro nas bordas.
- Use emissiva para partes que brilham; sem fundo escuro, o brilho some.
- Fumaça: cinza com pouca saturação e transparência; não use preto puro.

TIMING (referência para 24 fps)
- Faísca: 0,2 a 0,4 s.
- Explosão: 0,5 a 1 s.
- Fogo e fumaça contínuos: loop de 1 a 2 s.
- Neve e chuva: loop longo e sem repetição visível.

QUANTIDADE E CUSTO
- Muitas partículas pesam. Comece com 20 a 50 e aumente só se necessário.
- Limite do servidor: partículas × quadros não pode passar de 200 mil amostras.

CONFERÊNCIA
- Renderize o começo, o pico e o fim do efeito (renderizar_cena com quadro).
- Confira se a semente gera o resultado esperado antes de repetir o efeito.`,
  },

  interface: {
    titulo: "Interface (estilo Roblox Studio)",
    texto: `LAYOUT
- Escala para responsividade (UDim2 com escala 0 a 1), offset para tamanhos fixos (botões, ícones).
- Margens de 16 px nas bordas. Espaço entre controles de 8 a 16 px.
- Centralize com AnchorPoint [0.5, 0.5] e Position [0.5, 0, 0.5, 0].
- Listas e grades: UIListLayout e UIGridLayout, sem posições manuais.

LEGIBILIDADE
- Contraste de texto de pelo menos 4.5:1 com o fundo (use revisar_interface).
- Texto de 14 px ou mais; título de 28 px ou mais.
- Botão de no mínimo 36 px de altura (44 px ideal para toque).

HIERARQUIA E ORGANIZAÇÃO
- Um painel por função. Agrupe controles relacionados.
- Ação principal com destaque; ações secundárias discretas.
- Nomes claros em todos os elementos (BotaoJogar, PainelConfiguracoes).

CONSISTÊNCIA
- Paleta de 3 a 4 cores. Cantos com o mesmo raio em todos os painéis.
- Fontes: no máximo duas famílias.

HUD DE JOGO
- Informação importante nos cantos, centro livre.
- Barras com fundo escuro e preenchimento de cor.

CONFERÊNCIA
- gerar_preview_interface e olhe a imagem. Confira em mais de uma resolução (largura e altura diferentes).
- revisar_interface sem erros graves antes de mostrar ao usuário.`,
  },

  audio: {
    titulo: "Áudio",
    texto: `LICENÇA
- Confira a licença antes de usar. CC0 e CC BY são livres para uso comercial; CC BY-NC não.
- Mantenha a atribuição (título, autor, licença e página) sempre que usar um som CC BY.
- O servidor só entrega a prévia MP3 da Freesound (qualidade menor que o original).

ESCOLHA
- Efeitos curtos (0,2 a 2 s) para interface e impacto; ambientes em loop para fundo.
- Procure pelo tipo de superfície, material e intensidade, não só pelo nome do objeto.
- Ouça a prévia pelo link antes de decidir: a IA não escuta o som.

USO
- Volume: efeitos de interface mais baixos que a música; impactos com pico controlado.
- Evite clipping: prefira sons normalizados.
- Para loop, confira o início e o fim do arquivo.

CHECKLIST
1. Licença compatível com o uso.
2. Atribuição guardada junto com o arquivo.
3. Prévia ouvida pelo usuário, que confirmou a escolha.`,
  },
};

export function textoDaArea(area: Area): string {
  const h = HABILIDADES[area];
  return `# ${h.titulo}\n\n${h.texto}`;
}
