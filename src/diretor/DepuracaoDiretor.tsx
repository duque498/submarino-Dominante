import { useEffect, useState } from 'react'
import type { Diretor, EstadoDiretor } from './diretor'

/**
 * Rodapé de depuração: `?debugDiretor=1`.
 *
 * Existe porque a decisão do Diretor é invisível quando está certa — só se vê
 * o painel fechando, nunca o motivo. Aqui a decisão aparece escrita, quadro a
 * quadro, com o termo que abriu e a conta que falta pra encerrar:
 *
 *   `mapa · gatilho "Abrolhos" · próxima linha relaciona: não · fecha em 0.8s`
 *
 * Não vai pra feira: nada disto aparece sem a flag na URL.
 */

type Props = {
  diretor: Diretor
  cena: string
}

/** 8 Hz. Rápido o bastante pra ver a contagem andar, lento pra não pesar. */
const MS_AMOSTRA = 125

const seg = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** O `ate` do roteiro em português, pra o rodapé não mostrar JSON cru. */
function prazo(ate: EstadoDiretor['ate']): string {
  if (ate === 'fimCena') return 'fim da cena'
  if (ate === 'fimLinha') return 'fim da linha (+0,8s)'
  if (ate && typeof ate === 'object' && 'linha' in ate) return `fim da linha ${ate.linha}`
  if (ate && typeof ate === 'object' && 'segundos' in ate) return `${ate.segundos}s`
  return 'indefinido'
}

function frase(e: EstadoDiretor): string {
  if (e.suspenso) return 'suspenso — o operador assumiu até a próxima cena'
  if (!e.painel) return e.gatilhos ? 'nenhum painel aberto' : 'gatilhos desligados'

  const partes: string[] = [e.args ? `${e.painel} ${e.args}` : e.painel]

  partes.push(
    e.origem === 'gatilho'
      ? `aberto por gatilho "${e.termo}" na linha ${e.abertoNaLinha}`
      : `aberto pelo roteiro na linha ${e.abertoNaLinha}`,
  )

  if (e.origem === 'gatilho') {
    if (e.relacionaProxima === null) partes.push('próxima linha: ainda não avaliada')
    else if (e.relacionaProxima) partes.push(`próxima linha relaciona: sim ("${e.termoProxima}")`)
    else partes.push('próxima linha relaciona: não')
  }

  if (e.faltaPraSair !== null) partes.push(`despedindo, sai em ${seg(Math.max(0, e.faltaPraSair))}`)
  else if (e.faltaPraEncerrar !== null) {
    partes.push(`${e.motivo === 'prazo' ? 'prazo vencido' : 'fim de assunto'}: fecha em ${seg(Math.max(0, e.faltaPraEncerrar))}`)
  } else if (e.trocaNaProxima) partes.push('troca no início da próxima linha')
  else if (e.ate !== undefined) partes.push(`prazo do roteiro: ${prazo(e.ate)}`)
  else if (e.faltaPraTeto !== null) partes.push(`teto em ${seg(Math.max(0, e.faltaPraTeto))}`)
  else partes.push('sem prazo')

  return partes.join(' · ')
}

export function DepuracaoDiretor({ diretor, cena }: Props) {
  const [estado, setEstado] = useState<EstadoDiretor | null>(null)

  useEffect(() => {
    const ler = () => setEstado(diretor.estado(performance.now()))
    ler()
    const id = window.setInterval(ler, MS_AMOSTRA)
    return () => window.clearInterval(id)
  }, [diretor])

  if (!estado) return null
  return (
    <div className="depuracao-diretor">
      <span className="depuracao-diretor__marca">diretor</span>
      <span className="depuracao-diretor__cena">{cena}</span>
      <span className="depuracao-diretor__frase">{frase(estado)}</span>
      {estado.forma && <span className="depuracao-diretor__forma">orbe: {estado.forma}</span>}
    </div>
  )
}
