import { Feed } from '../mundo/Feed'

type Props = {
  argumento?: string
  /** Visor rachado: a fratura entra também na câmera grande. */
  visor?: 'ok' | 'rachado' | 'parcial'
}

/**
 * Câmera em tamanho de painel: mesmo mundo, resolução interna maior e abertura
 * mais larga. É aqui que a fauna aparece de verdade pra plateia.
 */
export function PainelCamera({ argumento, visor = 'ok' }: Props) {
  const dois = argumento?.trim() === '2'
  return (
    <Feed
      className="feed--grande"
      rotulo={dois ? 'CAM 02 · EXT ESTIBORDO' : 'CAM 01 · EXT BOMBORDO'}
      camera={{ x0: dois ? 1.6 : 0.3, abertura: 1.5, espelhado: dois }}
      largura={640}
      altura={360}
      visor={visor}
      semente={dois ? 5501 : 1307}
    />
  )
}
