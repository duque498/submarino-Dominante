import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Cena, Roteiro } from '../roteiros/tipos'
import { Apresentacao } from '../cenas/Apresentacao'
import { Fala } from '../cenas/Fala'
import { Transicao } from '../cenas/Transicao'
import { Hud } from '../ui/Hud'
import type { AudioEngine } from './AudioEngine'
import { useTeclado } from './useTeclado'

/** Tempo estimado de leitura por linha, usado quando o mp3 não existe. */
const MS_POR_LINHA_SEM_AUDIO = 2500

/** Caminho do mp3 principal da cena, quando ela tem um. */
export function audioDaCena(cena: Cena): string | null {
  switch (cena.tipo) {
    case 'fala':
    case 'transicao':
      return cena.audio
    case 'apresentacao':
      return cena.audio ?? null
    case 'quiz':
      return cena.audio.pergunta
    case 'vf':
      return cena.audio.afirmacao
    case 'pane':
      return cena.audio.entrada
  }
}

/** Linhas de texto da cena — só pra estimar a duração sem áudio. */
function linhasDaCena(cena: Cena): string[] {
  switch (cena.tipo) {
    case 'fala':
    case 'transicao':
      return cena.tela.linhas
    case 'apresentacao':
      return [cena.tela.titulo]
    case 'quiz':
      return [cena.pergunta]
    case 'vf':
      return [cena.afirmacao]
    case 'pane':
      return cena.falaEntrada ?? cena.subsistemas
  }
}

function rotaDaCena(cena: Cena): string {
  switch (cena.tipo) {
    case 'transicao':
      return cena.destino.toUpperCase()
    case 'fala':
    case 'apresentacao':
      return (cena.tela.titulo ?? cena.id).toUpperCase()
    default:
      return cena.id.toUpperCase()
  }
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Props = { roteiro: Roteiro; engine: AudioEngine }

export function Player({ roteiro, engine }: Props) {
  // A pane fica no mesmo JSON, mas fora da ordem: ela é disparada pela tecla P
  // (Fase 2), então some da sequência linear que as setas percorrem.
  const sequencia = useMemo(
    () => roteiro.cenas.filter((cena) => cena.tipo !== 'pane'),
    [roteiro],
  )

  const [indice, setIndice] = useState(0)
  /** Digitação já mostrada por inteiro (fala terminou ou operador pulou). */
  const [completo, setCompleto] = useState(false)
  const [duracaoMs, setDuracaoMs] = useState<number | null>(null)

  const cena = sequencia[indice]

  const avancar = useCallback(() => {
    setIndice((atual) => Math.min(atual + 1, sequencia.length - 1))
  }, [sequencia.length])

  const voltar = useCallback(() => {
    setIndice((atual) => Math.max(atual - 1, 0))
  }, [])

  useTeclado(
    useCallback(
      (acao) => {
        switch (acao.tipo) {
          case 'avancar':
            avancar()
            break
          case 'voltar':
            voltar()
            break
          case 'pular':
            engine.pararVoz()
            avancar()
            break
          // quiz, vf, pane e overlay de ajuda entram na Fase 2.
          default:
            break
        }
      },
      [avancar, voltar, engine],
    ),
  )

  // Toca a cena atual: sfx, áudio, e avanço automático quando a fala termina.
  useEffect(() => {
    if (!cena) return

    let cancelado = false
    setCompleto(false)

    if (cena.sfx) engine.tocarSfx(cena.sfx)

    const url = audioDaCena(cena)
    const fallbackMs = Math.max(
      MS_POR_LINHA_SEM_AUDIO,
      linhasDaCena(cena).length * MS_POR_LINHA_SEM_AUDIO,
    )
    // Sincroniza a digitação com o áudio real; sem mp3, com o tempo estimado.
    setDuracaoMs(url ? (engine.duracaoMs(url) ?? fallbackMs) : null)

    const executar = async () => {
      const resultado = url ? await engine.tocar(url) : { tocou: false }
      if (cancelado) return

      // Degradação: sem mp3 a cena respeita o tempo estimado de leitura,
      // em vez de piscar e avançar na hora.
      if (!resultado.tocou) {
        await esperar(fallbackMs)
        if (cancelado) return
      }

      setCompleto(true)
      if (cena.avanco === 'auto') avancar()
    }

    void executar()

    return () => {
      cancelado = true
      engine.pararVoz()
    }
  }, [cena, engine, avancar])

  if (!cena) {
    return (
      <Hud rota="FIM" profundidade={0}>
        <p className="status">expedição encerrada</p>
      </Hud>
    )
  }

  return (
    <Hud
      rota={rotaDaCena(cena)}
      // Profundidade é decorativa: desce ao longo do roteiro.
      profundidade={120 + indice * 240}
      sonar={cena.tipo === 'transicao' ? 'VARRENDO' : 'ATIVO'}
      rodapeEsquerda={`turma ${roteiro.turma}`}
      rodapeDireita={`cena ${indice + 1}/${sequencia.length} · ${cena.id}`}
    >
      {conteudoDaCena(cena, duracaoMs, completo)}
    </Hud>
  )
}

function conteudoDaCena(cena: Cena, duracaoMs: number | null, completo: boolean) {
  switch (cena.tipo) {
    case 'fala':
      return <Fala cena={cena} duracaoMs={duracaoMs} completo={completo} />
    case 'apresentacao':
      return <Apresentacao cena={cena} />
    case 'transicao':
      return <Transicao cena={cena} duracaoMs={duracaoMs} completo={completo} />
    default:
      // quiz, vf e pane chegam na Fase 2.
      return <p className="pendente">cena "{cena.tipo}" — a implementar (Fase 2)</p>
  }
}
