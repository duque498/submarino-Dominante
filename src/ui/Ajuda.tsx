import { useEffect, useState } from 'react'
import type { InfoCanal } from '../remoto/protocolo'
import { OBJETOS_ENIGMA } from '../paineis/PainelEnigma'

type Props = {
  /** Nome e posição da cena atual, pro operador se localizar no roteiro. */
  cena: string
  forma: string
  escala: number
  /**
   * O que vale como acerto agora.
   *
   * Nas dinâmicas em que a plateia GRITA a resposta, quem julga é o operador —
   * e ele decide em dois segundos, no escuro, com a sala falando junto. A
   * lista precisa estar na tela dele, não no JSON.
   */
  aceitos?: { rotulo: string; termos: string[] } | null
  /** Código do controle pelo celular, e se o canal está de pé. */
  codigo?: string
  remoto?: 'ligado' | 'reconectando' | 'desligado'
  /**
   * Lê o estado do canal AGORA: transporte, desde quando, e o último erro de
   * cada lado. É getter porque a idade anda a cada segundo — só este overlay
   * olha pra ela, e só enquanto está aberto.
   *
   * Fica só AQUI, e não na cena de espera, porque a cena de espera está no
   * projetor: "CHANNEL_ERROR: ..." na frente da plateia não ajuda ninguém. O H
   * é a tela particular do operador, e é nela que um recado técnico serve.
   */
  lerInfoRemoto?: () => InfoCanal
}

/** "3m12s", "47s". Curto porque divide a linha com o resto. */
function idade(desde: number): string {
  const s = Math.max(0, Math.round((Date.now() - desde) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

/**
 * As duas linhas do canal no overlay H.
 *
 * Sempre as duas, mesmo quando está tudo bem: a de cima diz quem está
 * entregando e há quanto tempo, a de baixo diz o que o OUTRO transporte
 * respondeu da última vez. É a segunda que responde a pergunta do dia da
 * feira — "estou no rest, o realtime falhou por quê?" —, e ela só serve se
 * estiver lá antes de alguém precisar.
 *
 * O relógio de 1 s vive aqui dentro, e não no estado do app, porque este
 * componente só existe enquanto o H está aberto.
 */
function LinhasDoCanal({ ler, calmo }: { ler?: () => InfoCanal; calmo: boolean }) {
  const [, redesenhar] = useState(0)
  useEffect(() => {
    if (!ler) return
    const t = window.setInterval(() => redesenhar((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [ler])
  if (!ler) return null

  const info = ler()
  const ativo = info.transporte
    ? `${info.transporte}${info.ms ? ` ${info.ms}ms` : ''}`
    : 'abrindo...'
  // O erro do transporte ATIVO sobe pra primeira linha: se o que está
  // entregando é justamente o que quebrou, isso não pode ficar na linha de
  // baixo, que é a linha de quem não está em uso.
  const erroAtivo =
    info.transporte === 'rest'
      ? info.erroRest
      : info.transporte === 'realtime'
        ? info.erroRealtime
        : undefined
  // Embaixo, o último erro do OUTRO lado. Sem transporte de pé, os dois.
  const outros: Array<[string, string | undefined]> =
    info.transporte === 'rest'
      ? [['realtime', info.erroRealtime]]
      : info.transporte === 'realtime'
        ? [['rest', info.erroRest]]
        : [
            ['realtime', info.erroRealtime],
            ['rest', info.erroRest],
          ]

  const classe = 'ajuda__motivo' + (calmo ? ' ajuda__motivo--calmo' : '')
  return (
    <>
      <p className={classe}>
        canal: {ativo} · há {idade(info.desde)}
        {erroAtivo ? ` · ${erroAtivo}` : ''}
      </p>
      {outros.map(([nome, erro]) => (
        <p key={nome} className="ajuda__motivo ajuda__motivo--secundario">
          {nome}: {erro ?? '—'}
        </p>
      ))}
    </>
  )
}

const ATALHOS: Array<[string, string]> = [
  ['→ / Enter', 'próxima cena'],
  ['←', 'cena anterior'],
  ['Espaço', 'corta o áudio e avança'],
  ['1 2 3 4', 'marca a resposta do quiz'],
  ['1 2 3', 'no combate: o setor do contato'],
  ['1 2 3', 'no 2B: religa o subsistema do reparo'],
  ['1 2 3 4', 'no enigma: revela a dica daquele slot'],
  ['T', 'abre o cronômetro (digite os segundos)'],
  ['/ + enigma', 'o Scape Room da Educação Física'],
  ['Enter', 'na identificação e no hidrofone: a sala acertou'],
  ['X', 'na identificação e no hidrofone: revela sem acerto'],
  ['→ (no combate)', 'força a rodada a seguir'],
  ['V / F', 'marca verdadeiro ou falso'],
  ['P', 'dispara a pane de qualquer cena'],
  ['R', 'durante a pane: reinicia o sistema'],
  ['M / N', 'próxima / anterior forma do orbe'],
  ['/ + gatilhos off', 'a IA para de decidir sozinha'],
  ['O', 'volta o orbe pra esfera'],
  ['[ / ]', 'diminui / aumenta o orbe'],
  ['/', 'abre o console de comandos'],
  ['/ + som', 'testa os alto-falantes'],
  ['/ + ambiente', 'liga/desliga o som do mar'],
  ['/ + vozes', 'lista as vozes instaladas'],
  ['/ + voz 2', 'usa a voz número 2 da lista'],
  ['/ + voz mp3', 'usa a gravação em vez da voz do sistema'],
  ['/ + traco', 'o aluno desenha e a IA vira o desenho'],
  ['/ + espectro', 'as cores que a água apaga, por profundidade'],
  ['/ + zonas', 'as cinco zonas do oceano'],
  ['/ + eco', 'como o sonar mede distância'],
  ['Esc', 'fecha o console ou o painel aberto'],
  ['Tab', 'completa o comando no console'],
  ['↑ / ↓', 'histórico de comandos'],
  ['H', 'mostra ou esconde esta ajuda'],
]

/** Overlay discreto de atalhos. Fica sempre por cima, mas sem tampar a cena. */
const ESTADO_REMOTO: Record<string, string> = {
  ligado: 'conectado',
  reconectando: 'reconectando...',
  desligado: 'sem conexão — use o teclado',
}

export function Ajuda({
  cena,
  forma,
  escala,
  aceitos,
  codigo,
  remoto,
  lerInfoRemoto,
}: Props) {
  return (
    <div className="ajuda">
      {/* Só aqui, nunca na tela da plateia: pôr o nome do objeto no painel
          entregaria o jogo pra quem está lendo. A resposta é dos alunos, com o
          objeto na mão. */}
      {cena === 'ef' && (
        <div className="ajuda__aceitos">
          <h3>enigma · resposta de cada dica</h3>
          <p>
            {OBJETOS_ENIGMA.map((objeto, i) => `${i + 1}. ${objeto}`).join(' · ')}
          </p>
        </div>
      )}
      {aceitos && (
        <div className="ajuda__aceitos">
          <h3>vale como acerto · {aceitos.rotulo}</h3>
          <p>{aceitos.termos.join(' · ')}</p>
        </div>
      )}
      <h2 className="ajuda__titulo">atalhos do operador</h2>
      <dl className="ajuda__lista">
        {ATALHOS.map(([tecla, acao]) => (
          <div className="ajuda__item" key={tecla}>
            <dt>{tecla}</dt>
            <dd>{acao}</dd>
          </div>
        ))}
      </dl>
      {/* O código é consultado AQUI no meio da apresentação: a tela de
          ativação já saiu, e o operador pode precisar reconectar o celular ou
          entregá-lo pra outra pessoa. */}
      {codigo && (
        <p className="ajuda__estado">
          controle pelo celular · código <strong>{codigo}</strong> ·{' '}
          {ESTADO_REMOTO[remoto ?? 'desligado']}
        </p>
      )}
      {/* Sem tradução e sem enfeite: é o texto que o transporte devolveu.
          Traduzir aqui só apagaria a pista de que o operador precisa.
          A cor segue o status e não o texto: com o canal de pé estas linhas
          informam (discretas), com o canal fora elas avisam (âmbar). `rest`
          de pé é uma informação, não um problema — e não pode parecer alarme
          no meio da apresentação. */}
      <LinhasDoCanal ler={lerInfoRemoto} calmo={remoto === 'ligado'} />
      <p className="ajuda__estado">
        cena: <strong>{cena}</strong> · forma: <strong>{forma}</strong> · escala:{' '}
        <strong>{Math.round(escala * 100)}%</strong>
      </p>
    </div>
  )
}
