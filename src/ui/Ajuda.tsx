type Props = {
  /** Nome e posição da cena atual, pro operador se localizar no roteiro. */
  cena: string
  forma: string
  escala: number
}

const ATALHOS: Array<[string, string]> = [
  ['→ / Enter', 'próxima cena'],
  ['←', 'cena anterior'],
  ['Espaço', 'corta o áudio e avança'],
  ['1 2 3 4', 'marca a resposta do quiz'],
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
  ['Esc', 'fecha o console ou o painel aberto'],
  ['Tab', 'completa o comando no console'],
  ['↑ / ↓', 'histórico de comandos'],
  ['H', 'mostra ou esconde esta ajuda'],
]

/** Overlay discreto de atalhos. Fica sempre por cima, mas sem tampar a cena. */
export function Ajuda({ cena, forma, escala }: Props) {
  return (
    <div className="ajuda">
      <h2 className="ajuda__titulo">atalhos do operador</h2>
      <dl className="ajuda__lista">
        {ATALHOS.map(([tecla, acao]) => (
          <div className="ajuda__item" key={tecla}>
            <dt>{tecla}</dt>
            <dd>{acao}</dd>
          </div>
        ))}
      </dl>
      <p className="ajuda__estado">
        cena: <strong>{cena}</strong> · forma: <strong>{forma}</strong> · escala:{' '}
        <strong>{Math.round(escala * 100)}%</strong>
      </p>
    </div>
  )
}
