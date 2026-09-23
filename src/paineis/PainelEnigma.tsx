import { useEffect, useRef, useState } from 'react'

/**
 * O Scape Room da Educação Física.
 *
 * Quatro dicas sobre quanto tempo um objeto leva pra se decompor no mar. A
 * plateia — ou o grupo — tem trinta segundos pra casar cada dica com o objeto
 * FÍSICO que os alunos trouxeram.
 *
 * O nome do objeto não aparece em lugar nenhum da tela. A resposta é dos
 * alunos, dita por eles, com o objeto na mão: pôr "garrafa PET" no painel
 * entregaria o jogo pra quem está lendo. Os nomes ficam só no overlay `H`, que
 * é do operador.
 *
 * E o cronômetro não começa junto com o painel: começa no `Enter`, depois que
 * a Pessoa 4 terminar de ler as dicas. Um relógio correndo por cima de alguém
 * lendo é pressa, não tensão.
 */

export type DicaEnigma = { numero: number; texto: string }

/**
 * As dicas, no texto dos alunos.
 *
 * Moram aqui e não no JSON porque não são fala da IA: são o material do jogo,
 * e a cena `ef` não tem nenhuma linha de roteiro — os quatro alunos conduzem
 * tudo, inclusive o resultado.
 */
export const DICAS: DicaEnigma[] = [
  { numero: 1, texto: 'Esse objeto demora de 400 a 600 anos para se decompor' },
  { numero: 2, texto: 'Esse objeto demora de 200 a 450 anos para se decompor' },
  { numero: 3, texto: 'Esse objeto demora cerca de 400 anos para se decompor' },
  { numero: 4, texto: 'Esse objeto demora de 100 a 300 anos para se decompor' },
]

/**
 * O que cada dica é, pro operador.
 *
 * Só aparece no overlay `H`. NUNCA na tela da plateia.
 */
export const OBJETOS_ENIGMA = ['garrafa PET', 'copo plástico', 'isopor', 'pilha']

const SEGUNDOS = 30

type Props = {
  aoPing?: () => void
  aoFechar?: () => void
  /**
   * Abre e fecha o overlay `H`.
   *
   * O painel captura o teclado, e sem repassar esta tecla o operador perdia o
   * `H` exatamente na cena em que ele mais precisa dele: é lá que estão as
   * respostas de cada dica, e ele decide em segundos, com a sala falando.
   */
  aoAjuda?: () => void
}

export function PainelEnigma({ aoPing, aoFechar, aoAjuda }: Props) {
  const [reveladas, setReveladas] = useState<number[]>([])
  const [restante, setRestante] = useState<number | null>(null)
  const refPing = useRef(aoPing)
  const refFechar = useRef(aoFechar)
  const refAjuda = useRef(aoAjuda)
  const refRodando = useRef(false)
  refPing.current = aoPing
  refFechar.current = aoFechar
  refAjuda.current = aoAjuda

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        refFechar.current?.()
        return
      }
      if (evento.key >= '1' && evento.key <= '4') {
        evento.preventDefault()
        const n = Number(evento.key)
        setReveladas((atual) => (atual.includes(n) ? atual : [...atual, n]))
        refPing.current?.()
        return
      }
      if (evento.key.toLowerCase() === 'h') {
        evento.preventDefault()
        refAjuda.current?.()
        return
      }
      if (evento.key === 'Enter' && !refRodando.current) {
        evento.preventDefault()
        refRodando.current = true
        setRestante(SEGUNDOS)
      }
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [])

  // O relógio só existe depois do Enter.
  useEffect(() => {
    if (restante === null) return
    const inicio = performance.now()
    let ultimo = SEGUNDOS
    const timer = window.setInterval(() => {
      const agora = Math.max(0, Math.ceil(SEGUNDOS - (performance.now() - inicio) / 1000))
      if (agora === ultimo) return
      ultimo = agora
      setRestante(agora)
      if (agora === 0) {
        window.clearInterval(timer)
        refPing.current?.()
        window.setTimeout(() => refPing.current?.(), 220)
      } else if (agora % 10 === 0) {
        refPing.current?.()
      }
    }, 100)
    return () => window.clearInterval(timer)
    // Só o primeiro Enter arma o relógio; os seguintes são ignorados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante !== null])

  const encerrado = restante === 0

  return (
    <div className={'enigma' + (encerrado ? ' enigma--encerrado' : '')}>
      <ol className="enigma__slots">
        {DICAS.map((dica) => {
          const aberta = reveladas.includes(dica.numero)
          return (
            <li
              key={dica.numero}
              className={'enigma__slot' + (aberta ? ' enigma__slot--cheio' : '')}
            >
              <span className="enigma__numero">{dica.numero}</span>
              <span className="enigma__texto">
                {aberta ? dica.texto : '— — —'}
              </span>
            </li>
          )
        })}
      </ol>
      <footer className="enigma__rodape">
        {restante === null ? (
          <span className="enigma__dica">enter começa os 30 segundos · 1–4 revelam as dicas</span>
        ) : encerrado ? (
          <span className="enigma__encerrado">TEMPO ENCERRADO</span>
        ) : (
          <span className="enigma__relogio">{restante}</span>
        )}
      </footer>
    </div>
  )
}
