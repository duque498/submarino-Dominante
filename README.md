# Submarino DOMI

Software da apresentação de feira cultural (tema: oceanos) das turmas **2A**, **2B** e **3A**.
Uma "IA de bordo" conduz a narrativa, faz as transições entre setores (Biologia, Arte,
Educação Física), aplica dinâmicas com a plateia e simula uma pane no sistema.

Cada turma roda o **mesmo app** num Chromebook ligado ao projetor e à caixa de som.
Um aluno operador controla tudo pelo teclado — não é preciso mouse.

## Estado atual

**Fase 1 concluída.** Funcionam: seleção de turma, tela de ativação, cenas de
`fala`, `apresentacao` e `transicao`, HUD e efeito de digitação.
As cenas `quiz`, `vf` e `pane` estão no roteiro mas ainda aparecem como
"a implementar (Fase 2)". Os mp3 ainda não existem (Fase 3).

## Stack

Vite + React + TypeScript, sem backend e sem roteador.
Dependências: `react`, `react-dom`, `vite`, `typescript`, `vite-plugin-singlefile`
(mais `@vitejs/plugin-react` e os `@types/*`, exigidos pelo próprio toolchain).

O build usa `vite-plugin-singlefile`: sai um único `dist/index.html` com todo o
JS e CSS embutidos. Isso é o que permite abrir o arquivo direto do disco
(`file://`) no Chromebook — o Chrome bloqueia `<script type="module">` em
`file://`, e não dá pra depender do wifi da quadra.

Os **mp3 ficam fora do bundle**, em `public/audio/`, referenciados por caminho
relativo (`./audio/2a/entrada.mp3`).

## Rodando em desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:5173/?turma=2A`.

## Build e uso no Chromebook

```bash
npm run build
```

Depois copie para o Chromebook, **mantendo a estrutura**:

```
submarino-domi/
  index.html        <- dist/index.html
  audio/            <- dist/audio/ (vem de public/audio/)
```

Abra o `index.html` no Chrome com a turma na URL:

```
file:///.../submarino-domi/index.html?turma=2A
```

Sem `?turma=`, o app mostra uma tela pedindo pra escolher a turma (teclas 1, 2, 3).

## Controles do operador

| Tecla | Ação |
|---|---|
| `→` / `Enter` | avança pra próxima cena |
| `←` | volta uma cena |
| `Espaço` | interrompe o áudio atual e avança |
| `1` `2` `3` `4` | marca a resposta no quiz *(Fase 2)* |
| `V` / `F` | marca resposta no verdadeiro/falso *(Fase 2)* |
| `P` | dispara a cena de pane a qualquer momento *(Fase 2)* |
| `R` | durante a pane: reinicia e volta pra cena onde estava *(Fase 2)* |
| `H` | mostra/esconde o overlay de atalhos *(Fase 2)* |

**A primeira tela pede uma tecla qualquer.** Isso não é decoração: o Chrome só
libera a reprodução de áudio depois de uma interação do usuário. Esse gesto
desbloqueia o áudio e pré-carrega todos os mp3 da turma.

## Editando o roteiro

Todo o conteúdo (textos, áudios, perguntas) vive em `src/roteiros/2a.json`,
`2b.json` e `3a.json`. O player só conhece **tipos de cena** — pra mudar o que a
IA fala, mexa só no JSON.

Tipos de cena disponíveis: `fala`, `apresentacao`, `transicao`, `quiz`, `vf`, `pane`.
O formato de cada um está em `src/roteiros/tipos.ts`.

Campos comuns a todas:

- `id` — único dentro da turma; **é o nome do mp3** que vai ser gerado.
- `avanco` — `"auto"` (avança sozinha quando o áudio termina) ou `"manual"`
  (espera o operador apertar `→`).
- `sfx` — efeito sonoro opcional: `"sonar"`, `"alarme"`, `"estatica"` ou `"ok"`.

O roteiro é validado ao carregar. Se algo estiver errado, o app mostra uma tela
vermelha dizendo **qual cena e qual campo** estão com problema — não é preciso
abrir o console.

> Enquanto os mp3 não existem, o app avisa no console e a cena `auto` avança
> sozinha depois de ~2,5s por linha de texto. Nada trava.

## Geração dos áudios

Ainda não implementada (Fase 3): um script Python com `edge-tts` vai ler os
JSONs, gerar a voz da IA e aplicar um filtro de intercomunicador via `ffmpeg`.

## Estrutura

```
public/audio/        mp3 fora do bundle: sfx/ e uma pasta por turma
src/
  App.tsx            seleção de turma, tela de ativação, monta o Player
  player/            Player.tsx, useTeclado.ts, AudioEngine.ts
  cenas/             um componente por tipo de cena
  ui/                Hud, Digitacao (e Timer, na Fase 2)
  roteiros/          tipos.ts, validar.ts e os JSONs de cada turma
```
