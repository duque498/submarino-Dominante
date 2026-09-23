import { useEffect, useRef, useState } from 'react'

/**
 * Cronômetro de palco.
 *
 * Genérico de propósito: o 2A usa no aquecimento da Educação Física ("marchar
 * por vinte segundos"), mas ele não sabe disso. Recebe os segundos e conta.
 *
 * A IA NÃO fala aqui, e isso é uma decisão de cena: quem conduz o exercício é
 * o aluno na frente da plateia. Uma voz de bordo contando junto tiraria dele a
 * única coisa que ele tem pra dirigir — o tempo.
 *
 * Fecha sozinho três segundos depois de zerar. Sem isso, o operador teria que
 * lembrar de apertar `Esc` no meio de um exercício em que está contando gente.
 */

type Props = {
  /** Duração em segundos. Vem do argumento do comando (`cronometro 20`). */
  segundos: number
  /** Ping de sonar: um a cada cinco segundos, dois no fim. */
  aoPing?: () => void
  aoFechar?: () => void
}

/** De quantos em quantos segundos o sonar marca o tempo. */
const PASSO_PING = 5
/** Quanto o painel fica na tela depois de zerar. */
const MS_APOS_ZERAR = 3000

export function PainelCronometro({ segundos, aoPing, aoFechar }: Props) {
  const [restante, setRestante] = useState(segundos)
  const refPing = useRef(aoPing)
  const refFechar = useRef(aoFechar)
  refPing.current = aoPing
  refFechar.current = aoFechar

  useEffect(() => {
    setRestante(segundos)
    const inicio = performance.now()
    const pendentes: number[] = []
    let ultimoMarcado = segundos

    const timer = window.setInterval(() => {
      const passado = (performance.now() - inicio) / 1000
      const agora = Math.max(0, Math.ceil(segundos - passado))
      if (agora === ultimoMarcado) return
      ultimoMarcado = agora
      setRestante(agora)

      if (agora === 0) {
        window.clearInterval(timer)
        // Dois pings: um só se confundiria com as marcações do caminho.
        refPing.current?.()
        pendentes.push(window.setTimeout(() => refPing.current?.(), 220))
        pendentes.push(window.setTimeout(() => refFechar.current?.(), MS_APOS_ZERAR))
        return
      }
      if (agora % PASSO_PING === 0) refPing.current?.()
    }, 100)

    // Os relógios de saída TÊM que morrer com o painel.
    //
    // Sem isto, o `aoFechar` agendado sobrevivia à desmontagem e fechava o que
    // estivesse aberto três segundos depois: medido, abrir o enigma logo depois
    // de um cronômetro zerado fechava o enigma sozinho.
    return () => {
      window.clearInterval(timer)
      pendentes.forEach((id) => window.clearTimeout(id))
    }
  }, [segundos])

  const fracao = segundos > 0 ? restante / segundos : 0

  return (
    <div className={'crono' + (restante === 0 ? ' crono--fim' : '')}>
      <p className="crono__numero">{restante}</p>
      <p className="crono__unidade">{restante === 0 ? 'tempo encerrado' : 'segundos'}</p>
      <span className="crono__trilho">
        <span className="crono__nivel" style={{ width: `${fracao * 100}%` }} />
      </span>
    </div>
  )
}
