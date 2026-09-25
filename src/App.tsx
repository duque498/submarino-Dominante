import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import roteiro2a from './roteiros/2a.json'
import roteiro2b from './roteiros/2b.json'
import roteiro3a from './roteiros/3a.json'
import type { Cena, Roteiro, Turma } from './roteiros/tipos'
import { TURMAS } from './roteiros/tipos'
import { validarRoteiro } from './roteiros/validar'
import { carregarFormas } from './formas'
import { AUDIO } from './audio/config'
import { AudioEngine } from './player/AudioEngine'
import { Player } from './player/Player'
import { useTeclado } from './player/useTeclado'
import { gerarCodigo } from './remoto/config'
import { estadoDeAtivacao } from './remoto/estado'
import type { EstadoRemoto, StatusRemoto } from './remoto/protocolo'
import { useRemoto, type ConexaoRemota } from './remoto/useRemoto'
import { Hud } from './ui/Hud'
import { QTD_PONTOS } from './ui/Orbe'

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

/** Todas as formas citadas no roteiro, pra amostrar de uma vez no gesto inicial. */
function formasDoRoteiro(roteiro: Roteiro): string[] {
  return (roteiro.cenas as Cena[]).flatMap((cena) => cena.formas ?? [])
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
  /**
   * Código do controle remoto, sorteado UMA vez por carregamento da página.
   *
   * Em estado e não em módulo: assim ele aparece na cena de espera e no
   * overlay H com o mesmo valor que o canal usa, e recarregar a página troca
   * o código — que é o que invalida um celular que ficou pra trás.
   */
  const [codigo] = useState(gerarCodigo)
  /** Os mp3 da turma já estão prontos? É o que libera o → da cena de espera. */
  const [carregado, setCarregado] = useState(false)
  /** O navegador liberou o áudio. Publicado pro celular e mostrado no H. */
  const [audioDestravado, setAudioDestravado] = useState(false)
  /**
   * Passou da tela de ativação?
   *
   * São dois passos de propósito, e cada um resolve um problema diferente:
   * ATIVAR é o gesto que o Chrome exige pra liberar o som, e tem que ser
   * físico, nesta máquina; INICIAR é a ordem de começar a apresentação, e essa
   * pode vir do celular. Juntar os dois numa tecla só — como era antes — fazia
   * o operador não poder encostar no Chromebook sem acordar a IA.
   */
  const [ativado, setAtivado] = useState(false)
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

  /**
   * Houve ALGUM gesto físico nesta página?
   *
   * É a pergunta que o Chrome chama de "sticky activation", e é o que decide
   * se o áudio pode tocar. Em ref e não em estado porque a resposta precisa
   * estar certa DENTRO do mesmo evento em que é consultada — um estado do
   * React só chegaria no render seguinte.
   *
   * Aqui NÃO usamos `navigator.userActivation.hasBeenActive`, que seria a
   * resposta oficial do navegador: medido neste Chromium, ele já nasce `true`
   * numa página que ninguém tocou. Um falso positivo aqui custa a apresentação
   * inteira rodando muda e sem aviso; um falso negativo custa ao operador um
   * toque a mais na tela. Entre os dois, ficamos com o que observamos
   * diretamente — um evento confiável que chegou até esta página.
   */
  const refGestoFisico = useRef(false)
  const houveGestoFisico = useCallback(() => refGestoFisico.current, [])

  // Destravar o áudio virou invisível: acontece no primeiro gesto de verdade,
  // qualquer um, sem tela dedicada e sem pedir nada. Em CAPTURA porque este
  // listener precisa rodar antes do useTeclado — é ele que marca o gesto que a
  // cena de espera vai consultar no mesmo evento.
  useEffect(() => {
    if (audioDestravado) return
    const liberar = (evento: Event) => {
      // Evento fabricado por script (o `cmd` do celular) NÃO conta como gesto
      // do usuário pro Chrome. Se contasse aqui, o AudioContext ficaria
      // suspenso e a apresentação inteira rodaria muda, sem nenhum aviso.
      if (!evento.isTrusted) return
      refGestoFisico.current = true
      // Sai da tela de ativação AGORA, sem esperar o desbloqueio terminar: o
      // que o operador pediu foi passar de tela, e o áudio é assunto de bastidor.
      setAtivado(true)
      void engine.desbloquear().then(() => setAudioDestravado(true))
    }
    const gestos = ['keydown', 'pointerdown', 'click', 'touchstart'] as const
    for (const nome of gestos) {
      window.addEventListener(nome, liberar, { capture: true, passive: true })
    }
    return () => {
      for (const nome of gestos) {
        window.removeEventListener(nome, liberar, { capture: true })
      }
    }
  }, [audioDestravado, engine])

  // Preparar os áudios não precisa de gesto nenhum (baixar e decodificar são
  // livres; só TOCAR é que exige). Então isto roda no carregamento da página, e
  // quando o operador chega no → já está tudo pronto.
  const preparar = useCallback(async () => {
    if (!resultado?.roteiro) return
    const audios = audiosDoRoteiro(resultado.roteiro)
    // As silhuetas são amostradas aqui, não na hora de morfar: dez getImageData
    // no meio da apresentação seriam um engasgo visível.
    await Promise.all([
      engine.preload([...audios, ...AudioEngine.urlsSfx()]),
      carregarFormas(formasDoRoteiro(resultado.roteiro), QTD_PONTOS),
    ])
    // Diagnóstico: diz de cara se o audios.js foi encontrado (camada A, com
    // nível de áudio real) ou se a apresentação vai rodar na camada B.
    const camadaA = audios.filter((url) => engine.camadaDe(url) === 'A').length
    const cenasComAudio = new Set(audios.map((url) => url.split('/').pop())).size
    const comTempos = engine.contarTempos(resultado.roteiro.turma)
    const sfxProprio = AudioEngine.urlsSfx().filter((url) => engine.camadaDe(url) === 'A').length
    // O ganho da voz entra no diagnóstico porque ele é ajustável pela URL: se
    // alguém abrir com `?voz=0.3` e esquecer, a linha de ativação denuncia.
    const dbVoz = (20 * Math.log10(AUDIO.voz.ganho)).toFixed(1)
    console.info(
      `[audio] camada A em ${camadaA}/${audios.length} · ` +
        `tempos reais em ${comTempos}/${cenasComAudio} cenas · ` +
        `sfx ${sfxProprio > 0 ? 'de arquivo' : 'sintético'} · ` +
        `voz ${AUDIO.voz.ganho} (${dbVoz} dB)`,
    )
    setCarregado(true)
  }, [resultado, engine])

  useEffect(() => {
    void preparar()
  }, [preparar])

  // O receptor mora AQUI e não no Player de propósito: ele precisa estar no ar
  // antes de o Player montar, junto com o PIN que a cena de espera mostra. O
  // Player, quando monta, só empresta a ele quem sabe ler a cena.
  const refLeitor = useRef<(() => EstadoRemoto | null) | null>(null)
  const refComandoRemoto = useRef<((texto: string) => void) | null>(null)

  const {
    status: statusRemoto,
    motivo: motivoRemoto,
    publicar: publicarRemoto,
  } = useRemoto({
    turma: turma ?? '',
    codigo,
    ativo: turma !== null,
    // Na tela de ativação o celular não manda tecla nenhuma: o gesto que libera
    // o áudio tem que ser físico, e um `cmd` daqui gastaria a tela sem
    // desbloquear nada. Depois dela, tudo que o celular pode fazer é filtrado
    // pela lista de teclas de cada cena.
    aceitaTeclas: ativado,
    aoComando: (texto) => refComandoRemoto.current?.(texto),
    lerEstado: () =>
      ativado && refLeitor.current ? refLeitor.current() : estadoDeAtivacao(turma ?? ''),
  })

  const remoto = useMemo<ConexaoRemota>(
    () => ({
      status: statusRemoto,
      motivo: motivoRemoto,
      publicar: publicarRemoto,
      registrarLeitor: (ler) => {
        refLeitor.current = ler
      },
      registrarComando: (executar) => {
        refComandoRemoto.current = executar
      },
    }),
    [statusRemoto, motivoRemoto, publicarRemoto],
  )

  // Os instantes em que o celular precisa saber na hora: quando alguém ativa o
  // Chromebook (a tela dele deixa de dizer "é no teclado de lá") e quando os
  // áudios ficam prontos (o → acende).
  useEffect(() => {
    publicarRemoto()
  }, [publicarRemoto, ativado, carregado, audioDestravado])

  if (!turma) return <TelaSelecao aoEscolher={setTurma} />

  if (resultado && resultado.problemas.length > 0) {
    return <TelaErro turma={turma} problemas={resultado.problemas} />
  }

  if (!ativado) {
    return <TelaAtivacao codigo={codigo} carregado={carregado} remoto={statusRemoto} />
  }

  return (
    <Player
      roteiro={resultado!.roteiro!}
      engine={engine}
      codigo={codigo}
      remoto={remoto}
      carregado={carregado}
      audioDestravado={audioDestravado}
      houveGestoFisico={houveGestoFisico}
    />
  )
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
    <Hud rota="AGUARDANDO" sonar="STANDBY" rodapeEsquerda="submarino domi">
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
 * A tela do gesto: "pressione qualquer tecla".
 *
 * Ela NÃO inicia a apresentação — só tira o cadeado do áudio e põe o
 * submarino em standby. Não tem listener próprio: quem escuta é o efeito lá em
 * cima, que já precisa ouvir todo gesto físico da página pra destravar o som.
 * Dois listeners pro mesmo evento seriam duas regras pra manter em dia.
 */
function TelaAtivacao({
  codigo,
  carregado,
  remoto,
}: {
  codigo: string
  carregado: boolean
  remoto: StatusRemoto
}) {
  return (
    <Hud rota="STANDBY" sonar="DESLIGADO" rodapeEsquerda="submarino domi" remoto={remoto}>
      <div className="centro">
        <p className="chamada">
          pressione qualquer tecla
          <br />
          para ativar os sistemas de bordo
        </p>
        <p className="dica">
          {carregado
            ? 'nada começa ainda — o submarino fica em espera'
            : 'carregando os áudios da turma...'}
        </p>
        {/* Código do controle pelo celular. Fica aqui porque esta é a única
            tela que o operador olha com calma antes de começar — no meio da
            apresentação ele consulta pelo H. */}
        <p className="codigo-remoto">
          controle pelo celular · código <strong>{codigo}</strong>
        </p>
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
