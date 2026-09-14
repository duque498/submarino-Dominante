# Submarino DOMI

Software da apresentação de feira cultural (tema: oceanos) das turmas **2A**, **2B** e **3A**.
Uma "IA de bordo" conduz a narrativa, faz as transições entre setores (Biologia, Arte,
Educação Física), aplica dinâmicas com a plateia e simula uma pane no sistema.

Cada turma roda o **mesmo app** num Chromebook ligado ao projetor e à caixa de som.
Um aluno operador controla tudo pelo teclado — não é preciso mouse.

## Estado atual

**Fase 3 concluída.** Todos os tipos de cena funcionam: `fala`,
`apresentacao`, `transicao`, `quiz`, `vf` e `pane`. Mais HUD, orbe que morfa em
silhuetas, legenda sincronizada, log de sistemas, console de comandos, painéis,
câmeras externas com o oceano procedural, profundidade real e o pipeline de
voz. Falta só preencher os roteiros do 2B e do 3A (Fase 4).
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
| `1` `2` `3` `4` | marca a resposta no quiz |
| `V` / `F` | marca resposta no verdadeiro/falso |
| `P` | dispara a pane a qualquer momento |
| `R` | durante a pane: reinicia e volta pra cena onde estava |
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

## Dinâmicas: quiz e verdadeiro/falso

Abrem como os painéis, numa janela sobre a área central: pergunta grande,
alternativas em cards com o número da tecla bem visível e um timer circular
que faz ping de sonar acelerando nos últimos 5 segundos.

O ciclo é: a IA lê a pergunta → o timer começa → o operador marca com `1` `2`
`3` (ou `V`/`F`) → o card certo pisca verde, o marcado errado pisca vermelho,
o orbe pulsa (acerto) ou treme (erro), e a IA fala o feedback. **Timer zerado
sem resposta conta como erro.** Depois do feedback o avanço é manual: `→`.

No `vf`, o campo `restaura` religa um subsistema no painel `status` a cada
acerto — é o que vai sustentar a pane narrativa do 3A.

## Pane

`P` dispara a pane de qualquer cena, fechando o console e qualquer painel
aberto. Os subsistemas do JSON caem um a um a cada 400 ms no painel `status`,
o log entra em modo erro, o orbe vai pra `pane` e a legenda mostra as falas de
alerta em vermelho. Quando a fala termina, **tudo congela, inclusive o log**.

`R` reinicia: os subsistemas religam um a um, a IA fala o retorno e a
apresentação volta pra cena onde estava. Durante a pane as setas ficam
bloqueadas, pra a cena não avançar por baixo.

> `P` funciona com um painel aberto, mas **não** com o console aberto — lá as
> teclas são texto, e um `p` digitado dispararia a pane no meio de uma palavra.
> Com o console aberto, use o comando `pane`, ou `Esc` e depois `P`.

## Profundidade e câmeras externas

O submarino tem câmeras apontadas pra fora, e o que elas mostram depende de uma
coisa só: **quantos metros**. As câmeras não sabem qual turma está apresentando.

### Profundidade

`CenaBase.profundidade` (metros) é a profundidade-alvo da cena. Ao entrar nela o
submarino **desce ou sobe animado** até lá — 3 a 6 s conforme a distância, com o
número do HUD tickando. Cena sem o campo herda a da cena anterior.

Referência pra quem preencher os JSONs do 2B e do 3A (provisório, ajustável):

| Turma | Faixa | Cenas |
|---|---|---|
| **2A** | 50 → 900 m | `entrada` 50, `bio` 120, `arte` 300, `ef` 450, `quiz-intro` 600, `transicao-2b` 900 |
| **2B** | ~900 → 3000 m | começa onde o 2A parou e desce até a batipelágica |
| **3A** | ~3000 → 5500 m | chega ao abissal; a **cena final volta pra 0** (retorno à superfície) |

### Zonas

A transição é **contínua**: luz, densidade de fauna, partículas e cor de fundo
são interpoladas pela profundidade. Passar de 190 pra 210 m não muda a tela de
repente.

| Zona | Faixa | O que aparece |
|---|---|---|
| Eufótica | 0–200 m | raios de sol, superfície ondulando, cardume denso, corais no fundo, bolhas |
| Mesopelágica | 200–1000 m | azul escuro, peixes esparsos, águas-vivas, neve marinha, primeiras luzes |
| Batipelágica | 1000–4000 m | quase preto, farol do submarino, bioluminescência frequente |
| Abissal | 4000+ m | preto fora do farol, fauna rara, tremor de pressão no feed |

### Onde as câmeras aparecem

- **Dois mini-feeds** nos cantos inferiores da área central, com rótulo, `● REC`,
  relógio, profundidade e zona, scanlines, grão e vinheta. Bombordo e estibordo
  veem lados diferentes do mesmo cardume. Perda de sinal ocasional (`SINAL
  FRACO`) a cada 30–90 s. Na pane, as duas caem em estática até o `R`.
  `CenaBase.cameras: false` esconde os dois (as cenas de quiz usam isso).
- **Retículo de rastreamento** que segue a fauna grande quando ela cruza o
  quadro, com rótulo tipo `CETÁCEO · 26 M`.
- **Painel `camera`** (`camera`, `camera 1`, `camera 2`) abre um feed grande.

Existe **um** mundo, simulado uma vez por quadro em `src/mundo/`. Os canvases
registrados só desenham o mesmo estado de pontos de vista diferentes — simular
várias vezes custaria o múltiplo por nenhum ganho.

> Comando de depuração: `profundidade 4500` (ou `prof 4500`) força a
> profundidade sem mexer no roteiro. Útil pra conferir o cenário de cada zona.

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
| `sonar`, `abrir status`, `mapa`, `ficha baleia`, `camera 1` | abre um painel |
| `cena 5`, `ir bio`, `proximo`, `voltar` | navega no roteiro |
| `pane`, `reiniciar`, `limpar`, `ajuda` | comandos de sistema |
| `profundidade 4500` | depuração: força a profundidade do cenário |
| `som` | toca todos os efeitos em sequência, pra conferir os alto-falantes |
| `ambiente` | liga/desliga o som de fundo do oceano |
| `voz` | alterna entre a voz do sistema e o mp3 gravado |

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
que devolve o nível. Ao ativar os sistemas, o console resume tudo:

```
[audio] camada A em 17/17 · tempos reais em 17/17 cenas · sfx sintético
```

Os SFX (`sonar`, `alarme`, ...) ficam sempre como `<audio>` comum: não precisam
de análise e só engordariam o `audios.js`.

> `public/audios.js` é gerado e **não vai pro git** — ele carrega os mp3 inteiros
> em base64 e pesa dezenas de MB. Copie ele junto do `index.html` pro Chromebook.

## Editando o roteiro

### Ritmo da legenda

Cada linha fica na tela pelo tempo de leitura em voz alta (~14 caracteres por
segundo), com mínimo de 1,8 s, mais 0,6 s de pausa antes da próxima entrar.

- **Sem mp3**, a duração da cena é a soma dessas durações.
- **Com mp3**, a duração real é repartida proporcional a caracteres, mas nunca
  abaixo do mínimo. Se o áudio for mais curto que a soma dos mínimos, quem dita
  o ritmo é a legenda e a cena espera por ela.
- **Com `tempos.json`** (depois de rodar o script de voz), os offsets reais de
  cada linha mandam em tudo: a legenda troca quando a voz troca.

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

## A voz da IA

Duas fontes, nesta ordem:

1. **Voz do sistema (Web Speech API)** — usada por padrão **quando a máquina
   tem voz em português instalada**. Lê exatamente o texto da legenda, e a
   legenda troca de linha junto com a fala (uma fala por linha).
2. **mp3 gerado** pelo `scripts/gerar_audios.py` — usado quando não há voz no
   sistema, ou quando o operador troca com `/` + `voz`.

> **Isto contraria a decisão original do projeto**, que proibia a Web Speech
> API. A razão da proibição era boa: ela depende do que a máquina tem
> instalado. Mas o plano B não fechou — quem apresenta usa Chromebook sem
> terminal, então não dá pra rodar o gerador de voz, e a síntese offline que
> sobrou (espeak) é robótica demais pro texto da professora. O Chrome OS tem
> vozes pt-BR boas embutidas. Fica assim até existir uma máquina onde rodar o
> `--motor edge`; aí é só trocar com `voz`.

**Teste no dia:** o log da tela mostra, na ativação, qual fonte está ativa —
`Narração: voz do sistema — <nome da voz>` ou `Narração: gravação de bordo
(mp3)`.

### Escolher a voz

Uma máquina costuma ter várias vozes em português, e a diferença entre elas é
enorme: as "Natural"/"Neural" e as servidas pela rede soam humanas, as locais
soam robóticas. O app já escolhe a melhor por uma nota (pt-BR > pt, nome com
Natural/Neural/WaveNet, Google, voz de rede), mas dá pra conferir e trocar:

```
/  vozes      lista as instaladas, da melhor pra pior, marcando a em uso
/  voz 2      passa a usar a de número 2
```

**Se a voz estiver ruim, esse é o primeiro lugar pra olhar** — pode haver uma
melhor instalada que não ganhou a nota.

## Gerar a voz

A voz da IA é sintetizada **em casa, antes da feira** — essa etapa precisa de
internet. A apresentação em si roda 100% offline.

### Uma vez, pra preparar a máquina

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r scripts/requirements.txt
```

E `ffmpeg` no PATH (`sudo apt install ffmpeg`, `brew install ffmpeg`, ou
[gyan.dev](https://www.gyan.dev/ffmpeg/builds/) no Windows). O `ffprobe` vem
junto.

### Dois motores de voz

| motor | qualidade | precisa de internet |
|---|---|---|
| `--motor edge` (padrão) | voz neural, `pt-BR-FranciscaNeural` | **sim** |
| `--motor espeak` | robótica (síntese por formantes) | não |

O `espeak` existe porque uma IA de bordo com voz de robô é melhor que uma IA
muda: dá pra apresentar sem máquina com terminal e internet. Ajuste a voz e a
velocidade em `scripts/config.json` (`pt-br+f1..f4`, `pt-br+m1..m7`).

**Cada motor tem um filtro de rádio diferente**, e por um motivo: o do `edge`
corta pesado (tira a fundamental e ecoa), o que dá caráter de intercomunicador
sem prejudicar uma voz neural. O `espeak` é síntese por formantes — já nasce
fino, e esse mesmo filtro borra os formantes até a fala virar ruído. O filtro
dele é mais leve porque ali o objetivo é ser **entendido**, não ser bonito.

**Os mp3 no repositório hoje foram gerados com o espeak.** Pra trocar pela voz
neural, numa máquina com Python e internet:

```bash
python3 scripts/gerar_audios.py --turma 2a --forcar
```

### Toda vez que mudar um texto do roteiro

```bash
python3 scripts/gerar_audios.py          # todas as turmas
python3 scripts/gerar_audios.py --turma 2a
npm run build
```

Quanto demora: a síntese leva uns **2–4 s por linha**. O 2A inteiro tem 53
linhas, ou seja **uns 2 a 4 minutos** na primeira vez. Depois disso o cache
(`scripts/.cache.json`, hash de texto + voz + rate + pitch + filtro) faz só o
que mudou ser regerado — corrigir uma frase leva segundos. `--forcar` ignora o
cache.

Outras flags: `--voz pt-BR-AntonioNeural`, `--rate -12%`, `--pitch -4Hz`,
`--sem-filtro` (pra comparar sem o filtro de rádio), `--so-listar` (mostra
todas as falas sem gerar nada).

Cada turma pode ter voz própria em `scripts/config.json`:

```json
{ "turmas": { "2b": { "voz": "pt-BR-AntonioNeural" } } }
```

### O que o script faz

1. lê os JSONs dos roteiros **e** `src/console/respostas.ts` (as respostas
   fixas do console também ganham voz);
2. sintetiza **uma linha por vez** com `edge-tts`;
3. aplica o filtro de intercomunicador
   (`highpass=300, lowpass=3400, aecho, volume=1.4`);
4. concatena as linhas de cada cena com **600 ms de silêncio** entre elas →
   `public/audio/<turma>/<id>.mp3`;
5. mede cada linha com `ffprobe` e escreve `public/audio/<turma>/tempos.json`
   com o offset real de cada uma dentro do mp3;
6. chama o `embutir_audios.py`, que monta a camada A.

Os mp3 finais e o `tempos.json` **ficam no repositório** de propósito: quem
apresenta usa Chromebook e não tem terminal pra rodar o script. O
`public/audios.js` continua fora — é a mesma coisa em base64, pesa o triplo e
sai do `npm run build`.

### Por que o tempos.json importa

Com ele, a legenda troca de linha no instante exato em que a voz troca, em vez
de estimar por número de caracteres. Medido: erro de **até 11 ms** (um quadro).
Sem o arquivo, o modo proporcional continua valendo.

## Som de fundo: por dentro do casco

`src/audio/ambiente.ts` sintetiza o ambiente continuamente. O ponto de escuta é
**a cabine do submarino**, não a praia — o que muda tudo:

1. **Nada é brilhante.** A água absorve agudo rápido e o casco abafa o resto;
   tudo passa por um passa-baixa geral em 1,5 kHz. Foi o que faltava na
   primeira versão, que soava como onda quebrando.
2. **O que domina é um zumbido tonal de maquinário** — quatro frequências
   ligeiramente desafinadas entre si, com uma pulsação lenta de motor. Ruído
   sozinho não dá a sensação de estar dentro de uma máquina.
3. **O espaço é fechado e metálico**: tudo tem uma cauda curta de reverberação,
   com a resposta ao impulso gerada em código.

Aí entra a profundidade, a mesma que alimenta as câmeras:

| onde | o que se ouve |
|---|---|
| superfície | massa d'água mexendo, cachos de bolhas graves pelo casco, hélice distante de embarcação |
| meio | ventilação da cabine, canto de cetáceo bem abafado |
| fundo | pressão grave, casco rangendo, estalos de válvula, gotejamento, ecos sem origem |

Nada é arquivo em loop, então não existe emenda audível se repetindo. Quando a
IA fala, o ambiente abaixa sozinho. `/` + `ambiente` liga e desliga.

## Quando algo estoura na apresentação

`src/ui/Escotilha.tsx` é um error boundary em volta do app inteiro. Sem ele,
um erro de render desmonta a árvore e a tela fica **preta** — na frente da
plateia, o pior cenário possível. Com ele, o erro vira uma tela legível com a
mensagem, e o operador recarrega com Ctrl+R e segue.

A mensagem na tela é o que permite consertar depois: peça pra quem operou
anotar ou fotografar.

**Regra que evita a classe de erro mais comum aqui:** a legenda, o log, os
feeds e o contador de profundidade montam DOM na mão, por desempenho. Um
elemento cujo conteúdo o JS escreve **não pode ter filho vindo do React** — os
dois brigam pelo mesmo nó e o React estoura com
`removeChild: the node to be removed is not a child of this node`. Por isso
esses elementos são todos auto-fechados no JSX, e a limpeza dos efeitos remove
só os nós que o próprio efeito criou, nunca `replaceChildren()`.

## Efeitos sonoros

Os SFX (`sonar`, `alarme`, `estatica`, `ok`, `pressurizacao`, `bipe-timer`)
são **sintetizados em código** com a Web Audio API, em `src/audio/sfx.ts`. Não
dá pra depender de o professor baixar arquivos do freesound na véspera da
feira: o projeto roda completo sem nenhum mp3 de efeito.

Se você quiser efeitos "de verdade", é só jogar o arquivo em
`public/audio/sfx/<nome>.mp3` — ele passa a ter prioridade sobre o sintético,
um a um. Dá pra ter o `sonar` de arquivo e o resto sintetizado.

Os níveis foram calibrados pra caixa de som em quadra, não pra fone: os picos
ficam entre 0,35 e 0,7, e tudo passa por um compressor pra o eco do sonar não
somar acima de 1 e distorcer.

### Conferir o som antes da apresentação

A primeira tecla (a da ativação) já dá um **bipe duplo** de confirmação. Se
esse bipe não sai, o problema é o áudio da máquina, não o app.

Pra um teste completo, `/` e depois `som`: toca os seis efeitos em sequência
(cerca de 7 s) e escreve no log o estado do `AudioContext`. `running` significa
que o navegador liberou o áudio.

## Estrutura

```
public/audio/        mp3 fora do bundle: sfx/ e uma pasta por turma
src/
  App.tsx            seleção de turma, tela de ativação, monta o Player
  player/            Player.tsx, useTeclado.ts, AudioEngine.ts
  cenas/             um componente por tipo de cena (inclui Quiz e VF)
  ui/                Hud, Orbe, Legenda, ritmoLegenda, LogSistemas, Timer, Ajuda
  audio/             efeitos, ambiente do oceano e a voz do navegador
  console/           barra de comando, parser e as respostas fixas da IA
  paineis/           sonar, status, ficha, mapa e o registro
  mundo/             o oceano procedural: perfil por profundidade, motor e Feed
  formas/            registro das silhuetas, amostragem e primitivas
  roteiros/          tipos.ts, validar.ts, fichas.json e os JSONs de cada turma
scripts/
  gerar_audios.py    voz da IA: edge-tts + ffmpeg + tempos.json
  embutir_audios.py  gera public/audios.js (camada A)
  config.json        voz, rate e pitch, com override por turma
```
