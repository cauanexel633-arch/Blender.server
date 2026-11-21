import { z } from "zod";
import { publicarExportacao, LIMITE_ARQUIVO_BYTES } from "../armazenamento/arquivos.js";
import { baixarPrevia, buscarSons, obterSom } from "../audio/freesound.js";
import { definir, texto, type Conteudo } from "./tipos.js";

export const ferramentasAudio = [
  definir({
    nome: "buscar_audio",
    titulo: "Buscar áudio livre",
    descricao:
      "Busca sons e efeitos sonoros na Freesound, uma biblioteca com licenças livres (Creative Commons). Devolve título, autor, licença, duração, página do som e um link de prévia para ouvir. " +
      "Por padrão mostra só sons com uso comercial permitido. Não baixa nada: para baixar, use baixar_audio depois que o usuário escolher e confirmar. " +
      "A IA não consegue ouvir o som; descreva ao usuário pelas tags, título e duração e deixe a escuta com ele, pelo link de prévia. " +
      "Cada som traz previa_url, titulo, autor, licenca e pagina: guarde esses campos para passar a baixar_audio.",
    somenteLeitura: true,
    schema: {
      consulta: z.string().min(2).max(200).describe("Ex.: 'explosão curta', 'passos de madeira', 'chuva na janela'"),
      quantidade: z.number().int().min(1).max(10).default(5),
      duracao_max_seg: z.number().min(0.5).max(600).optional().describe("Descarta sons mais longos que isso"),
      apenas_uso_comercial: z.boolean().default(true).describe("Exclui licenças não comerciais (NC)"),
    },
    executar: async (a) => {
      const sons = await buscarSons({
        consulta: a.consulta,
        quantidade: a.quantidade,
        duracao_max_seg: a.duracao_max_seg,
        apenas_uso_comercial: a.apenas_uso_comercial,
      });
      return texto({
        encontrados: sons.length,
        sons,
        aviso: "Confirme com o usuário qual som quer, mostre título, autor e licença, e só então use baixar_audio com confirmar=true.",
      });
    },
  }),

  definir({
    nome: "baixar_audio",
    titulo: "Baixar áudio livre",
    descricao:
      "Baixa a prévia MP3 de um som da Freesound (id devolvido por buscar_audio) e guarda com link temporário. " +
      "Só use depois que o usuário escolher o som E confirmar que quer baixar. Exige confirmar=true. " +
      "Para ser mais rápido, passe também previa_url, titulo, autor, licenca e pagina exatamente como vieram de buscar_audio. " +
      "A qualidade é a da prévia (MP3 de 192 kbps ou menos), não o arquivo original. Devolve título, autor, licença e o texto de atribuição, que deve ser mantido quando o som for usado.",
    schema: {
      id: z.number().int().positive().describe("ID do som (campo 'id' de buscar_audio)"),
      previa_url: z
        .string()
        .url()
        .optional()
        .describe("Opcional, mais rápido: link 'previa_url' de buscar_audio. Com os campos de atribuição abaixo, não precisa de nova consulta"),
      titulo: z.string().max(200).optional().describe("Título vindo de buscar_audio (usado com previa_url)"),
      autor: z.string().max(100).optional().describe("Autor vindo de buscar_audio (usado com previa_url)"),
      licenca: z.string().max(100).optional().describe("Licença vinda de buscar_audio (usado com previa_url)"),
      pagina: z.string().max(300).optional().describe("Página do som vinda de buscar_audio (usado com previa_url)"),
      duracao_seg: z.number().min(0).optional(),
      uso_comercial: z.boolean().optional(),
      confirmar: z
        .boolean()
        .refine((v) => v === true, { message: "Use true para confirmar" })
        .describe("Deve ser exatamente true, e só depois da confirmação do usuário"),
    },
    executar: async (a): Promise<Conteudo[]> => {
      const completo = a.previa_url && a.titulo && a.autor && a.licenca && a.pagina;
      const inicio = Date.now();
      // Com os dados de buscar_audio, pula a consulta de metadados: uma chamada a menos ao Freesound.
      const som = completo
        ? {
            id: a.id,
            titulo: a.titulo!,
            autor: a.autor!,
            licenca: a.licenca!,
            uso_comercial: a.uso_comercial ?? false,
            duracao_seg: a.duracao_seg ?? 0,
            pagina: a.pagina!,
            previa_url: a.previa_url!,
            tags: [] as string[],
          }
        : await obterSom(a.id);
      if (!som.previa_url) throw new Error("Esse som não tem prévia disponível para download");
      const dados = await baixarPrevia(som.previa_url);
      console.log(JSON.stringify({ evento: "baixar_audio", id: a.id, usou_atalho: Boolean(completo), ms: Date.now() - inicio }));
      if (dados.length > LIMITE_ARQUIVO_BYTES) throw new Error("Arquivo grande demais");

      const atribuicao = `"${som.titulo}" por ${som.autor} (${som.licenca}), Freesound: ${som.pagina}`;
      const relatorio = {
        id: som.id,
        titulo: som.titulo,
        autor: som.autor,
        licenca: som.licenca,
        uso_comercial: som.uso_comercial,
        duracao_seg: som.duracao_seg,
        pagina: som.pagina,
        atribuicao,
        bytes: dados.length,
      };

      const link = await publicarExportacao(`freesound-${som.id}.mp3`, dados, "audio/mpeg");
      if (link) {
        return texto({ ...relatorio, download_url: link.url, link_expira_em: link.expira_em });
      }
      return [
        { type: "text", text: JSON.stringify({ ...relatorio, aviso: "Armazenamento não configurado: arquivo devolvido inline" }, null, 2) },
        {
          type: "resource",
          resource: { uri: `freesound-${som.id}.mp3`, mimeType: "audio/mpeg", blob: dados.toString("base64") },
        },
      ];
    },
  }),
];
