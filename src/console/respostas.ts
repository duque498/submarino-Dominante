/**
 * Respostas fixas da IA no console, centralizadas aqui por um motivo prático:
 * o scripts/gerar_audios.py lê este arquivo pra gerar o mp3 de cada uma.
 *
 * Formato obrigatório: `chave: 'texto em aspas simples',` — uma por linha,
 * sem interpolação. O script extrai por expressão regular, então qualquer
 * criatividade de sintaxe aqui quebra a geração de áudio.
 *
 * Respostas com parte variável (nome de forma, de painel) ficam em MOLDES e
 * não têm áudio: aparecem só na legenda.
 */
export const RESPOSTAS = {
  desconhecido: 'Comando não reconhecido pelo sistema de bordo.',
  esfera: 'Retornando à forma padrão.',
  paineisEncerrados: 'Painéis encerrados.',
  ajuda: 'Listando comandos no log de bordo.',
  avancando: 'Avançando.',
  retornando: 'Retornando.',
  paneAlerta: 'ALERTA. FALHA NO SISTEMA DE BORDO.',
  reiniciado: '...sistema reiniciado.',
} as const

export type ChaveResposta = keyof typeof RESPOSTAS

/** Caminho do mp3 de uma resposta fixa. Gerado pelo script de áudio. */
export function audioDaResposta(chave: ChaveResposta): string {
  return `./audio/sistema/${chave}.mp3`
}

/** Respostas com parte variável — só legenda, sem áudio pré-gerado. */
export const MOLDES = {
  forma: (nome: string) => `Assumindo forma: ${nome.toUpperCase()}.`,
  painel: (nome: string) => `Abrindo ${nome.toUpperCase()}.`,
  ficha: (nome: string) => `Abrindo ficha: ${nome.toUpperCase()}.`,
  navegando: (alvo: string) => `Navegando para ${alvo}.`,
  profundidade: (metros: number) => `Ajustando profundidade para ${metros} metros.`,
  fichaSemArgumento: (disponiveis: string) =>
    `Informe o que catalogar. Disponíveis: ${disponiveis}.`,
}
