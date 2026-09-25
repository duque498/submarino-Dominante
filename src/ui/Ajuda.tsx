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
   * Com o canal de pé, QUAL transporte está valendo (`realtime`,
   * `rest · 420ms`). Com o canal fora, por que ele não subiu
   * (`CHANNEL_ERROR: ...`). Cru, dos dois jeitos.
   *
   * Fica só AQUI, e não na cena de espera, porque a cena de espera está no
   * projetor: "CHANNEL_ERROR: ..." na frente da plateia não ajuda ninguém. O H
   * é a tela particular do operador, e é nela que um recado técnico serve.
   */
  motivoRemoto?: string
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
  motivoRemoto,
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
          A cor segue o status e não o texto: com o canal de pé esta linha
          informa (discreta), com o canal fora ela avisa (âmbar). `rest` de pé
          é uma informação, não um problema — e não pode parecer alarme no
          meio da apresentação. */}
      {motivoRemoto && (
        <p
          className={
            'ajuda__motivo' + (remoto === 'ligado' ? ' ajuda__motivo--calmo' : '')
          }
        >
          canal: {motivoRemoto}
        </p>
      )}
      <p className="ajuda__estado">
        cena: <strong>{cena}</strong> · forma: <strong>{forma}</strong> · escala:{' '}
        <strong>{Math.round(escala * 100)}%</strong>
      </p>
    </div>
  )
}
