import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type Estado = { erro: Error | null; onde: string }

/**
 * Escotilha de emergência: se algo estourar durante a apresentação, o React
 * desmonta a árvore inteira e a tela fica PRETA, sem nenhuma pista. Numa feira,
 * na frente da plateia, isso é o pior cenário possível.
 *
 * Aqui o erro vira uma tela legível, com a mensagem, e o operador pode
 * recarregar. A mensagem é o que permite consertar depois.
 */
export class Escotilha extends Component<Props, Estado> {
  state: Estado = { erro: null, onde: '' }

  static getDerivedStateFromError(erro: Error): Partial<Estado> {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[falha] erro na apresentação:', erro, info.componentStack)
    this.setState({ onde: (info.componentStack ?? '').split('\n').slice(1, 4).join('\n') })
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div className="hud">
        <div className="hud__moldura">
          <div className="erro">
            <h1>Falha no sistema de bordo</h1>
            <p className="erro__ajuda">
              Recarregue a página (Ctrl+R) pra continuar a apresentação. Se puder,
              anote a mensagem abaixo — é ela que permite consertar.
            </p>
            <ul>
              <li>{this.state.erro.message || String(this.state.erro)}</li>
            </ul>
            {this.state.onde && <pre className="erro__pilha">{this.state.onde}</pre>}
          </div>
        </div>
      </div>
    )
  }
}
