import { useEffect, useState } from 'react'

type Props = {
  linhas: string[]
  /**
   * Duração do áudio da cena. A digitação é esticada pra terminar junto com a
   * fala; sem áudio (ou com duração desconhecida) cai numa velocidade fixa.
   */
  duracaoMs?: number | null
  /** Mostra tudo de uma vez (usado quando o operador pula a fala). */
  completo?: boolean
}

const MS_POR_CARACTERE_PADRAO = 45
const MS_POR_CARACTERE_MIN = 10
const MS_POR_CARACTERE_MAX = 90
/** Acima disso a fala é longa demais pro corpo gigante e o texto encolhe. */
const LIMITE_TEXTO_DENSO = 220

export function Digitacao({ linhas, duracaoMs, completo = false }: Props) {
  const texto = linhas.join('\n')
  const [visiveis, setVisiveis] = useState(0)

  useEffect(() => {
    if (completo) {
      setVisiveis(texto.length)
      return
    }

    setVisiveis(0)
    if (texto.length === 0) return

    const bruto = duracaoMs ? duracaoMs / texto.length : MS_POR_CARACTERE_PADRAO
    const intervalo = Math.min(
      MS_POR_CARACTERE_MAX,
      Math.max(MS_POR_CARACTERE_MIN, bruto),
    )

    const timer = setInterval(() => {
      setVisiveis((atual) => {
        if (atual >= texto.length) {
          clearInterval(timer)
          return atual
        }
        return atual + 1
      })
    }, intervalo)

    return () => clearInterval(timer)
  }, [texto, duracaoMs, completo])

  const digitado = texto.slice(0, visiveis)
  const partes = digitado.split('\n')
  const terminou = visiveis >= texto.length
  const denso = texto.length > LIMITE_TEXTO_DENSO

  return (
    <ul className={denso ? 'linhas linhas--denso' : 'linhas'}>
      {partes.map((parte, indice) => (
        <li key={indice}>
          {parte}
          {!terminou && indice === partes.length - 1 && <span className="cursor" />}
        </li>
      ))}
    </ul>
  )
}
