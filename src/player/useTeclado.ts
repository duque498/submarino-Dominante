import { useEffect, useRef } from 'react'

/** Ações do operador, já normalizadas a partir das teclas físicas. */
export type Acao =
  | { tipo: 'avancar' }
  | { tipo: 'voltar' }
  | { tipo: 'pular' }
  | { tipo: 'alternativa'; indice: number }
  | { tipo: 'vf'; resposta: boolean }
  | { tipo: 'pane' }
  | { tipo: 'reiniciar' }
  | { tipo: 'ajuda' }
  | { tipo: 'proximaForma' }
  | { tipo: 'formaAnterior' }
  | { tipo: 'esfera' }
  | { tipo: 'escala'; passo: number }
  | { tipo: 'console' }
  | { tipo: 'fechar' }
  | { tipo: 'revelar' }
  | { tipo: 'cronometro' }

function traduzir(evento: KeyboardEvent): Acao | null {
  switch (evento.key) {
    case 'ArrowRight':
    case 'Enter':
      return { tipo: 'avancar' }
    case 'ArrowLeft':
      return { tipo: 'voltar' }
    case ' ':
    case 'Spacebar':
      return { tipo: 'pular' }
    case '1':
    case '2':
    case '3':
    case '4':
      return { tipo: 'alternativa', indice: Number(evento.key) - 1 }
    case '[':
      return { tipo: 'escala', passo: -1 }
    case ']':
      return { tipo: 'escala', passo: 1 }
    case '/':
      return { tipo: 'console' }
    case 'Escape':
      return { tipo: 'fechar' }
  }

  switch (evento.key.toLowerCase()) {
    case 'v':
      return { tipo: 'vf', resposta: true }
    case 'f':
      return { tipo: 'vf', resposta: false }
    case 'p':
      return { tipo: 'pane' }
    case 'r':
      return { tipo: 'reiniciar' }
    case 'h':
      return { tipo: 'ajuda' }
    // Só a expedição de identificação usa: revela a espécie sem acerto.
    case 'x':
      return { tipo: 'revelar' }
    // Abre o console com "cronometro " já digitado: o operador só completa com
    // os segundos e dá Enter. Capturar dígitos soltos depois do T brigaria com
    // as teclas 1–4, que no 2B religam subsistema e no enigma revelam dica.
    case 't':
      return { tipo: 'cronometro' }
    case 'm':
      return { tipo: 'proximaForma' }
    case 'n':
      return { tipo: 'formaAnterior' }
    case 'o':
      return { tipo: 'esfera' }
    default:
      return null
  }
}

/**
 * Escuta o teclado globalmente (o operador nunca usa mouse).
 * O handler fica numa ref pra não religar o listener a cada render.
 */
export function useTeclado(aoAgir: (acao: Acao) => void, ativo = true): void {
  const handler = useRef(aoAgir)
  handler.current = aoAgir

  useEffect(() => {
    if (!ativo) return

    const aoPressionar = (evento: KeyboardEvent) => {
      if (evento.repeat || evento.ctrlKey || evento.altKey || evento.metaKey) return
      const acao = traduzir(evento)
      if (!acao) return
      // Evita a barra de espaço rolar a página e as setas moverem o foco.
      evento.preventDefault()
      handler.current(acao)
    }

    window.addEventListener('keydown', aoPressionar)
    return () => window.removeEventListener('keydown', aoPressionar)
  }, [ativo])
}
