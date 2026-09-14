import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import roteiro2a from './roteiros/2a.json'
import roteiro2b from './roteiros/2b.json'
import roteiro3a from './roteiros/3a.json'
import type { Cena, Roteiro, Turma } from './roteiros/tipos'
import { TURMAS } from './roteiros/tipos'
import { validarRoteiro } from './roteiros/validar'
import { AudioEngine } from './player/AudioEngine'
import { Player } from './player/Player'
import { useTeclado } from './player/useTeclado'
import { Hud } from './ui/Hud'

const ROTEIROS: Record<Turma, unknown> = {
  '2A': roteiro2a,
  '2B': roteiro2b,
  '3A': roteiro3a,
}

/** Lê ?turma=2A da URL. Cada Chromebook abre o index.html com a sua turma. */
function turmaDaUrl(): Turma | null {
  const bruto = new URLSearchParams(window.location.search).get('turma')
  if (!bruto) return null
  const normalizada = bruto.trim().toUpperCase() as Turma
  return TURMAS.includes(normalizada) ? normalizada : null
}

/** Todos os mp3 citados no roteiro, pro preload depois do gesto inicial. */
function audiosDoRoteiro(roteiro: Roteiro): string[] {
  const urls: string[] = []
  for (const cena of roteiro.cenas as Cena[]) {
    switch (cena.tipo) {
      case 'fala':
      case 'transicao':
        urls.push(cena.audio)
        break
      case 'apresentacao':
        if (cena.audio) urls.push(cena.audio)
        break
      case 'quiz':
        urls.push(cena.audio.pergunta, cena.audio.acerto, cena.audio.erro)
        break
      case 'vf':
        urls.push(cena.audio.afirmacao, cena.audio.acerto, cena.audio.erro)
        break
      case 'pane':
        urls.push(cena.audio.entrada, cena.audio.retorno)
        break
    }
  }
  return urls
}

export default function App() {
  const [turma, setTurma] = useState<Turma | null>(turmaDaUrl)
  const [ativado, setAtivado] = useState(false)
  const [carregando, setCarregando] = useState(false)
  // Uma instância só pra toda a sessão: o desbloqueio do áudio mora nela.
  const engine = useRef(new AudioEngine()).current

  // Valida o roteiro assim que a turma é escolhida.
  const resultado = useMemo(() => {
    if (!turma) return null
    const bruto = ROTEIROS[turma]
    const problemas = validarRoteiro(bruto)
    return problemas.length > 0
      ? { problemas }
      : { roteiro: bruto as Roteiro, problemas: [] as string[] }
  }, [turma])

  const ativar = useCallback(async () => {
    if (!resultado?.roteiro || carregando) return
    setCarregando(true)
    await engine.desbloquear()
    const audios = audiosDoRoteiro(resultado.roteiro)
    await engine.preload([...audios, ...AudioEngine.urlsSfx()])
    // Diagnóstico: diz de cara se o audios.js foi encontrado (camada A, com
    // nível de áudio real) ou se a apresentação vai rodar na camada B.
    const camadaA = audios.filter((url) => engine.camadaDe(url) === 'A').length
    console.info(
      `[audio] camada A (nível real) em ${camadaA}/${audios.length} arquivos; ` +
        `o resto usa a camada B (envelope sintético).`,
    )
    setAtivado(true)
  }, [resultado, carregando, engine])

  if (!turma) return <TelaSelecao aoEscolher={setTurma} />

  if (resultado && resultado.problemas.length > 0) {
    return <TelaErro turma={turma} problemas={resultado.problemas} />
  }

  if (!ativado) return <TelaAtivacao carregando={carregando} aoAtivar={ativar} />

  return <Player roteiro={resultado!.roteiro!} engine={engine} />
}

/** Sem ?turma= na URL: o operador escolhe a turma no teclado (1, 2, 3). */
function TelaSelecao({ aoEscolher }: { aoEscolher: (turma: Turma) => void }) {
  useTeclado(
    useCallback(
      (acao) => {
        if (acao.tipo === 'alternativa' && acao.indice < TURMAS.length) {
          aoEscolher(TURMAS[acao.indice])
        }
      },
      [aoEscolher],
    ),
  )

  return (
    <Hud rota="AGUARDANDO" profundidade={0} sonar="STANDBY" rodapeEsquerda="submarino domi">
      <div className="centro">
        <p className="status">identifique a tripulação</p>
        <div className="opcoes">
          {TURMAS.map((turma, indice) => (
            <button key={turma} className="opcao" onClick={() => aoEscolher(turma)}>
              {indice + 1}. {turma}
            </button>
          ))}
        </div>
        <p className="dica">
          dica: abra o arquivo como index.html?turma=2A pra pular esta tela
        </p>
      </div>
    </Hud>
  )
}

/**
 * Gesto obrigatório: o Chrome só libera áudio depois de uma interação.
 * Qualquer tecla serve, então aqui o listener é cru — não passa pelo useTeclado.
 */
function TelaAtivacao({
  carregando,
  aoAtivar,
}: {
  carregando: boolean
  aoAtivar: () => void
}) {
  useEffect(() => {
    if (carregando) return
    const disparar = () => aoAtivar()
    window.addEventListener('keydown', disparar)
    window.addEventListener('pointerdown', disparar)
    return () => {
      window.removeEventListener('keydown', disparar)
      window.removeEventListener('pointerdown', disparar)
    }
  }, [carregando, aoAtivar])

  return (
    <Hud rota="STANDBY" profundidade={0} sonar="DESLIGADO" rodapeEsquerda="submarino domi">
      <div className="centro">
        {carregando ? (
          <p className="chamada">carregando sistemas de bordo...</p>
        ) : (
          <p className="chamada">
            pressione qualquer tecla
            <br />
            para ativar os sistemas de bordo
          </p>
        )}
      </div>
    </Hud>
  )
}

/** Erro de roteiro em português: quem edita o JSON não é programador. */
function TelaErro({ turma, problemas }: { turma: Turma; problemas: string[] }) {
  return (
    <div className="hud">
      <div className="hud__moldura">
        <div className="erro">
          <h1>Erro no roteiro da turma {turma}</h1>
          <p className="erro__ajuda">
            Corrija o arquivo src/roteiros/{turma.toLowerCase()}.json e gere o build de novo.
          </p>
          <ul>
            {problemas.map((problema, indice) => (
              <li key={indice}>{problema}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
