import { Feed } from '../mundo/Feed'

type Props = { argumento?: string }

/**
 * Câmera em tamanho de painel: mesmo mundo, resolução interna maior e abertura
 * mais larga. É aqui que a fauna aparece de verdade pra plateia.
 */
export function PainelCamera({ argumento }: Props) {
  const dois = argumento?.trim() === '2'
  return (
    <Feed
      className="feed--grande"
      rotulo={dois ? 'CAM 02 · EXT ESTIBORDO' : 'CAM 01 · EXT BOMBORDO'}
      camera={{ x0: dois ? 1.6 : 0.3, abertura: 1.5, espelhado: dois }}
      largura={640}
      altura={360}
    />
  )
}
