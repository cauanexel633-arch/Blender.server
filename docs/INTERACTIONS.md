# Blender AI Cloud — Manual de interações

Este manual descreve as ferramentas que **existem nesta versão** do projeto. O sistema usa FastAPI como control plane, MCP Streamable HTTP como interface para agentes e workers Docker que executam Blender em modo Headless.

> Limite importante: esta versão não expõe literalmente todas as funções do Blender como ferramentas MCP e não executa Python arbitrário enviado pelo agente. A descoberta enumera operadores da build do Blender; nem todos funcionam em background, e a execução continua restrita por allow-list/contexto.

## 1. Conceitos e fluxo

- **project_id:** identificador lógico do projeto. Use letras, números, hífen e underscore, até 100 caracteres.
- **job_id:** identificador de uma execução assíncrona.
- **worker:** container/processo que executa Blender com --background.
- **assets:** arquivos gerados, por exemplo .blend, .glb, .fbx, .obj, preview.png e result.json.

Fluxo recomendado:
1. Chame `blender_capabilities`.
2. Envie um job com a ferramenta adequada.
3. Guarde o `job_id`.
4. Consulte `blender_get_job` até `completed` ou `failed`.
5. Em sucesso, apresente os metadados e URLs em `result.assets`.
6. Em falha, leia `error`, corrija os parâmetros e só então envie outro job.

Estados: `queued`, `starting`, `running`, `validating`, `completed`, `failed`.

## 2. Conexão MCP

Endpoint local: `http://localhost:8001/mcp`

Header obrigatório:
```http
Authorization: Bearer SEU_MCP_ACCESS_TOKEN
```

Exemplo:
```json
{
  "mcpServers": {
    "blender-ai-cloud": {
      "url": "http://localhost:8001/mcp",
      "headers": { "Authorization": "Bearer dev-api-secret" }
    }
  }
}
```

Em produção use HTTPS e token exclusivo. Nunca entregue `WORKER_TOKEN` ao agente MCP.

## 3. Todas as ferramentas MCP desta versão

### `blender_capabilities()`
Sem argumentos. Retorna engine, operações declaradas, primitivas, formatos de exportação e observações sobre Headless. Use antes de planejar tarefas.

### `blender_create_model(project_id, primitive="cube", name="AI_Model", size=2.0, exports=["blend","glb"])`
Enfileira a criação de uma primitiva.
- `project_id`: obrigatório.
- `primitive`: `cube`, `uv_sphere`, `ico_sphere`, `cylinder`, `cone`, `torus`, `plane`.
- `name`: nome do objeto.
- `size`: dimensão positiva, até 1000.
- `exports`: qualquer combinação de `blend`, `glb`, `fbx`, `obj`.

Exemplo:
```json
{"project_id":"weapons","primitive":"cylinder","name":"Barrel","size":1.4,"exports":["blend","glb","fbx"]}
```

### `blender_get_job(job_id)`
Consulta o estado, resultado, erro e assets do job. Exemplo: `{"job_id":"job_0123456789abcdef"}`. Faça polling moderado (2–5 s); não crie jobs duplicados enquanto o primeiro está executando.

### `blender_generate_from_prompt(project_id, prompt)`
Usa o OpenRouter para transformar linguagem natural em uma especificação restrita e enfileirar o job. Exige `OPENROUTER_API_KEY`. O planejador atual só pode gerar `create_model` ou `inspect_scene`, com primitivas e parâmetros aceitos pelo schema; não gera atualmente malhas orgânicas avançadas, rigging, animações ou materiais PBR complexos.

Exemplo:
```json
{"project_id":"props","prompt":"Crie uma icosfera chamada EnergyCore, tamanho 3, exporte em blend e glb."}
```

### `blender_plan_from_prompt(project_id, prompt)`
Usa OpenRouter para retornar um plano validado sem executar. Revise `operation`, `parameters` e `exports` antes de executar.

### `blender_discover_operators(project_id, query="mesh", limit=80)`
Enfileira descoberta de operadores e propriedades RNA na versão do Blender do worker.
- `query`: filtro textual, por exemplo `mesh`, `object`, `transform`, `material`, `render`, `anim`.
- `limit`: de 1 a 300.
- Consulte o job com `blender_get_job` até concluir.

Exemplo:
```json
{"project_id":"catalog","query":"mesh.primitive_uv_sphere_add","limit":20}
```

A descoberta não garante execução: alguns operadores exigem janela, viewport, GPU, add-ons ou contexto interativo.

### `blender_execute_operator(project_id, operator, properties={})`
Solicita execução de operador bpy permitido. Descubra-o primeiro e use os nomes exatos das propriedades RNA.
```json
{
  "project_id":"operator-demo",
  "operator":"bpy.ops.mesh.primitive_uv_sphere_add",
  "properties":{"segments":48,"ring_count":24,"radius":1.5,"location":[0,0,2]}
}
```
As categorias `wm`, `script`, `preferences`, `console` e `file` são bloqueadas. A allow-list/contexto Headless ainda se aplica. Não use como executor de código arbitrário.

## 4. API HTTP

Todas as rotas `/v1` exigem `Authorization: Bearer API_SECRET`.

| Método e rota | Uso |
|---|---|
| `GET /health` | Health check público da API. |
| `GET /v1/blender/capabilities` | Lista capacidades declaradas. |
| `POST /v1/jobs` | Cria job declarativo. |
| `GET /v1/jobs/{job_id}` | Consulta job. |
| `POST /v1/ai/plan` | Planeja com OpenRouter sem executar. |
| `POST /v1/ai/jobs` | Planeja e enfileira com OpenRouter. |
| `GET /v1/assets/{job_id}/{filename}` | Baixa arquivo do storage local. |

### Exemplo POST /v1/jobs

```json
{
  "project_id":"demo",
  "operation":"create_model",
  "parameters":{
    "name":"BlueCrate",
    "primitive":"cube",
    "size":2,
    "location":[0,0,1],
    "rotation":[0,0,0],
    "scale":[1,1,1],
    "material":{"name":"Blue","color":[0.08,0.25,0.85,1]},
    "modifiers":[
      {"type":"BEVEL","width":0.04,"segments":3},
      {"type":"WEIGHTED_NORMAL"}
    ]
  },
  "exports":["blend","glb"]
}
```

Operações aceitas pelo schema: `create_model`, `inspect_scene`, `discover_operators`, `execute_operator`.
Chaves de `parameters`: `name`, `primitive`, `size`, `location`, `rotation`, `scale`, `material`, `modifiers`, `render`, `query`, `limit`, `operator`, `properties`. Chaves desconhecidas são rejeitadas.

### Parâmetros declarativos

- Transformações: `location` e `scale` são vetores XYZ; `rotation` usa radianos.
- Material: `{"name":"Steel","color":[0.25,0.28,0.32,1]}` (RGBA float; cor básica, não um pipeline PBR completo).
- Modificadores tratados: `BEVEL` (`width`, `segments`), `SUBSURF` (`levels`), `DECIMATE` (`ratio`), `SOLIDIFY`, `WEIGHTED_NORMAL`.

## 5. Exemplos de fluxos de agente

### Criar asset
1. `blender_capabilities()`
2. `blender_create_model(...)`
3. Guardar `job_id`.
4. `blender_get_job(job_id)` até estado terminal.
5. Retornar assets e metadados.

### Descobrir e executar operador
1. `blender_discover_operators(project_id, query, limit)`.
2. Aguardar com `blender_get_job`.
3. Conferir identificador e propriedades.
4. `blender_execute_operator(project_id, operator, properties)`.
5. Aguardar resultado.

### Prompt com OpenRouter
1. Confirmar `OPENROUTER_API_KEY`.
2. Chamar `blender_plan_from_prompt`.
3. Revisar o plano.
4. Chamar `blender_generate_from_prompt` para enfileirar.
5. Acompanhar o job.

### Recuperar de erro
1. Ler `error` em `blender_get_job`.
2. Corrigir schema/valor ou escolher operador compatível com Headless.
3. Se timeout, reduzir a carga ou ajustar conscientemente o timeout do worker.
4. Não repetir jobs cegamente: operações repetidas podem duplicar objetos.

## 6. Capacidades implementadas versus planejadas

**Implementado nesta base:** API FastAPI, jobs assíncronos, worker Blender Headless, persistência de projeto conforme storage, primitivas, transformações básicas, cor de material, modificadores básicos, descoberta de operadores, execução genérica restrita, preview PNG em criação de modelo, exportação Blend/GLB/FBX/OBJ quando suportada pela build, MCP Streamable HTTP e planejamento OpenRouter restrito.

**Ainda requer desenvolvimento especializado:** sculpting, retopologia, UV/baking, texturas PBR, grafos Geometry Nodes completos, rigging automático, animação avançada, física/simulações configuráveis, gestão segura de add-ons, cobertura de todos os operadores da UI, multi-tenant/quota de produção. Não anuncie esses itens como prontos antes dos testes e implementação.

## 7. Segurança

- Não exponha `/internal/worker/*` publicamente sem proteção de rede.
- Use tokens fortes e independentes para API, MCP e worker.
- Não entregue `WORKER_TOKEN` a agentes.
- Em produção, HTTPS, rate limits, quotas, limites de CPU/RAM/tempo e logs são obrigatórios.
- Não monte Docker socket, diretórios pessoais ou credenciais cloud nos workers.
- Não habilite execução de Python arbitrário vindo de prompts.
- Trate .blend, texturas e arquivos enviados como entrada não confiável.

## 8. Referência rápida

| Objetivo | Ferramenta |
|---|---|
| Ver recursos | `blender_capabilities` |
| Criar primitiva | `blender_create_model` |
| Consultar job | `blender_get_job` |
| Planejar prompt | `blender_plan_from_prompt` |
| Planejar e executar prompt | `blender_generate_from_prompt` |
| Descobrir operadores | `blender_discover_operators` |
| Executar operador permitido | `blender_execute_operator` |
| Criar job avançado | `POST /v1/jobs` |
| Baixar asset local | `GET /v1/assets/{job_id}/{filename}` |
