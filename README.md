# bender-3d-mcp

Servidor **MCP remoto** para modelagem 3D, hospedado na **Vercel**. Não depende de nenhum computador ligado: a IA cria, edita, texturiza, renderiza (vê a imagem), mede, exporta e pesquisa na web por ferramentas.

## O que ele faz

| Área | Ferramentas |
|---|---|
| Cenas | `criar_cena`, `listar_cenas`, `obter_cena`, `apagar_cena` |
| Criar | `criar_primitiva` (cubo, esfera, cilindro, cone, toro, cápsula, plano), `criar_extrusao`, `criar_revolucao`, `criar_booleana` (união, subtração, interseção) |
| Editar | `transformar` (definir ou somar), `editar_objeto`, `duplicar_objeto`, `apagar_objeto` |
| Colorir | `definir_material` (cor, metálico, rugosidade, opacidade, emissiva) |
| Texturizar | `aplicar_textura` (procedural: xadrez, listras, bolinhas, gradiente, ruído; ou imagem por URL) |
| Ver | `renderizar_cena` (PNG em frente, topo, lado ou isométrica; devolve link de 1 hora, ou a imagem com `formato: "imagem"`) |
| Medir | `inspecionar_cena` (dimensões, volume, triângulos, avisos de impressão) |
| Exportar | `exportar_modelo` (GLB, STL binário/ASCII, OBJ), com `escala` e `base_no_chao` |
| Animação 2D | `configurar_animacao` (fps, quadros), `animar_propriedade` (keyframes com interpolação linear, suave ou constante), `apagar_chaves`, `exportar_animacao` (GIF ou folha de sprites PNG, até 120 quadros) |
| Animação 3D | `configurar_animacao_3d`, `animar_objeto` (keyframes de posição, rotação e escala), `apagar_chaves_objeto`, `exportar_animacao_3d` (GIF ou GLB animado), `renderizar_cena` com `quadro` |
| Efeitos 3D | `criar_efeito_3d` (explosão, fogo, fumaça, faíscas, neve, chuva), `listar_efeitos_3d`, `apagar_efeito_3d` |
| VFX 2D | `criar_efeito_2d` (explosão, fogo, fumaça, faíscas, brilho, chuva, neve), `apagar_efeito_2d` |
| Criar 2D | `criar_desenho`, `adicionar_forma` (retângulo, elipse, linha, polígono, texto), `adicionar_imagem`, `adicionar_pixelart`, `editar_elemento`, `mover_camada`, `renderizar_desenho` (PNG), `exportar_desenho` (PNG ou SVG) |
| Pesquisar | `pesquisar_web` (Tavily ou Brave), `ler_pagina` (texto limpo de uma URL pública) |
| Interface | `criar_interface`, `adicionar_elemento_ui` (Frame, TextLabel, TextButton, TextBox, ImageLabel, ImageButton, ScrollingFrame e modificadores UI*), `editar_elemento_ui`, `mover_elemento_ui`, `duplicar_elemento_ui`, `apagar_elemento_ui`, `listar_propriedades_ui`, `gerar_preview_interface` (obrigatório antes de exportar), `exportar_interface` (Luau ou JSON), `revisar_interface` (contraste, botões pequenos, texto cortado, sobreposições), `agente_interface` (agente de IA com papel design, organização ou qualidade), `criar_interface_de_modelo` (menu_principal, hud_jogo, dialogo, inventario), `agente_criador_interface` (cria a tela inteira a partir de uma descrição, vendo o preview em imagem) |
| Agente | `agente` (sub-agente que escolhe as ferramentas sozinho; usa OpenRouter com modelo gratuito por padrão, ou Anthropic) |

### Comandos `/prompt`

Cada prompt MCP aparece no cliente como comando de barra e ensina a IA o fluxo certo:

- `/guia`: convenções, fluxo padrão e regras de segurança.
- `/modelar <objeto>`: modela com verificação visual a cada etapa.
- `/texturizar <cena_id> <estilo>`: cores, materiais e texturas.
- `/pesquisar <assunto>`: referências reais antes de modelar.
- `/revisar_impressao <cena_id>`: checagem e exportação STL.

## Arquitetura

```
Cliente de IA ──HTTPS / Bearer──► /mcp (Vercel Function, stateless)
                                     │
            ┌────────────────────────┼──────────────────────────┐
            ▼                        ▼                          ▼
  Cenas (Supabase Postgres)    Geometria (three.js +       Render (Chromium headless
  JSON por cena_id          three-bvh-csg, GLB escrito  + three.js local, WebGL
                            à mão, STL/OBJ)             por software) → PNG
            ▼
  Busca web (Tavily/Brave) · Agente (OpenRouter `openrouter/free`; ou Anthropic)
```

- `api/mcp.ts`: endpoint MCP (Streamable HTTP, modo stateless). Exposto como `/mcp`.
- `api/health.ts`: diagnóstico público, sem segredos. Exposto como `/health`.
- `src/geometria/`: formas, CSG, GLB/STL/OBJ e texturas PNG (sem canvas).
- `src/render/`: renderização em Chromium. O three.js vem do `node_modules`, não de CDN.
- `src/ferramentas/`: cada ferramenta com validação zod. A mesma lista serve o cliente MCP e o agente.
- `src/prompts/`: textos dos comandos `/prompt`.

Eixo Y para cima (convenção do glTF). Unidades arbitrárias; para impressão, use 1 unidade = 1 mm.

## Rodar localmente

```bash
npm install
cp .env.example .env          # preencha pelo menos MCP_TOKEN
npm test                      # 38 testes (inclui o endpoint MCP real)
CHROME_PATH=/caminho/do/chrome npm test   # inclui o teste de render com Chromium
```

Sem `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, as cenas ficam só na memória (serve para testes). Em produção, use o Supabase.

## Deploy na Vercel

1. **Importe o repositório** na Vercel (Add New → Project → este repositório). Framework: *Other*. Nenhum comando de build é necessário.
2. **Crie a tabela**: o SQL está em `supabase/migrations/001_cenas.sql`. Rode no SQL Editor do projeto Supabase (ou via CLI). A tabela tem RLS ligado e nenhuma política pública.
3. **Defina as variáveis de ambiente** (Settings → Environment Variables):
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: armazenamento das cenas. A chave service_role é secreta: nunca a coloque no cliente MCP nem no código.
   - `MCP_TOKEN`: obrigatório. Gere com `openssl rand -hex 32`.
   - `OPENROUTER_API_KEY` (recomendado): para a ferramenta `agente`, com o modelo gratuito `openrouter/free`. `OPENROUTER_MODEL` troca o modelo.
   - `ANTHROPIC_API_KEY` (alternativa paga) e `AGENT_PROVIDER` (`openrouter` ou `anthropic`, opcional).
   - A busca web é gratuita e não precisa de chave: usa o DuckDuckGo e, como alternativa, a Wikipédia.
   - `PUBLIC_URL`: endereço público do projeto, por exemplo `https://SEU-PROJETO.vercel.app`. Usado nos metadados OAuth. Sem ele, o servidor usa o host da requisição.
4. **Faça o deploy** e confira `https://SEU-PROJETO.vercel.app/health`. Esperado: `autenticacao_configurada: true`, `persistencia: true`.

### Conectar um cliente MCP

A URL do servidor é sempre `https://SEU-PROJETO.vercel.app/mcp`.

**ChatGPT, Claude.ai e outros clientes sem cabeçalhos personalizados (OAuth):**

1. Adicione um conector remoto MCP com a URL acima.
2. Escolha autenticação **OAuth**. O cliente registra-se sozinho no servidor (registro dinâmico) e abre uma página de login.
3. Na página de login, digite o `MCP_TOKEN` e confirme. Não há usuário: a senha é o próprio token.
4. Depois disso, o cliente renova o acesso sozinho pelo refresh token (válido por 30 dias).

O fluxo segue OAuth 2.1 com PKCE (S256). Os metadados ficam em `/.well-known/oauth-protected-resource` e `/.well-known/oauth-authorization-server`.

**Clientes que aceitam cabeçalhos (Claude Desktop, Cursor e similares):**

- **Cabeçalho:** `Authorization: Bearer SEU_MCP_TOKEN`

Exemplo de configuração JSON para esses clientes:

```json
{
  "mcpServers": {
    "bender-3d": {
      "url": "https://SEU-PROJETO.vercel.app/mcp",
      "headers": { "Authorization": "Bearer SEU_MCP_TOKEN" }
    }
  }
}
```

## Limites e pontos de atenção

- **Render no Vercel:** usa `@sparticuz/chromium` com WebGL por software. Testado localmente com Chrome real, ainda não testado na Vercel: confira os logs no primeiro uso. Se o tempo estourar, aumente `maxDuration` (plano que permitir) ou reduza `largura`/`altura`.
- **Tempo limite:** cada função tem `maxDuration` de 60 s. Booleanas com malhas muito densas e o agente em pedidos longos podem estourar; use `segmentos` baixos para rascunhos.
- **Exportação inline:** arquivos acima de ~3,5 MB não são devolvidos pelo MCP. A mensagem de erro indica o formato e a resolução a usar.
- **Unidades e posição na exportação:** `escala` multiplica todas as coordenadas (0,1 para mm → cm; 0,001 para mm → m). `base_no_chao=true` assenta o menor ponto do modelo em y = 0. Use os dois antes de imprimir ou publicar. Cada exportação devolve um relatório com triângulos, dimensões finais e avisos (malhas abertas que não imprimem sólido).
- **Textura por URL:** aceita só PNG ou JPEG públicos, de até 4 MB. Endereços internos são bloqueados.
- **Booleanas:** operandos precisam ser malhas fechadas para resultados corretos. A inspeção avisa quando um objeto tem volume zero.
- **Agente:** precisa de `OPENROUTER_API_KEY` ou `ANTHROPIC_API_KEY`. Usa o mesmo conjunto de ferramentas do cliente, exceto o próprio `agente`.
- **Modelos gratuitos:** o `openrouter/free` escolhe um modelo disponível a cada chamada, e nem todos suportam tool calling ou imagens. Se o agente falhar com "No endpoints found that support tool use", troque `OPENROUTER_MODEL` por outro modelo com suporte a ferramentas. O nome do modelo usado aparece na resposta do agente.

## Segurança

- Todo acesso ao `/mcp` exige o token. Sem `MCP_TOKEN` configurado, o servidor recusa tudo (falha fechada).
- `apagar_cena` e `apagar_objeto` exigem `confirmar: true`. Operandos de booleana não podem ser apagados por engano.
- Busca e leitura de páginas bloqueiam localhost, redes privadas e redirecionamentos para elas.
- O render não tem acesso à rede: qualquer requisição que não seja o three.js local é bloqueada.
- Nunca coloque chaves no código. Use só variáveis de ambiente.
