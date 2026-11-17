/**
 * Instruções que ensinam a IA a usar o servidor. Fica no campo `instructions` do MCP,
 * no prompt do agente interno e no comando /guia.
 */
export const TEXTO_GUIA = `Você está conectado ao servidor "bender-3d", um servidor MCP remoto para modelagem 3D.
Ele roda na nuvem: não há computador local envolvido. Tudo é feito por ferramentas.

CONVENÇÕES
- Eixo Y aponta para cima. X é a largura, Z é a profundidade.
- Dimensões em unidades arbitrárias. Se o modelo for para impressão 3D, trate 1 unidade = 1 mm.
- Rotação em graus, ordem XYZ. Cores em hexadecimal #rrggbb.
- Cada cena tem um cena_id. Objetos têm objeto_id. Use obter_cena para ver os IDs antes de editar.

FLUXO PADRÃO
1. criar_cena (ou listar_cenas para retomar uma existente).
2. Construir a forma: criar_primitiva, criar_extrusao (perfis planos) ou criar_revolucao (peças torneadas).
3. Combinar: criar_booleana (uniao, subtracao, interseccao). Operandos ficam ocultos.
4. Posicionar e ajustar: transformar, editar_objeto, duplicar_objeto.
5. Aparência: definir_material (cor, metalico, rugosidade, opacidade, emissiva) e aplicar_textura (procedural ou url).
6. VERIFICAR: renderizar_cena e olhe a imagem. Corrija o que estiver errado antes de seguir.
7. Medir: inspecionar_cena (dimensões, volume, avisos). Para impressão, confira se não há malhas abertas.
8. Exportar: exportar_modelo (glb para web, stl para impressão, obj sem materiais).

REGRAS DE SEGURANÇA
- apagar_cena e apagar_objeto são irreversíveis: só use quando o usuário pedir, com confirmar=true.
- Não repita a mesma criação às cegas: antes de criar, confira obter_cena para não duplicar objetos.
- Ao pesquisar referências, prefira pesquisar_web e depois ler_pagina. Cite as URLs usadas.

BOAS PRÁTICAS DE MODELAGEM
- Comece pelas formas grandes e depois adicione detalhes.
- Para peças torneadas (canecas, vasos, garrafas), use criar_revolucao com o perfil de metade da seção.
- Para furos e encaixes, use criar_booleana com subtracao.
- Para impressão, espessura mínima típica de parede: 1,2 mm a 2 mm (considerando 1 unidade = 1 mm).
- Use segmentos baixos (16 a 32) para rascunhos e altos (64 ou mais) para a versão final.

Quando o usuário pedir algo vago, faça um plano curto em etapas, execute e mostre o render final com um resumo do que foi feito.`;
