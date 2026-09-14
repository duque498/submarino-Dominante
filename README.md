# Submarino DOMI

Software da apresentação de feira cultural (tema: oceanos) das turmas **2A**, **2B** e **3A**.
Uma "IA de bordo" conduz a narrativa, faz as transições entre setores (Biologia, Arte,
Educação Física), aplica dinâmicas com a plateia e simula uma pane no sistema.

Cada turma roda o **mesmo app** num Chromebook ligado ao projetor e à caixa de som.
Um aluno operador controla tudo pelo teclado — não é preciso mouse.

## Estado atual

**Fase 1.9 concluída.** Funcionam: seleção de turma, tela de ativação, cenas de
`fala`, `apresentacao` e `transicao`, HUD, orbe animado da IA (que morfa em
silhuetas), legenda sincronizada, painel de log de sistemas, console de
comandos, painéis e o overlay de atalhos.
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
  audios.js         <- dist/audios.js (camada A; opcional)
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
| `H` | mostra/esconde o overlay de atalhos |
| `/` | abre o console de comandos |
| `Esc` | fecha o console ou o painel aberto |
| `Tab` | completa o comando (sugestão em cinza no campo) |
| `↑` / `↓` | histórico de comandos |
| `M` / `N` | próxima / anterior forma do orbe na cena atual |
| `O` | volta o orbe pra esfera, de qualquer cena |
| `[` / `]` | diminui / aumenta o orbe em 10% (ajuste ao vivo; não persiste) |

**A primeira tela pede uma tecla qualquer.** Isso não é decoração: o Chrome só
libera a reprodução de áudio depois de uma interação do usuário. Esse gesto
desbloqueia o áudio e pré-carrega todos os mp3 da turma.

## A tela durante uma fala

Três elementos, todos cenográficos menos a legenda:

- **Orbe** — a "presença" da IA. Uma esfera de pontos e linhas em Canvas 2D puro
  (sem WebGL, sem biblioteca) que ondula, gira e reage ao áudio. Tem quatro
  estados: `ocioso`, `falando`, `processando` e `pane`. Também **morfa em
  silhuetas** (ver abaixo).
- **Legenda** — uma linha por vez, grande, embaixo do orbe, revelada palavra a
  palavra junto com a voz. As linhas anteriores não ficam na tela.
- **Log de sistemas** — coluna da direita. **Nada ali é real**: é um painel
  decorativo que sorteia linhas técnicas de um pool (`src/ui/logPool.ts`) e as
  intercala com as linhas do campo `log` da cena atual. As linhas são digitadas
  caractere a caractere, algumas têm barra de progresso que sobe, outras têm
  leitura que oscila antes de congelar, e no topo há uma sparkline alimentada
  pelo nível de áudio.

Tanto a legenda quanto o log manipulam o próprio DOM em vez de virar estado do
React. Com digitação, brilho reativo e barra de progresso, um render por quadro
custaria a árvore inteira; assim cada um tem um único `requestAnimationFrame`.

## Os dois modos da cena `apresentacao`

A IA não é o centro da apresentação, mas às vezes é o cenário. O campo `orbe`
da cena escolhe:

- `"discreto"` (padrão) — título grande do setor, status embaixo, orbe pequeno
  no canto inferior esquerdo em `ocioso`. O campo `formas` é ignorado. A tela é
  dos alunos.
- `"palco"` — orbe grande e centralizado morfando nas `formas` da cena; título e
  status viram rótulos pequenos no topo. Um indicador discreto no rodapé
  (`circulo · 2/4`) diz ao operador qual forma está no ar.

Nos dois modos o log continua na direita, com metade da opacidade.

## Formas do orbe

As ~760 partículas do orbe podem assumir a silhueta de uma imagem: cada uma
ganha um ponto-alvo dentro do desenho e o orbe interpola até lá em 1,4 s.

O campo `formas` da cena lista, na ordem, o que o operador percorre com `M` e
`N`. A primeira entra sozinha ao abrir a cena. `"esfera"` é um nome válido e é o
padrão quando a cena não tem o campo.

```json
{ "id": "bio", "tipo": "apresentacao", "avanco": "manual",
  "orbe": "palco",
  "formas": ["esfera", "baleia", "tartaruga", "coral"] }
```

### Como adicionar uma forma

1. Salve o PNG em `src/formas/` — **silhueta preta**, fundo transparente (ou
   branco), no mínimo 256px no maior lado. Sem detalhe interno: o que define a
   figura é o contorno.
2. Registre em `src/formas/index.ts`:
   ```ts
   import baleia from './baleia.png'

   export const IMAGENS_FORMAS: Record<string, string> = {
     baleia,
   }
   ```
3. Cite o nome (`"baleia"`) no campo `formas` da cena, no JSON do roteiro.

Nome errado no JSON dá erro legível na tela, com a lista das formas disponíveis.

O `import` tem que passar pelo Vite: com `assetsInlineLimit` alto o PNG vira
data URI e entra no bundle. Uma imagem carregada por caminho de arquivo via
`file://` contamina o canvas e o `getImageData` lança `SecurityError`.

> Enquanto os PNGs não chegam, `src/formas/primitivas.ts` gera formas em código
> — `circulo`, `quadrado`, `triangulo`, `estrela`, `coracao`, `onda`, `gota`,
> `anel`, `espiral`, `seta`, `letra-d` — usadas provisoriamente no `2a.json` e
> disponíveis no console a qualquer momento.

## Console de comandos

`/` abre uma barra de comando na parte de baixo da área central. **O que o
operador digita aparece pra plateia** — é parte do show, então a fonte é grande
e o campo tem brilho.

Ao dar `Enter`: o campo trava, o orbe vai pra `processando`, o log entra em
rajada por cerca de 1 s, e aí a IA responde com uma linha de legenda e executa.
`Shift+Enter` executa sem fechar a barra.

A sintaxe é livre e tolerante — sem acento, sem verbo, maiúscula ou minúscula:

| Exemplo | O que faz |
|---|---|
| `baleia`, `virar tartaruga`, `forma esfera` | morfa o orbe numa forma registrada |
| `estrela`, `coracao`, `espiral`, `letra x`, `numero 7` | desenha a primitiva na hora e morfa |
| `sonar`, `abrir status`, `mapa`, `ficha baleia` | abre um painel |
| `cena 5`, `ir bio`, `proximo`, `voltar` | navega no roteiro |
| `pane`, `reiniciar`, `limpar`, `ajuda` | comandos de sistema |

Comando não reconhecido **nunca** vira "comando inválido" seco — no palco isso
parece defeito. A IA responde `Comando não reconhecido pelo sistema de bordo.`,
solta uma estática, o orbe treme e o log registra um `WARN`.

### Comandos roteirizados

Qualquer cena pode ter comandos que **a própria IA digita**, sem o operador:

```json
{ "id": "bio-intro", "tipo": "fala",
  "comandos": [{ "texto": "abrir sonar", "atraso": 1500 }] }
```

`atraso` conta em ms a partir do início da cena. A digitação tem velocidade
humana (~60 ms por caractere) e uma hesitação no meio. Se o comando não
resolver em nada, o roteiro dá erro legível no carregamento.

## Painéis

Overlays que se materializam sobre a área central. Um por vez; abrir outro
substitui, e trocar de cena fecha.

- `sonar` — varredura circular com contatos e anéis de distância.
- `status` — os seis subsistemas com barra e valor. Na Fase 2 é este painel que
  mostra a pane.
- `ficha <nome>` — ficha de espécie. **Os dados são reais**, vêm de
  `src/roteiros/fichas.json`: é conteúdo de Biologia, não cenografia. Tem
  entradas pra baleia, tartaruga, agua-viva, coral, peixe e mergulhador.
- `mapa` — costa brasileira com marcadores em Abrolhos e no litoral amazônico.

Painel novo = um arquivo em `src/paineis/` + uma linha em `nomes.ts` e no
`index.tsx`.

## As duas camadas de áudio

O orbe reage ao nível do som. Ler esse nível via `file://` é o problema:
o Chrome trata um `<audio>` de arquivo local como origem opaca e **silencia**
`createMediaElementSource`, além de bloquear `fetch` de arquivo local. Daí duas
camadas, escolhidas automaticamente por arquivo:

**Camada A — nível real (preferida).** Depende de rodar o script de áudio:

```bash
python3 scripts/embutir_audios.py
```

Ele lê todos os `public/audio/<turma>/*.mp3` e gera `public/audios.js`, um
script clássico que define `window.__AUDIOS = { "2a/entrada": "data:audio/mpeg;base64,..." }`.
Script clássico com `src` relativo carrega via `file://` sem reclamar, e um
`data:` URL é same-origin — então o `fetch` → `decodeAudioData` funciona.
O áudio toca num `AudioBufferSourceNode` ligado a um `AnalyserNode`, e o nível
é o RMS da forma de onda, suavizado.

Os buffers são decodificados sob demanda, uma cena por vez (só a próxima é
pré-decodificada), pra não estourar a memória do Chromebook.

**Camada B — envelope sintético (fallback).** Sem `audios.js`, ou se a
decodificação falhar, o áudio volta a ser um `HTMLAudioElement` comum e o nível
vira um sinal falso enquanto o áudio toca: "sílabas" a 4–6 Hz com amplitude
variável e pausas curtas a cada 2–4 s. Visualmente convence; só não está
sincronizado com a voz de verdade.

O componente do orbe não sabe qual camada está ativa — ele só recebe uma função
que devolve o nível. Ao ativar os sistemas, o console diz qual camada pegou:

```
[audio] camada A (nível real) em 17/17 arquivos; o resto usa a camada B (envelope sintético).
```

Os SFX (`sonar`, `alarme`, ...) ficam sempre como `<audio>` comum: não precisam
de análise e só engordariam o `audios.js`.

> `public/audios.js` é gerado e **não vai pro git** — ele carrega os mp3 inteiros
> em base64 e pesa dezenas de MB. Copie ele junto do `index.html` pro Chromebook.

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
- `log` — lista opcional de linhas fictícias pro painel da direita, exibidas
  enquanto essa cena estiver no ar. Ex.: `["Carregando setor: BIOLOGIA",
  "Consultando catálogo de espécies..."]`.

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
  ui/                Hud, Orbe, Legenda, LogSistemas, logPool, Ajuda
  console/           barra de comando e o parser
  paineis/           sonar, status, ficha, mapa e o registro
  formas/            registro das silhuetas, amostragem e primitivas
  roteiros/          tipos.ts, validar.ts, fichas.json e os JSONs de cada turma
scripts/
  embutir_audios.py  gera public/audios.js (camada A)
```
