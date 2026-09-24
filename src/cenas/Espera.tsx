import type { CenaEspera } from '../roteiros/tipos'
import type { StatusRemoto } from '../remoto/protocolo'

/**
 * O que o ponto do HUD sabe é se ESTE Chromebook está no canal — não se há um
 * celular do outro lado. Dizer "celular conectado" com ninguém conectado seria
 * o app mentindo na primeira tela que o operador olha.
 */
const ESTADO_REMOTO: Record<StatusRemoto, string> = {
  ligado: 'canal do celular aberto',
  reconectando: 'abrindo o canal do celular...',
  desligado: 'sem canal — controle pelo teclado',
}

type Props = {
  cena: CenaEspera
  turma: string
  /** PIN do controle remoto desta sessão. */
  codigo: string
  remoto: StatusRemoto
  /** Os mp3 da turma já estão decodificados? Antes disso o → não vale. */
  carregado: boolean
  /**
   * Aviso de áudio travado, aceso por 3 s quando o → vem do celular e ninguém
   * encostou no Chromebook ainda.
   */
  avisoAudio: boolean
}

/**
 * A tela parada de antes de começar.
 *
 * O que ela precisa resolver é social, não técnico: o operador vai mexer no
 * Chromebook com a plateia entrando — pôr em tela cheia, ajustar o projetor,
 * limpar a tela — e nada disso pode acordar a IA. Por isso ela não reage a
 * clique nenhum; só à seta direita.
 */
export function Espera({
  turma,
  codigo,
  remoto,
  carregado,
  avisoAudio,
}: Props) {
  return (
    <div className="espera">
      <p className="espera__marca">submarino domi · {turma}</p>
      <p className="espera__estado">
        {carregado ? 'sistemas em espera' : 'carregando sistemas de bordo...'}
      </p>
      <p className="espera__pin">
        controle pelo celular · código <strong>{codigo}</strong>
      </p>
      <p className="espera__remoto">{ESTADO_REMOTO[remoto]}</p>
      <p className="espera__partida">
        {carregado ? 'seta direita pra iniciar' : 'aguarde'}
      </p>
      {/* Discreto e no rodapé de propósito: é recado pro operador, não pra
          plateia, e some sozinho em 3 s. */}
      {avisoAudio && (
        <p className="espera__aviso">toque na tela do Chromebook pra liberar o áudio</p>
      )}
    </div>
  )
}
