# Submarino DOMI

Software da apresentação de feira cultural (tema: oceanos) das turmas **2A**, **2B** e **3A**.
Uma "IA de bordo" conduz a narrativa, faz as transições entre setores (Biologia, Arte,
Educação Física), aplica dinâmicas com a plateia e simula uma pane no sistema.

Cada turma roda o **mesmo app** num Chromebook ligado ao projetor e à caixa de som.
Um aluno operador controla tudo pelo teclado — não é preciso mouse.

## Estado atual

**Fase 5 (2º ano B) concluída.** Todos os tipos de cena funcionam: `fala`,
`apresentacao`, `transicao`, `quiz`, `vf`, `pane`, `identificacao`, `combate`,
`olho`, `emergencia` e `hidrofone`. Mais HUD, orbe que morfa em silhuetas,
legenda sincronizada, log de sistemas, console de comandos, painéis, câmeras
externas com o oceano procedural, profundidade real, o pipeline de voz e o
**Diretor de cena** — a IA passou a reagir ao que ela mesma está dizendo, em
vez de a um relógio.

O **3A** está escrito e jogável de ponta a ponta: descida à abissal, visor
rachando, as quatro apresentações, o combate acústico com a plateia e o
encerramento na superfície.

O **2B** também: descida a 1800 m, as sementes da pane durante o grupo 1, a
quebra da IA no fim do grupo 2, os grupos 3 e 4 em modo reduzido com os reparos
pelo operador, o hidrofone com os três sons e o encerramento com a comunicação
de volta.

Faltam os roteiros de Biologia e Educação Física do 2A.

> **O conteúdo do 3A é provisório.** A criatura, a mecânica e as falas novas da
> IA ainda vão ser confirmadas com a turma e com a professora. O código foi
> feito pra isso: trocar a criatura é uma chave no JSON e uma silhueta em
> `bestiario.ts`, e trocar qualquer fala é só editar o JSON e rodar o script de
> voz. Nada do 3A está escrito no componente.

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
| `1` `2` `3` `4` | marca a resposta no quiz; **no combate, o setor do contato** |
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
| qualquer uma acima | suspende a direção automática até a próxima cena |
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

**Quem faz a silhueta ser lida a 15 metros é o contorno, não o preenchimento.**
A amostragem rasteriza a figura em 400×400, marca a borda por vizinhança
4-conexa e **percorre essa borda pixel a pixel**, guardando a ordem do traçado.
45% das partículas vão pro contorno, nessa ordem, e o orbe liga uma na seguinte
como polilinha fechada. Uma figura pode ter mais de um contorno — o furo do
anel, a barriga do "D" — e cada um é traçado separado.

O que sobra vai pro interior em Poisson-disk, menor e a 50% de alpha: o interior
é textura, a borda é a leitura. Ligar ponto a ponto por distância, que era como
funcionava antes, criava arestas atravessando o meio da figura e transformava
qualquer silhueta em nuvem.

Três detalhes que vieram junto e importam mais do que parecem:

- **Partícula de contorno fica em z = 0.** Com a profundidade falsa que o
  interior usa, cada vizinha ganharia uma escala de perspectiva diferente e a
  polilinha sairia serrilhada.
- **Encaixe nos últimos 15% do morph.** O easing é remapeado pra chegar em 1 aos
  85% do tempo; daí até o fim a partícula está exatamente em cima do alvo, sem
  resíduo de interpolação. É nesse instante que o contorno aparece — desenhar a
  polilinha no meio do morph faz a silhueta parecer um elástico.
- **Em modo forma não há ruído por partícula.** Só uma respiração radial lenta,
  igual pra todas, com um quarto da amplitude da esfera. A fase por partícula
  que existia antes era exatamente o que borrava o contorno.

A esfera não mudou: ela continua com as arestas por vizinhança e as duas
passadas de brilho. O que é diferente vale só depois de `forma !== "esfera"`.

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

## O arco do 3º ano

O 3A é a última turma, e a apresentação dele fecha a expedição inteira. A ideia
é simples: **a IA fica cega.**

1. O submarino desce de 900 m à zona abissal.
2. Os quatro grupos apresentam, na ordem do trabalho deles: oceanos → sonar →
   impacto humano → ações. **As câmeras funcionam o tempo todo**, mostrando o
   abisso sob o farol.
3. Um contato de grande porte se aproxima. A água vira, o farol oscila, um
   vulto corta a luz.
4. **O olho.** A plateia vê a criatura uma vez, por três segundos, e o que ela
   vê é um olho no facho do farol. Então o vidro quebra.
5. Só agora a IA fica cega: visor destruído, câmeras offline, **só o sonar
   sobra**. Ela compila o dossiê do que os sensores captaram.
6. Sem imagem, ela **não consegue localizá-lo**. Pede à tripulação — a plateia
   — que opere o sonar auxiliar (o de papelão que o 3A construiu) e diga em
   qual setor o contato está, pra ela disparar o pulso.
7. Contato neutralizado → subida de emergência → superfície → encerramento.

> **A ordem importa, e é o ponto desta revisão.** As câmeras quebrarem na
> chegada daria à turma inteira um cenário sem janela; quebrarem no fim
> transforma a cegueira em consequência do encontro — e é o que faz a plateia
> precisar operar o sonar de papelão.

A IA nunca fala em cima dos alunos: fala antes, cala durante, fala depois. É
por isso que cada grupo tem uma cena `fala` curta de abertura e uma cena
`apresentacao` de `avanco: "manual"` logo depois, que espera a seta.

A pane global (`P`/`R`) continua funcionando, mas o 3A não usa: o visor rachado
já cumpre esse papel na narrativa, e disparar as duas coisas seria contar a
mesma história duas vezes.

### O olho

Tipo de cena novo: `olho`. Sem legenda, sem avanço manual, sem fala — a IA só
volta a falar depois que o vidro já quebrou.

```json
{ "id": "olho", "tipo": "olho", "avanco": "auto",
  "criatura": "megalodonte", "duracao": 3000 }
```

A cena tem **três tempos**, todos automáticos, ~8,3 s no total:

1. **A câmera abre grande** (1,5 s). Os dois mini-feeds saem e no lugar deles
   entra um quadro só, do tamanho da área central — o maior que cabe sem passar
   por cima do log. Estática leve por cima e o farol oscilando: a água já está
   virando.
2. **A travessia** (3 s). O corpo atravessa o facho. Ele tem **três larguras e
   meia de quadro** e o dobro da altura, então a plateia nunca vê o bicho — vê
   um FLANCO. E **não vê a cara**: o enquadramento começa com o focinho uma
   largura e meia à direita, e o que cruza a câmera é da guelra pra trás, a
   linha do dorso varrendo a tela com o corpo embaixo dela até a cauda sair.
   É aqui que a plateia **mede** o bicho; o olho sozinho não daria o tamanho.
3. **O escuro** (0,8 s). Nada. É o silêncio que faz a aparição valer — sem ele
   o olho seria a continuação da travessia em vez de uma coisa nova.

Só então **o olho**, do jeito que sempre foi.

Quatro decisões fazem a travessia funcionar, e as quatro vieram de olhar o
quadro:

- **Ele é DESENHADO, não silhueta** (`Fauna.travessia`). O vulto do `contato` é
  um relance preto; aqui a plateia tem que ver o corpo. É pintado com a `luz` e
  o `farol` do perfil — a 900 m o facho está em 0,78, então é a lanterna do
  submarino que o ilumina, que é a única luz que existe lá embaixo.
- **Composto fora e colado com a opacidade.** O bicho é desenhado em partes, e
  com alpha direto no pincel cada parte ficava translúcida em relação às
  outras: via-se a peitoral ATRAVÉS do corpo e ele virava um modelo de vidro.
  Pintado opaco num canvas próprio e colado de uma vez, o corpo é sólido.
- **A fauna comum some** enquanto ele passa (rampa de ~250 ms até 10%). Ela era
  desenhada mais opaca que ele — a fauna tem piso de opacidade e ele não — e um
  bicho enorme perde o tamanho no instante em que divide a luz com uma
  água-viva.
- **Ele escapa do mundo cilíndrico.** A projeção normal dá a volta passando de
  1,5 unidade da câmera, e isso limitava o tamanho: um corpo de 3,5 unidades
  sumia de repente com a cauda ainda no meio do quadro. A travessia projeta em
  linha reta (`semVolta`), e o corte de visibilidade usa uma margem do tamanho
  do bicho em vez dos 220 px fixos — o corte olha o CENTRO, e o centro de um
  corpo desses passa longe da borda.
- **O tronco vai duro** (`Pincel.rigidez: 1`). A ondulação da espinha já
  crescia pra trás, mas o meio do corpo ainda varria meio corpo de altura:
  invisível num bicho de 200 px, uma onda de 450 px quando ele atravessa com
  1660 px de comprimento. Com rigidez, a onda só começa no terço traseiro e a
  ponta da cauda continua varrendo o mesmo tanto — enrijecer não pode virar um
  bicho que perdeu a batida.
- **Ele entra por fade**, não por corte. Um corpo maior que o quadro não tem
  borda pra entrar; o que a plateia vê é o facho encontrando uma coisa que já
  estava ali.
- **Fica abaixo do quadro** (`y: 1`). Centrado, a tela caía inteira dentro do
  bicho e sobrava uma parede lisa — sem borda, nada diz que aquilo é um animal.
  Com a espinha no rodapé, o que cruza a tela é a linha do dorso.

E ele passa **sem olhar** (`Pincel.olhar: false`). O olho do bestiário é um
ponto estilizado feito pra ser visto com 4 px; com 760 px de corpo ele vira uma
bola de desenho animado — e apareceria dois segundos antes do plano em que o
olho é a cena inteira.

> O canvas da câmera grande é **480×304** e não 16:9 porque o `object-fit:
> cover` cortava 13% em cima e embaixo, exatamente onde estão a dorsal e a
> cauda. Medido: 60 fps durante a travessia, igual à linha de base.

Mostrar o bicho inteiro resolveria o mistério; mostrar **só o olho** deixa o
tamanho por conta de quem está assistindo. O desenho é procedural e não imagem,
e não por purismo: a cena depende de a **pupila contrair quando o farol bate**,
e isso é animação — um PNG daria um olho morto.

A linha do tempo dos três segundos: emerge do escuro (cinza, pupila dilatada) →
o farol chega e a íris vira âmbar → a pupila fecha em fenda → deriva, porque o
bicho está nadando. No fim: `impacto` + `vidro` no mesmo quadro, rachadura em
todas as câmeras, estática, e só então a IA fala.

> A resolução interna do canvas é **55%** do tamanho na tela, e isso é medido:
> os desenhos do olho somam 0,04 ms por quadro — não é a pintura que custa, é
> compositar 600 mil pixels sessenta vezes por segundo num container sem GPU.
> A 55% a cena foi de 44,7 pra 56,7 fps sem perder nada visível. É o mesmo
> truque que as câmeras usam desde o começo.

### O visor rachado

`CenaBase.visor` vale `"ok"`, `"rachado"` ou `"parcial"`, e **uma cena sem o
campo herda o da anterior**. A cena `olho` quebra o visor sozinha ao terminar —
não precisa declarar nada, e voltar uma cena com a seta esquerda reconstrói o
estado certo.

- **`rachado`** — as câmeras ficam em estática, com o rótulo `VISOR
  COMPROMETIDO`, e uma fratura procedural entra por cima.
- **`parcial`** — o conserto de emergência da subida: a imagem volta, suja, e a
  sujeira vai sumindo sozinha em ~9 s. A fratura continua lá.

A fratura é desenhada **uma vez**, no quadro em que aparece: vidro não racha
devagar. Ela fica num canvas por cima do feed, e não dentro do desenho do
mundo, porque precisa aparecer também por cima da estática — com o visor
quebrado não há imagem, mas o vidro continua na frente da lente. Cada câmera
tem a sua fratura, sempre a mesma (gerador com semente fixa).

### A trilha

Uma camada de música à parte no `AudioEngine`. Ela **entra quando o bicho
aparece**, não quando o combate começa: o tema é dele, não da mecânica. Sobe com
fade de 1,5 s na travessia da cena do olho, atravessa o dossiê e as instruções
sem reiniciar (`iniciarTrilha` só retoma o volume quando já está tocando),
**recua 6 dB enquanto a IA fala** e, no fim, **sai em fade de 3 s** — o contato
foi neutralizado e a música se despede junto com a ameaça. A cena só vira
depois que o fade termina, pra a fala do `neutralizado` não começar por cima da
música morrendo.

**A trilha tem uma janela, e ela é guardada.** Quem liga (a travessia) e quem
desliga (o fim do combate) são efeitos diferentes, e o operador atravessa isso
com a seta esquerda ou com `cena <id>` a qualquer momento — sair da cena do olho
pra trás deixava a música tocando por cima de uma apresentação de biologia. Um
efeito no Player cala a trilha sempre que o índice sai do trecho `olho` →
`neutralizado`, derivado da estrutura do roteiro e não de ids fixos. Verificado
cena a cena nas 19 do 3A, mais o caminho de voltar com a seta.

> O nível saiu de 0,42 com −9 dB de recuo, passou por 0,62 com −6 e está em
> **0,9 com −4**. As duas subidas vieram de medir: amostrando o volume a cada
> 200 ms por 51 s de combate, a 0,42 a trilha ficava no cheio 9% do tempo e
> abafada 70% — a IA fala em toda aparição, acerto, perda e retorno, e um
> ducking calibrado pra três perguntas espaçadas some numa cena que é quase
> toda fala. A comparação que fecha a conta: a **voz** toca pelo Web Audio
> direto no destino, sem nó de ganho, ou seja no nível do mp3, que é 1 — a
> trilha é um `<audio>` com `volume` absoluto, então 0,62 estava mesmo abaixo
> da voz. Medido agora: piso 0,41, teto 0,9.

O arquivo fica em `public/audio/sfx/Theme battle.mp3` e **não é embutido no
`audios.js`**: são alguns MB que em base64 crescem mais um terço, dentro de um
arquivo que o Chromebook já carrega inteiro na memória. Ela toca num `<audio>`
comum com caminho relativo, que por `file://` funciona — o que não funciona por
lá é `fetch`, e a trilha não precisa de análise de nível.

> **Não há trilha sintética de reserva.** Um sintetizador imitando música de
> suspense soaria pior que silêncio. O que não pode é ninguém descobrir a falta
> no dia: o log de carregamento diz `Trilha de combate: carregada` ou
> `WARN: trilha de combate ausente — o combate roda sem música`.

### O mostrador de sonar

`src/paineis/sonar.ts` desenha o mostrador, e **o painel do console e o combate
usam o mesmo**: o de fora é o de dentro sem as cunhas de setor. Eram dois
desenhos parecidos e não iguais, e isso aparecia — a plateia via um radar na
cena de biologia e outro no combate, e o submarino deixava de parecer uma
máquina só.

O desenho é de **instrumento**, não de radar de desenho animado. O que separa
os dois é sempre a mesma coisa:

- **anéis finos e rotulados** em metros (150 · 300 · 450 · 600 · 900 M), com o
  número por dentro do anel — centrado nele, o do último esbarrava no `180°`;
- **azimute a cada 30°** na borda, `N` no topo (a proa) e os cardeais em graus;
- **varredura com rastro de 120°**, decaindo por gradiente cônico em vez de uma
  linha dura girando;
- **ruído de fundo**: blips fracos que nascem, brilham e somem. Um mostrador
  limpo demais parece enfeite; instrumento de verdade está sempre um pouco sujo;
- **o contato** é blip + halo pulsante + **vetor de velocidade** apontando pra
  onde ele vai, com etiqueta grudada: `CONTATO · 720 M · ECO 0,96 s`. A etiqueta
  sai pro lado de fora; quando nenhum dos lados cabe, sobe ou desce — nunca por
  cima do submarino do centro;
- **o submarino no centro**, com o anel tracejado do alcance do pulso.

No combate entram as **cunhas**: um setor por fatia, com o número grande no arco
externo e o nome embaixo. A cunha do contato acende.

### Combate acústico

Tipo de cena novo: `combate`. A plateia lê o setor no sonar de papelão e o
operador aperta `1`, `2` ou `3`.

```json
{ "id": "combate", "tipo": "combate", "avanco": "manual",
  "criatura": "megalodonte",
  "setores": ["PROA", "BOMBORDO", "ESTIBORDO"],
  "rodadas": [
    { "distancia": 900, "tempo": 10 },
    { "distancia": 450, "tempo": 7 },
    { "distancia": 150, "tempo": 5 }
  ],
  "falas": { "rodada": [["..."]], "acerto": [["..."]], "erro": [["..."]],
             "perdido": [["..."]], "retorno": [["..."]], "critico": ["..."] },
  "audio": { "rodada": ["./audio/3a/combate-rodada-1.mp3"], "...": [] } }
```

| campo | o que faz |
|---|---|
| `criatura` | chave do bestiário. **Só vira blip**: a plateia nunca vê o bicho |
| `setores` | rótulos, na ordem das teclas `1`…`9` |
| `rodadas[].distancia` | metros de onde o contato NASCE. Manda na escala e no eco |
| `rodadas[].tempo` | **segundos da borda até o casco**, de verdade (ver abaixo) |
| `rodadas[].setor` | fixo; **sem o campo, sorteado** — nenhuma rodada é decorada |
| `falas.*` | listas de falas; `rodada` tem uma por rodada, o resto é sorteado |

**Não há cronômetro. O contato AVANÇA** — o relógio é ele:

1. A investida começa com o blip nascendo na borda externa de um setor sorteado
   e vindo pro centro. Não em linha reta: **zigue-zague** (duas senoides, pra
   não virar pêndulo) e **acelerando perto do centro** (`1 + perto × 0,8`) —
   um bicho que chega no mesmo ritmo em que saiu não dá aflição nenhuma. A
   distância na tela cai com ele, e os pings ficam mais rápidos e mais graves.
2. **Chegou ao centro:** apagão, −25% de casco, fala de `erro`. 1,5 s depois ele
   volta, no mesmo setor ou em outro. **Impacto não pula investida** — ele custa
   casco, e o contato continua onde estava.
3. **Setor certo:** o pulso sai naquela direção, acerta, e ele é empurrado pra
   fora em 900 ms. `CONTATO` cai 1/3, mais um terço da imagem acústica é
   revelado, o blip vira `SINAL PERDIDO` piscando e some. Vêm **2 a 3 s de sonar
   vazio** (fala `perdido`, trilha baixa, a plateia procurando) e ele reaparece
   em OUTRO setor, mais perto que a carga anterior — 900 → 450 → 150 m — com a
   fala `retorno`.
4. **Setor errado:** o pulso vai pro lado errado e se perde. Nenhuma penalidade
   além da que já é dura: ele fica **20% mais rápido** e continua vindo.
5. **Cooldown de 1,2 s** entre disparos, com a barra `RECARREGANDO PULSO` no
   painel. É regra, não enfeite: sem ela, apertar 1-2-3 em sequência acerta
   sempre e a cena vira apertar botão. Durante a recarga a tecla é **negada**
   com um clique seco (estática a 1,6× de altura) e a barra pisca em vermelho —
   sem isso a pessoa acha que o teclado falhou e aperta mais forte.

O tempo de eco mostrado é `2d / 1500 m/s` — o mesmo número que o grupo 1 explica
no painel `eco`, de propósito: se a conta na tela não batesse com a aula deles,
a cena desmentiria a apresentação.

> **O `tempo` do roteiro vale de verdade.** O laço acelera o contato perto do
> centro, e com a base ingênua — distância ÷ tempo — esse empurrão saía de
> graça: a investida de 900 m declarada com 10 s chegava ao casco em **7,0 s
> medidos**. O roteiro mentia, e quem pagava era a plateia. `velocidadeBase()`
> integra o percurso e resolve a base pra o tempo bater; medido de novo, 16 s
> declarados dão 15,8 s. A aceleração dos erros continua entrando por cima —
> errar o setor ENCURTA o tempo, e essa é a penalidade.

> A simulação (distância, desvio, cooldown) mora numa **ref**, não no estado:
> ela muda a 60 fps, e como estado seria um render do Player inteiro por quadro.
> O painel lê por função (`lerSim`) e escreve no DOM direto, igual à coluna
> d'água do mergulho.

**O bicho nunca aparece desenhado.** É o ponto da cena: a plateia vê um blip e
ouve um número, e quem traduz isso em direção é o objeto que eles construíram.
Mostrar o megalodonte resolveria a tensão e roubaria o trabalho deles.

Teclas: `1` `2` `3` disparam o pulso no setor, `Espaço` corta a fala, e **`→`
força a rodada a seguir** (válvula de segurança — não pula a cena, que perderia
o fim). `M`, `N` e `O` ficam desligados: o orbe não é o assunto ali. **O disparo
é imediato**: fora da recarga, o pulso sai no mesmo quadro da tecla — quem
apertou precisa ouvir que apertou, ou a tecla parece não ter funcionado.

Quatro coisas acontecem em volta das três perguntas:

1. **Imagem acústica progressiva.** Cada acerto compra um terço da silhueta,
   em pontos, no centro do mostrador — o sonar não *vê*, ele acumula retornos.
   No terceiro a imagem fecha e pulsa uma vez. É a recompensa por acertar, e é
   o que transforma três perguntas iguais numa sequência com progressão.
2. **Apagão no erro.** A tela cai por 400 ms, a luz de emergência pisca três
   vezes em vermelho e o HUD volta com glitch. É curto de propósito: o
   suficiente pra assustar, curto o bastante pra ninguém achar que o projetor
   desligou.
3. **Sonar vazio.** Entre um acerto e o retorno o mostrador fica sem nada por
   2 a 3 s. É a única vez na cena em que não há o que fazer, e é ela que faz a
   próxima aparição valer.
4. **O rugido.** No terceiro acerto — no golpe, não depois dele — a trilha
   **recua 14 dB** e o `rugido` entra sozinho na frente por 3,2 s. Só quando
   ele já está caindo é que a IA comenta o acerto. A ordem importa: com a
   fala antes, os dois brigam e nenhum chega à quadra.
5. **Fake-out.** Dois segundos de silêncio, um retorno solto aparece na borda
   oposta e some.
6. **A saída.** A trilha faz um fade de 3 s até zero — não um corte — e só
   então vem o `neutralizado`.

Os sons do combate têm **lado**: o whoosh grave de cada aparição é
panoramizado pelo setor do contato (proa no centro, os outros abrindo pros
lados), com a esteira de água 420 ms atrás. É o que liga o que a plateia ouve
ao que ela lê no sonar de papelão.

> **Nunca existe derrota que trave a apresentação.** Se o casco zerar, a IA diz
> a fala `critico`, a trilha corta e a cena pula direto pra `subida` — a subida
> de emergência acontece do mesmo jeito e a turma termina com as falas finais
> de sempre. Pula o `neutralizado` de propósito: aquela cena diz "ameaça
> neutralizada", e ninguém neutralizou nada. Depois da última rodada a cena
> avança aconteça o que acontecer, e qualquer erro dentro do laço (um mp3 que
> não existe, uma promessa rejeitada) também avança em vez de deixar a plateia
> olhando um sonar parado.

### Mixagem

Os números de mix moram em `src/audio/config.ts`, num lugar só: quem mexe neles
no dia é quem está ouvindo a sala, e essa pessoa precisa achar tudo junto. Cada
um aceita override pela URL, porque no dia não dá pra recompilar.

| ajuste | padrão | URL |
|---|---|---|
| `AUDIO.voz.ganho` | `0.63` (−4 dB) | `?voz=0.6` |

A voz saía no nível cheio do mp3, direto no destino, sem nó de ganho — à frente
de tudo, inclusive da trilha, que é um `<audio>` com `volume` absoluto e não
tinha como competir. O `GainNode` entra **depois do analisador**, de propósito:
quem move o orbe é o nível da voz, e baixar o volume da sala não pode encolher o
orbe. A linha de diagnóstico passa a dizer o ganho em uso (`voz 0.63 (-4.0 dB)`) —
se alguém abrir com `?voz=0.3` e esquecer, o log denuncia.

### O dossiê

Painel `dossie <chave>`: a variante do `ficha` com estética de arquivo
classificado — carimbo `ESTIMATIVA DOS SENSORES` piscando, silhueta se
desenhando da esquerda pra direita em 600 ms (como plotter) e os dados entrando
linha a linha, no ritmo da fala. Depois de fechar o traço, a silhueta **continua
nadando**, com a mesma batida da câmera.

**Com foto, o painel não anima nada.** A foto é estática: só um fade de 400 ms
e uma scanline fixa por cima — nenhum transform, nenhum ruído, nenhum glitch.
Uma reconstrução científica que treme lê como render de videogame e o painel
inteiro perde a autoridade que os dados dele têm. A fonte do tremor era a
animação genérica de abertura de painel (`transform` + `clip-path`): transform
no pai deforma tudo que está dentro, inclusive a imagem. No dossiê ela vira só
opacidade.

**A silhueta desenhada é a reserva pra quando NÃO há foto.** Com foto ela sai:
duas versões do mesmo bicho lado a lado disputavam o olho, e a que vale é a
foto. Aí o painel vira duas colunas — a imagem ocupando a esquerda inteira, de
cima a baixo, os dados na direita — e o crédito atravessa a última linha.

> A imagem é um recorte em pé com fundo transparente, então o `object-fit` é
> `contain`: cortar um recorte come o focinho ou a mandíbula. E o filtro do
> painel perdeu o `hue-rotate(155deg)` — ele existia pra puxar uma foto em cores
> naturais pro ciano do HUD, e uma foto que já chega azul-esverdeada ia parar no
> magenta.

Quando existe uma imagem de reconstrução em `src/formas/dossie/<chave>.jpg`,
ela entra acima da silhueta com o rótulo `RECONSTRUÇÃO DOS SENSORES`, e o
**crédito é obrigatório** — vem do campo `credito` da ficha e aparece no rodapé
do painel. É condição das licenças CC e, mais do que isso, é o que estamos
ensinando a fazer numa feira de ciências.

A pasta pode estar **vazia**: o carregamento usa `import.meta.glob`, e não um
`import` direto, justamente pra o build não quebrar enquanto a imagem não
chega. Sem ela, o painel mostra só a silhueta e funciona igual.

**Os dados são reais e as estimativas estão marcadas como estimativas.** Um
bicho extinto tem número incerto, e inventar precisão num painel que a plateia
lê como fonte seria ensinar a coisa errada. O que está lá: período
Mioceno–Plioceno, comprimento estimado 15–20 m (*estimativas variam*), dentes
até ~18 cm, status extinto. Nada além disso.

A silhueta é desenhada pela **mesma função do bestiário** que a câmera usa, e
não pelo amostrador de silhuetas do orbe: o amostrador devolve uns quatrocentos
pontos de contorno, e ligá-los por reta nesse tamanho transformava o tubarão
num amontoado. Ele existe pra virar partícula, não pra virar traço.

### A aproximação

A cena `contato` liga três coisas ao mesmo tempo, e nenhuma delas é fala:

- **No sonar**, um contato enorme vem da borda ao centro em 6 s, com o ping
  acelerando (1,1 s → 0,17 s entre pings) e **ficando mais grave** — a altura
  caindo é o que a plateia lê como "está chegando" sem precisar de legenda.
- **No mundo**, `motor.agitacao` sobe de 0 a 1: o farol oscila, o sedimento
  entra em turbilhão e a imagem treme.
- **Aos 3,4 s**, um vulto cruza o facho: a criatura em silhueta, rápida e
  escura. Um relance, não uma aparição — é o que faz o olho, dois passos
  depois, parecer perseguição e não truque.

### Ameaças no mundo

`CenaBase.ameacas: true` liga três elementos procedurais, cada um na sua faixa:
**rede fantasma** (1000–3000 m), **plástico à deriva** (200–1000 m) e **coral
branqueado** (0–200 m — são os mesmos corais de sempre, repintados de branco:
não morreram nem sumiram, perderam a alga que lhes dava cor).

Só a cena `subida` do 3A liga isso, e **não há fala explicando**: os grupos 3 e
4 acabaram de falar disso, e a IA repetir seria tirar deles a fala. Como
`visor`, o campo é herdado pela cena seguinte — por isso o `encerramento`
declara `"ameacas": false` pra voltar à superfície limpa.

### Efeitos novos

`vidro` (o estalo curto com cauda de caquinhos), `pulso` (varredura descendente
saturada — a arma), `impacto` (transiente + o casco respondendo grave),
`whoosh` (a massa de água que ele empurra, com Doppler barato) e `agua` (a
esteira que fica depois).

`rugido` é gravação, não síntese: o mp3 original foi cortado no ataque (o
primeiro segundo era só respiração subindo), passado por um passa-baixa em
4,2 kHz e um eco de abismo, e normalizado pro pico dos outros efeitos gravados
— **−1,15 dBFS**, o mesmo do `impacto`, com RMS de −13,3, o mesmo do canto da
baleia. Existe um sintetizado de reserva, mas ele só entra se a gravação não
estiver embutida.

> A primeira versão dele era bem mais discreta: decaía 22 dB pra soar
> "indo embora", e tocava por baixo do fade da trilha, no fim da cena. **Não
> dava pra ouvir.** Som que é acontecimento precisa de três coisas ao mesmo
> tempo — estar alto, estar no momento do acontecimento, e ter o palco vazio.
> Faltavam as três.

O sintetizado de reserva também já esteve quebrado, e de um jeito que vale
registrar: ele usava o `envelope()` dos outros efeitos, que é **percussivo** —
uma rampa exponencial de 74 dB até quase zero. Numa pancada de 0,2 s isso é
certo; num rugido de 4 s, a curva passa quase todo o tempo perto do fundo.
Medido num render offline: **−16 dB aos 0,5 s e −45 dB aos 2 s** — o comecinho
e mais nada. Agora o ganho é escrito à mão, com corpo declarado: ataque em
0,3 s, sustentação até 2,6 s caindo só 3 dB, e a saída em dois trechos (uma
rampa direta pro zero despenca 20 dB no primeiro quarto do caminho, e o que se
ouve é um corte). Medido de novo: **−10,5 dB aos 0,5 s, −13,8 aos 2,5 s,
−27,6 aos 3,5 s**.

> **Quando a reserva entra?** Quando a gravação não está embutida no
> `audios.js` — e aí ela entra pra TODOS os efeitos gravados, não só pro
> rugido. É mais um motivo pro `audios.js` estar versionado.

> Ele toca **sem panorâmico**, e isso não é descuido: `tocarSfx` manda pro
> caminho sintético todo efeito com `pan`, porque um `<audio>` não tem pra onde
> apontar. Com lado, tocaria a imitação em vez da gravação — e centralizado é o
> que um som que se afasta faz mesmo: ele não passa por um lado, fica longe.

E `presenca`, o do olho: **infrassom de verdade**, 28 Hz de fundamental, abaixo
do que a maioria das caixas reproduz como nota. O que chega à plateia não é um
tom — são os harmônicos e a batida entre a fundamental e uma vizinha a 29,1 Hz.
O waveshaper suave nos primeiros 2 s é o que impede o infrassom de sumir: sem
distorção, 28 Hz num alto-falante pequeno é silêncio; saturando, a fundamental
vaza pros harmônicos e o ouvido reconstrói o grave que a caixa não emite (é o
mesmo princípio da *missing fundamental*). Nada nele pode assustar sozinho: o
susto é o `impacto` no fim da cena, e espera que grita perde o corte.

### Tela final

Tipo `fim`: título, subtítulo e uma nota, sem avanço automático e sem próxima
cena. É onde a apresentação termina e **fica**, enquanto a plateia aplaude.

## O arco do 2º ano B

O 2B é a turma do meio, e a apresentação dele tem um arco próprio: **a IA
quebra.** Não por acidente de roteiro — quebra logo depois de o grupo 2
explicar que inteligência artificial pode gerar informações incorretas. É a
única vez na expedição em que o sistema erra, e ele erra na deixa.

1. O submarino desce de 900 m a 1800 m. A tripulação entra com tudo saudável.
2. **Grupo 1** (temperatura e submarinos) apresenta. Durante a cena a água
   esfria na barra do HUD e o log solta avisos âmbar, espaçados. Sem som e sem
   fala.
3. **Grupo 2** (IA e efeito estufa). Ao fim, a IA tenta seguir, processa e
   quebra: tela de falha travada, três subsistemas offline.
4. **Grupos 3 e 4** apresentam com o submarino avariado — três luzes vermelhas
   no canto, moldura pulsando, câmeras sujas. A fala do grupo 3 devolve casco e
   sonar; a do grupo 4 dá a ideia do resto.
5. **Hidrofone**: a plateia identifica três sons. O terceiro é o canto da
   baleia, e é a frequência dele que a IA usa pra alcançar a superfície.
6. Comunicação de volta, rota recalculada, transição pro 3A a 3000 m.

Poemas e músicas são dos alunos, ao vivo: **o sistema não mostra letra nem toca
trecho de nada.**

### Sementes da pane

Campo `sementes` em qualquer cena: `agua: [8, 4]` faz a leitura de temperatura
descer de 8 °C a 4 °C ao longo da cena, e `avisos` entram no log espaçados.

A queda leva quatro minutos — a ordem de grandeza de uma apresentação de grupo.
Se o grupo falar menos, a água não chega no fundo da faixa, e tudo bem: o que a
cena precisa é que ela esteja CAINDO, não que chegue num número. O validador
recusa uma faixa que começa e termina no mesmo valor, porque aí a leitura é só
ruído no HUD.

> A leitura vai direto no DOM, como a profundidade. Um número que muda sozinho
> durante uma cena de dez minutos, como estado do React, seriam milhares de
> renders do Player inteiro por apresentação.

**Nada disso faz barulho.** A plateia não tem que PERCEBER a água esfriando —
tem que reconhecer, depois que a IA quebrar, que já estava ali.

### Tipo `emergencia`: a pane que não congela

A pane global (`P`/`R`) congela a apresentação inteira e espera o operador
reiniciar. Esta é o contrário: **a apresentação continua, o submarino é que
está avariado.** Por isso é uma cena e não uma tecla — a quebra tem hora
marcada no roteiro — e por isso o estado dela atravessa as cenas seguintes.

A cena tem três tempos. A IA fala normalmente ("Processando informações..."),
a tela de falha trava alguns segundos, e ela volta em modo reduzido.

> **A tela de falha só aparece no tempo 2.** Na primeira versão ela entrava
> junto com a primeira fala, e entregava o susto antes de ele acontecer: a
> plateia via FALHA DE SISTEMA enquanto a IA ainda dizia calmamente que estava
> processando. É a naturalidade da fala que faz a quebra funcionar.

Enquanto o modo reduzido está ligado, em QUALQUER cena:

| efeito | onde |
|---|---|
| três luzes vermelhas no canto | `LuzesEmergencia`, renderizada pelo Player |
| moldura pulsando vermelho (2 s) | classe `hud--emergencia` |
| câmeras dessaturadas, retículo off | CSS sobre o `.feed__canvas` |
| grão triplicado nas câmeras | `motor.avaria` |
| **orbe VERMELHO**, 45% mais lento | prop `avariado` do orbe |
| uma linha de erro a cada ~20 s | efeito no Player |

**Nada disso faz som** — de fundo. O que muda é a VOZ: enquanto o sistema
está quebrado, a fala da IA sai avariada, e sai nos dois jeitos de o
submarino quebrar (a pane global `P` e o modo reduzido do 2B). A legenda
tremendo diria isso só pra quem está lendo.

O glitch são três efeitos somados, e a escolha dos três é toda em favor de
continuar **inteligível** — uma IA quebrada que a plateia não entende não
conta história nenhuma, só irrita:

| efeito | o que faz | por que não atrapalha |
|---|---|---|
| trêmulo a 11 Hz | lê como aparelho falhando | mexe no volume, não no espectro |
| anel a 62 Hz, mistura 16% | põe a borda digital, o "robô" | mistura baixa: colore sem mascarar |
| quedas de 35–70 ms | o sinal some e volta | caem a **30%**, nunca a zero |
| teto em 5,2 kHz | abafa | é onde a voz estava antes de eu abrir a banda |

Queda a zero comeria sílabas inteiras, e é exatamente aí que a fala se perde.

> A cadeia fica **depois do analisador**, entre ele e o ganho da voz. Se
> viesse antes, cada queda de sinal encolheria o orbe junto — e o que a
> plateia veria seria a IA gaguejando de tamanho.

Os grupos 3 e 4 apresentam por cima disso, e um alarme tocando por dez
minutos atrás de alunos falando deixa de ser cenário.

> **O orbe fica vermelho até o hidrofone.** Ele É a IA na tela: deixá-lo da cor
> de sempre, só um pouco mais escuro, contava a avaria apenas pra quem
> estivesse olhando as luzinhas do canto. A paleta é mais escura que a da pane
> global, que é um alarme de dez segundos — esta fica no ar durante duas
> apresentações inteiras. E o escurecimento caiu de 40% pra 20%, porque agora
> quem conta a avaria é a cor, não a falta de luz.

As luzes NÃO são um painel do Diretor: painel tem prazo e fecha com `Esc`, e a
avaria não tem prazo. A janela de vida delas é derivada da estrutura, como a da
trilha do 3A — da cena de `emergencia` até a cena logo depois do `hidrofone`.
Sem essa guarda, voltar com a seta esquerda deixaria três luzes vermelhas em
cima de uma apresentação que ainda não quebrou.

### Reparos: a fala dos alunos conserta o submarino

Campo `reparos` na cena: `{ tecla, subsistema, fala, audio }`. O operador
aperta `1` ou `2` quando o grupo chega no trecho que justifica o reparo, a IA
fala, a luz vai de vermelho a âmbar a verde em 1,2 s e o log registra
`CASCO: ONLINE`.

**Tecla e não temporizador**, porque o relógio não sabe quando o grupo chegou no
empuxo — eles podem demorar o que quiserem. Tecla já usada é ignorada: apertar
de novo não repete a fala nem acende nada.

O passo âmbar no meio não é enfeite: vermelho → verde direto lê como uma luz
trocando de cor, e vermelho → âmbar → verde lê como um sistema religando.

> Não há conflito com `1 2 3` do quiz: o quiz não existe no roteiro do 2B. E
> não há com o combate, que é do 3A. O validador confere que cada reparo aponta
> pra um subsistema que existe na cena de `emergencia` — um reparo apontando
> pro nome errado não acenderia nada e não reclamaria, que é o tipo de erro que
> só aparece na feira.

### Tipo `hidrofone`: identificar pelo som

A irmã da identificação do 2A, com uma troca de sentido: lá a plateia reconhece
pela forma, aqui pelo ouvido. Sem erro, sem timer e sem barra — **a única
pressão é a luz vermelha da comunicação no canto.**

O centro da tela é um **espectrograma** rolando da direita pra esquerda,
desenhado do próprio áudio por um `AnalyserNode`. Ele mostra o que o ouvido já
ouviu: a chuva vira uma faixa larga e agitada, o navio vira listras grossas e
REGULARES no grave, a baleia vira riscos que sobem. Quem não reconheceu pelo
som reconhece pelo desenho, e quem reconheceu vê o porquê.

Ele **congela** na revelação em vez de limpar: a imagem do som que acabou de
tocar é a prova, e apagá-la no instante do acerto jogaria fora justamente a
ligação entre o que a sala ouviu e o nome que ela gritou.

Ao identificar, abre um mapa pequeno com a fonte, a distância e — o dado que
justifica a cena — **quanto o som levaria pra chegar de verdade**, a 1500 m/s:
a chuva a 1,2 s e o canto da baleia a 8 min 53 s.

> O analisador é SÓ do hidrofone, separado do da voz. Se fosse o mesmo, o
> espectrograma passaria a desenhar a locução da IA entre um som e outro — e o
> que a plateia precisa ver ali é o som que ela está tentando identificar.

Os três sons são sintetizados em `src/audio/hidrofone.ts`, cada um construído
em cima do único traço que o identifica:

- **chuva** — ruído de banda larga na faixa da gota (bandpass ~4 kHz) com
  micro-envelopes. A granulação não vem de disparar mil fontes (isso derrubaria
  o quadro): vem de um buffer já multiplicado por micro-pulsos na geração, uma
  vez só, na entrada da cena.
- **navio** — ruído cortado em 200 Hz modulado a 1,5 Hz mais um tom de 60 Hz. O
  que entrega a máquina é a REGULARIDADE, então a modulação é um oscilador
  exato e não um envelope sorteado.
- **baleia** — frases de glissando com harmônicos e reverberação longa,
  separadas por silêncio. O silêncio é parte do som: um glissando contínuo vira
  sirene.

Se existir `public/audio/sfx/hidro-<id>.mp3`, o motor prefere o arquivo. O
sintetizado é o plano que funciona sem ninguém baixar nada — e o validador
recusa um som cujo `id` não tenha sintetizador nem mp3, porque isso deixaria a
plateia olhando um espectrograma mudo.

> **Hoje a chuva e a baleia são gravações**, fornecidas pela professora e
> livres de direitos: `hidro-chuva.mp3` (10 s, recortado de um trecho estável
> e com a cauda cruzada sobre a própria cabeça, pra o laço não ter emenda
> audível) e `hidro-baleia.mp3` (6 s). Os dois em mono — o hidrofone é UM
> sensor — e nivelados com o navio: média de −15,2 e −13,3 dBFS contra os
> −16 do sintetizado. Os sintetizadores dos dois continuam no código como
> plano B.
>
> **O navio continua sintetizado, e na versão ANTIGA.** A versão com a batida
> funda, que a medição aprovou (modulação de 1,4 para 7,0), soava
> helicóptero: hélice no ar bate seca e separada, hélice na água é abafada, e
> o que chega ao hidrofone a doze quilômetros é um zumbido ondulado. O número
> melhor não era o som melhor.

> **Os três foram medidos, não ouvidos por cima.** Renderizando cada um por 6 s
> num `OfflineAudioContext`, com o mesmo compressor da saída de efeitos:
>
> | som | rms | pico | crista | modulação | silêncio |
> |---|---|---|---|---|---|
> | chuva | 0,160 | 0,97 | 6,1 | 1,4 | 0% |
> | navio | 0,169 | 0,89 | 5,3 | 7,0 | 4% |
> | baleia | 0,281 | 0,67 | 2,4 | 34,3 | 20% |
>
> Cada coluna é o traço do bicho. A **crista** alta da chuva são as gotas
> saltando acima da média — é o crepitar. A **modulação** do navio é a hélice
> batendo. O **silêncio** da baleia são as pausas entre as frases.
>
> Duas coisas só apareceram na medição. A chuva **estourava**: as gotas são
> somadas no buffer e o pico batia em 1,53, e o compressor da saída ataca em
> 3 ms enquanto a gota dura 1 a 4 ms — ele não pegava esses picos. Agora o
> buffer passa por uma saturação suave e é normalizado na origem. E a hélice do
> navio **não batia**: a modulação medida era 1,4, porque o tom do motor
> entrava por fora do modulador e preenchia justamente os vales entre as pás.
> Passando o motor por dentro, foi pra 7,0.

### O que vale como acerto

Nas duas dinâmicas de gritar a resposta, quem julga é o operador — e ele decide
em dois segundos, no escuro, com a sala falando junto. A lista de `aceitos` da
espécie ou do som atual aparece no topo do overlay `H`, que é onde ele olha.

## A ordem do 2º ano A

```
entrada (50 m) → bio-intro → bio (120 m)
→ arte-intro → arte (300 m)
→ ident-intro → ident (450 m)
→ ef-intro → ef (600 m)
→ transicao-2b (mergulho 600 → 900 m)
```

> A identificação move o submarino: cada espécie tem a profundidade dela (a
> tartaruga a 20 m, a baleia a 40 m). No fim da dinâmica ele **volta pros 450
> da cena** — sem isso ficava onde a última espécie parou, e a cena seguinte
> abria a 40 m com o `ef` puxando 560 m de uma vez. A expedição desce; ela não
> sobe pra ver um bicho e esquece de voltar.

A ordem não é arbitrária: ela sai de duas coisas que os alunos escreveram e
que só cabem juntas nesta sequência.

- O grupo de **Arte** termina com a fala da DOMI IA, e é ela que dá a deixa
  pra identificação — por isso `ident-intro` abre com "Confirmado. Demonstração
  de identificação de espécies." e vem logo depois de Arte.
- O grupo de **Educação Física** fecha com "agora pode passar para a próxima
  etapa com o 2B". Eles assumem que são os últimos do 2A — então são.

Daí a `transicao-2b` não repete o que eles acabaram de dizer: ela só executa.
A IA não anuncia a transferência, ela faz.

> **A cena `ident-fim` deixou de existir.** A linha "Banco de espécies
> recalibrado" foi pra abertura do `ef-intro`, que é a cena seguinte à
> identificação — e é justamente uma cena além dela que o painel `cache` ainda
> vive, então o contador continua fechando em 240.112 na frente da plateia. Uma
> cena só pra dizer uma frase, com outra logo atrás dizendo "nossa expedição
> continua", era uma pausa a mais entre a dinâmica e o próximo grupo.
>
> A segunda linha dela ("Sonar operando com referência completa") saiu junto.
> Era [nova], minha, e não sobreviveu ao corte.

### A cena `ef`

`apresentacao` manual, orbe em palco, formas `mergulhador · prancha · onda ·
barco`. **Nenhuma fala da IA dentro dela**: os quatro alunos conduzem tudo,
cooperação → equilíbrio → agilidade → Scape Room, inclusive o resultado do
jogo. O sistema só dá apoio, e só quando o operador pede.

**Painel `cronometro`** (genérico) — `cronometro 20` no console, ou a tecla
`T`, que abre o console com o comando já começado. Contador grande, ping de
sonar a cada 5 s, ping duplo no fim, e ele se fecha sozinho 3 s depois de
zerar.

> A IA **não** conta junto. Quem conduz o exercício é o aluno na frente da
> plateia, e uma voz de bordo contando por cima tiraria dele a única coisa que
> ele tem pra dirigir: o tempo.
>
> E os relógios de saída morrem com o painel. Sem isso o `aoFechar` agendado
> sobrevivia à desmontagem e fechava o que estivesse aberto três segundos
> depois: medido, abrir o enigma logo após um cronômetro zerado fechava o
> enigma sozinho.
>
> E o `T` não captura dígitos soltos. As teclas `1`–`4` já têm dono em cena (o
> setor do combate, o reparo do 2B, a dica do enigma) e disputá-las aqui seria
> ganhar um atalho e perder três.

**Painel `enigma`** — o Scape Room. Quatro slots vazios, as teclas `1`–`4`
revelam cada dica conforme os alunos lêem, e o cronômetro de 30 s **só começa
no `Enter`** — depois que a Pessoa 4 terminar de ler. Um relógio correndo por
cima de alguém lendo é pressa, não tensão. No fim: ping duplo, os slots piscam
juntos, `TEMPO ENCERRADO`, e o painel fica aberto.

> **O nome do objeto não aparece em lugar nenhum da tela.** Garrafa PET, copo
> plástico, isopor e pilha ficam só no overlay `H`, que é do operador. A
> resposta é dos alunos, dita por eles, com o objeto na mão — pôr o nome no
> painel entregaria o jogo pra quem está lendo.

## Expedição de identificação (2A)

Tipo de cena novo: `identificacao`. Substitui o quiz do 2A. O banco de espécies
do submarino corrompeu na descida — `CACHE DE ESPÉCIES: 0 / 240.112` — e a IA
precisa que a tripulação identifique o que a câmera está captando. A água está
turva: só uma silhueta se movendo. A IA dá três pistas, **da mediana pra fácil**,
e a plateia grita o nome. `Enter` confirma, `X` revela sem acerto.

É o contrário do quiz que substitui: ninguém escolhe entre alternativas e
ninguém erra. O que muda com o tempo não é a chance de acertar, é o TAMANHO da
recompensa — e a recompensa é ver o bicho. Especificação completa em
[`docs/2A_IDENTIFICACAO.md`](docs/2A_IDENTIFICACAO.md).

| campo | o que faz |
|---|---|
| `especies[].id` | chave do PNG, da ficha e da forma do orbe |
| `especies[].aceitos` | sinônimos que valem como acerto (referência do operador) |
| `especies[].pistas` | exatamente 3, da mediana pra fácil |
| `especies[].intervaloPistas` | segundos entre pistas |
| `especies[].curiosidade` | o que a IA fala sobre o bicho na revelação |
| `especies[].ambiente` | `recife`, `mangue` ou `aberto` — dá a cor da água |
| `especies[].incrementoCache` | quanto o cache sobe. A soma fecha em 240.112 |

> O validador recusa menos de três pistas, lista de `aceitos` vazia, espécie
> sem `curiosidade`/`audioCuriosidade` e soma de incrementos que não fecha o
> total: sem a soma exata, o contador pararia num número quebrado depois da
> última espécie.

**Enter nunca pula a cena, e nunca fica sem efeito.** Enquanto a tecla só valia
na fase de busca, um Enter apertado DEPOIS de revelar caía no `avancar()`
genérico e mandava a expedição inteira pro 2B com três espécies por mostrar.
E durante a fala de resultado ela não fazia nada, o que numa cena em que a
tecla é a única coisa que o operador controla lê como travamento. Agora ela
vale o tempo todo: na busca confirma, na revelação corta a fala e a
contemplação e vai pra próxima espécie. Quem sai da cena é o laço, quando a
quarta termina — e aí o `ef-intro` fala "banco de espécies recalibrado" e a
expedição segue pra Educação Física.

> Consequência: **a seta direita não pula a cena de identificação**. A saída de
> emergência dela é o console (`cena transicao-2b`).

**A primeira pista sai junto com o contato.** Esperar os 7 s valia quando as
espécies eram difíceis; com tartaruga e golfinho a sala responde em três
segundos, e a dinâmica acabava sem NENHUMA pista ter aparecido na tela.

**As espécies são genéricas de propósito** — tartaruga, golfinho, tubarão,
baleia. Nomes de espécie (tartaruga-verde, baleia-jubarte) pedem da plateia uma
precisão que ela não tem, e a dinâmica é gritar o nome, não acertar o táxon. As
pistas e as fichas valem para o grupo inteiro.

**As pistas ficam na tela na revelação**, ao lado do bicho. É ali que a sala
liga o que ouviu ao que está vendo; sumir com elas na hora do acerto jogaria
fora justamente essa ligação.

**Na revelação a IA fala sobre o bicho.** Acertar o nome é o clímax da
dinâmica, mas o nome sozinho não ensina nada — e é justamente no segundo em que
a plateia acabou de gritar "tartaruga" e está vendo a tartaruga que ela escuta
melhor. Campo `especies[].curiosidade` (falas) + `audioCuriosidade` (mp3),
exigidos pelo validador: uma espécie sem narração passaria batida e a cena
perderia o único momento de conteúdo que tem.

A narração entra DEPOIS da fala de `acerto`/`revelado` e antes da
contemplação, que caiu de 4 s pra 1,6 s — quem segura a cena agora é a fala,
e somar os dois deixava a plateia parada olhando um bicho em silêncio. `Enter`
corta narração e contemplação de uma vez (as duas estão dentro do mesmo
`Promise.race`), então quem já entendeu não fica preso.

> O laço de pistas precisou de uma trava própria pra isso funcionar. Ele
> parava quando `refRespostaIdent.current` ficava nulo — mas a revelação REARMA
> esse ref pra poder ser cortada, e o laço voltava a rodar por baixo e disparava
> a pista seguinte por cima da narração. Medido: revelação da tartaruga durava
> 4,0 s contra os 22,5 s do golfinho, a primeira espécie perdendo a fala
> inteira. Agora o laço tem um `procurando` local, que a resposta desliga e
> nada religa.

### O animal: PNG + warp de tiras

O bestiário procedural desenha bem um vulto passando no facho, mas aqui a
plateia precisa RECONHECER a espécie — e reconhecer uma tartaruga-verde por um
polígono é pedir demais. A forma vem de um PNG de silhueta
(`src/formas/especies/<id>.png`, bicho olhando pra DIREITA, fundo transparente)
e o movimento vem do código, em `src/mundo/sprites.ts`.

A imagem é fatiada em **24 tiras verticais** e cada tira é deslocada em y por um
seno cuja fase atrasa da cabeça pra cauda: uma onda viajante percorrendo o
corpo, o mesmo princípio da espinha do megalodonte aplicado a pixels. Por cima
disso: rolagem de ±4°, respiração de ±2% e nadadeiras com seno próprio.

> **O PNG precisa ser um contorno ÚNICO**, com as nadadeiras fazendo parte da
> linha. As primeiras silhuetas provisórias montavam o bicho com polígonos
> soltos, e no warp elas se separavam do corpo: a tartaruga virava um casco
> cercado de espinhos flutuando. Nada pode se soltar porque nada é separado.
>
> E a pose tem que ser a que IDENTIFICA a espécie: a tartaruga é vista de cima,
> porque de perfil ela não se reconhece — casco arredondado, cabeça saindo do
> pescoço e quatro remos largos, não quatro espinhos.
>
> **E o contorno é CURVO, não um polígono de poucos pontos.** As silhuetas de
> golfinho e tubarão saíam com uma cunha afiada no lugar da cabeça: com poucos
> vértices todo trecho vira reta, e a cabeça era onde isso aparecia. Agora o
> contorno passa por uma spline (Catmull-Rom) e um ponto repetido três vezes
> vira canto vivo — a ponta de nadadeira continua ponta enquanto o corpo e a
> cabeça ficam redondos.
>
> Duas regras de desenho valeram mais que a curva:
> **a cabeça ocupa os últimos ~15% do bicho**, não um terço (enquanto o corpo
> começava a afunilar no meio, qualquer cabeça virava cone), e **cada espécie
> tem UM detalhe que a entrega** — no golfinho, o vinco entre o melão redondo
> e o bico curto e rombudo.
>
> **O tubarão não saiu à mão.** Mesmo com curva e cabeça curta, ele continuava
> errado de um jeito que só uma referência resolve: a caudal que eu desenhava
> era de tubarão-tigre, lóbulo de cima comprido e fino, quando a do branco é
> quase meia-lua com os dois lóbulos grandes. A professora mandou uma prancha
> de perfil, e a silhueta vem dela: `scripts/silhueta_de_prancha.py` acha o
> FUNDO por inundação a partir da borda em vez de usar limiar de brilho — num
> bicho de barriga branca sobre fundo branco, limiar comeria a barriga — e o
> que sobra é o bicho, espelhado pra orientação canônica, com 7% de folga em
> cima e embaixo pra o warp não cortar nada no deslocamento.
>
> A prancha é referência de forma, não arte final: a silhueta segue provisória
> até os PNGs CC0 do PhyloPic, que continuam na lista de pendências.

Três coisas custaram caro e valem estar escritas:

- **Nada de `ctx.filter`.** A primeira versão aplicava brilho por tira, e o
  canvas `filter` monta um passe de composição por desenho: medido, **14 fps**
  contra os 60 de agora. O sprite é pintado num canvas de apoio e a luz entra
  numa passada só, com `source-atop` — que de quebra é o "contraluz do farol +
  brilho na borda superior" que o roteiro pede.
- **A nadadeira tem que morrer nas bordas.** A primeira versão deslocava a
  região inteira em bloco, e como as regiões atravessam o corpo o bicho se
  despedaçava em faixas. Agora o deslocamento é afinado por seno nos dois eixos
  dentro da região: ela flexiona pra fora do corpo em vez de rasgá-lo.
- **E tem que ser PEQUENA.** Mesmo afinada, uma região grande com amplitude
  alta faz metade do bicho balançar por quadro: em dois quadros separados por
  120 ms ele virava outro animal. Sobrou uma só, a peitoral da jubarte, com
  amplitude modesta. O resto do movimento vem da onda do corpo, que é estável.

**Escala relativa é conteúdo, não enfeite**: a tartaruga cabe no quadro com
folga e a jubarte passa das bordas. É assim que a plateia entende que uma é do
tamanho de uma mesa e a outra de um ônibus. Mas quanto maior o bicho, MENOS ele
passeia pelo quadro — a 1,7 largura e com excursão fixa, a jubarte vivia com a
cabeça ou a cauda de fora, e como a revelação é o prêmio da dinâmica, um bicho
sempre cortado no fim é o contrário do que a cena precisa. O comportamento
também é por espécie: a tartaruga rema devagar, o golfinho é nervoso, o tubarão
tem onda longa, a jubarte é lenta.

### Água turva

`motor.turbidez` (0 a 1) e `motor.tom` (`recife` · `mangue` · `aberto`), com
transição de 1,5 s. O desfoque é feito encolhendo o quadro e devolvendo
ampliado — o "blur por baixa resolução" do roteiro, e de graça: dois
`drawImage` contra um `filter: blur` que num Chromebook sem GPU custaria caro.
Depois vem a lavagem de cor e só então as partículas, que ficam POR CIMA do
borrão: sujeira perto da lente é nítida, e é ela que entrega que o problema é a
água, não a câmera. Console: `turbidez 0.8`.

O animal é desenhado **dentro** da câmera, entre a fauna e a turbidez, e não na
camada da cena. Se fosse por cima, a plateia veria um bicho nítido atrás de um
vidro embaçado — e a dinâmica inteira depende de não dar pra reconhecer.

### Painel `cache`

Odômetro com rolagem de dígitos, barra e quatro slots que vão se preenchendo com
a silhueta de cada espécie. Fica no canto superior direito durante toda a cena,
renderizado pela CENA e não por `setPainel`: assim nenhum painel do Diretor o
fecha no meio da dinâmica. Ele sobrevive uma cena além da identificação, porque
é na cena seguinte que a IA diz "banco recalibrado" e o contador fecha em 240.112
— mesmo que alguma espécie tenha sido revelada pelo operador e valido metade.

## Dinâmicas: quiz e verdadeiro/falso

> Os tipos `quiz` e `vf` continuam no código e testados, mas **saíram do
> `2a.json`**: a professora tirou a calibração do sonar do roteiro do 2A. Eles
> ficam de pé pro 2B.

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
submarino **desce ou sobe animado** até lá, com o número do HUD tickando. Cena
sem o campo herda a da cena anterior. Quando o salto é grande, uma ação de linha
pode transformá-lo na sequência de mergulho — ver abaixo.

Referência pra quem preencher os JSONs do 2B e do 3A (provisório, ajustável):

| Turma | Faixa | Cenas |
|---|---|---|
| **2A** | 50 → 900 m | `entrada` 50, `bio` 120, `ef` 300, `arte` 450, `ident` 600, `transicao-2b` 900 |
| **2B** | ~900 → 3000 m | começa onde o 2A parou e desce até a batipelágica |
| **3A** | ~3000 → 5500 m | chega ao abissal; a **cena final volta pra 0** (retorno à superfície) |

### Mergulho

Mudar de profundidade era um número tickando no HUD. Agora, quando a distância
passa de **100 m**, vira uma sequência com peso — é o que transforma "próxima
cena" em "estamos descendo":

| fase | duração | o que acontece |
|---|---|---|
| aviso | 0,5 s | log de bordo: lastro, vedação, destino |
| inclinação | 1,0 s | a proa baixa; o HUD inteiro inclina 1,5° |
| descida | 2–4 s | a água corre, o casco estala, o número sobe com easing |
| estabilização | 0,7 s | o casco passa do ponto e volta |

A sequência é disparada por uma ação de linha
(`{ "tipo": "mergulho", "para": 900 }`), então ela cai no ponto da fala em que a
IA diz que vão descer. `→` cancela: `src/diretor/mergulho.ts` é função pura do
tempo decorrido, sem estado escondido, e cancelar é parar de chamar.

Durante o mergulho aparece a **coluna d'água** na borda esquerda: as quatro
zonas empilhadas, o submarino descendo, o alvo tracejado e bolhas subindo. Cada
zona ocupa um quarto da altura e **não** a fatia proporcional — numa régua
linear a eufótica, onde a apresentação inteira acontece, teria 3% da coluna e
seria ilegível. É infográfico, não instrumento de medida.

> **Custo medido, e ele não fecha.** Em headless neste container (sem GPU,
> render por software) a linha de base é 58,5 fps; o mergulho puro cai pra 54,5
> e o mergulho com o mapa aberto pra **50,8 fps**. O culpado dominante é a
> inclinação do HUD — `transform: rotate(1.5deg)` na moldura inteira custa ~7
> fps, e `will-change` não ajudou porque não há GPU pra promover a camada.
> Numa máquina com aceleração isso provavelmente some, mas **eu não pude
> verificar**. Se o Chromebook engasgar no mergulho, o conserto é uma linha:
> apagar `.hud--inclinado .hud__moldura { transform: rotate(1.5deg) }` em
> `src/estilos.css`. Perde-se a inclinação; ganha-se a fluidez.

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
  quadro, com rótulo tipo `CETÁCEO · 26 M`. Com mais de um bicho na água ele
  escolhe o mais **perto do centro**, senão ficava apontando pra borda.
- **Painel `camera`** (`camera`, `camera 1`, `camera 2`) abre um feed grande.

### Quem passa na frente da câmera

O bestiário está em `src/mundo/bestiario.ts`. Cada espécie declara a faixa de
profundidade em que vive, o porte e **como se desenha** — corpo em curvas de
Bézier, cada nadadeira como peça à parte, gradiente de contraluz pra dar
volume. Nada de elipse com triângulo atrás: aquilo vira recorte voando.

| zona | quem aparece |
|---|---|
| 0–420 m | tartaruga, golfinho, raia-manta, tubarão |
| 200–2200 m | lula, peixe-machado, água-viva grande |
| 700–4200 m | peixe-pescador (com a isca acesa), peixe-víbora, cachalote |
| 2200 m ⬇ | peixe-pelicano, lula-gigante |
| (nunca sozinho) | megalodonte — **só por roteiro**, ver abaixo |

Descer troca o elenco, e o elenco de baixo é **maior**: o cachalote e a
lula-gigante têm quase o dobro do porte de uma tartaruga. Quando a expedição
sai da faixa de um bicho que ainda está atravessando o quadro, ele se apaga no
escuro em vez de continuar ali — um tubarão a 4500 m entrega a farsa na hora.

Da mesopelágica pra baixo as espécies têm **fotóforos**, e no abisso eles são
quase a única coisa que se lê. Lá embaixo o bicho também deixa de ser silhueta
contra a luz de cima (não existe luz de cima) e passa a ser objeto iluminado
pelo farol do submarino — por isso as cores do corpo clareiam junto com
`perfil.farol`.

Uma espécie pode ficar **fora do sorteio**: `ESPECIES_ESPONTANEAS` exclui quem
só entra por roteiro. É o caso do megalodonte — uma aparição aleatória dele na
câmera do 2A estragaria a surpresa do 3A e a verossimilhança ao mesmo tempo.
Criatura nova de roteiro entra em `ESPECIES` e **não** entra na lista de
espontâneas.

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
| `traco`, `desenhar` | abre a área de desenho: o aluno risca, a IA vira o risco |
| `espectro`, `cores` | abre as faixas de cor apagando com a profundidade |
| `zonas`, `camadas` | as cinco zonas do oceano, com o submarino na atual |
| `dossie megalodonte` | o arquivo do contato não catalogado |
| `eco`, `distancia` | a conta do sonar acontecendo: `t = 2d / 1500` |
| `cena 5`, `ir bio`, `proximo`, `voltar` | navega no roteiro |
| `pane`, `reiniciar`, `limpar`, `ajuda` | comandos de sistema |
| `gatilhos`, `gatilhos off`, `gatilhos on` | liga/desliga a direção automática |
| `profundidade 4500` | depuração: força a profundidade do cenário |
| `som` | toca todos os efeitos em sequência, pra conferir os alto-falantes |
| `ambiente` | liga/desliga o som de fundo do oceano |
| `vozes`, `voz 2`, `voz mp3`, `voz sistema` | lista e troca a voz da narração |

Comando não reconhecido **nunca** vira "comando inválido" seco — no palco isso
parece defeito. A IA responde `Comando não reconhecido pelo sistema de bordo.`,
solta uma estática, o orbe treme e o log registra um `WARN`.

## Direção de cena

A IA não fala sozinha numa tela parada: enquanto ela narra, painéis abrem, o
orbe muda de forma, o submarino desce. Quem decide isso é o **Diretor**
(`src/diretor/`), e ele tem duas fontes, nesta ordem:

1. **Ações escritas no JSON**, linha a linha. Quem escreve o roteiro manda.
2. **Gatilhos semânticos** — a IA reage a palavras da própria fala, mas só nos
   espaços que a linha deixou vazios.

E uma regra acima das duas: **o operador sempre vence.** `M`, `N`, `O`, `Esc`
ou qualquer comando no console suspendem a direção automática **até a próxima
cena** — e sem fechar nada: o que estava na tela continua, agora sob controle
dele. No palco, um sistema que reabre o que a pessoa acabou de fechar é pior
que um sistema burro.

Isto substituiu o modelo antigo de `comandos` com `atraso`/`aposLinha`. Um
roteiro que ainda tenha o campo `comandos` dá erro legível no carregamento,
apontando pro campo novo.

### Ações por linha

Uma linha de fala pode ser uma string ou um objeto com ações:

```json
{ "id": "arte-intro", "tipo": "fala",
  "tela": { "linhas": [
    "Cada faixa de cor morre numa profundidade diferente.",
    { "texto": "Repare no que sobra quando a luz acaba.",
      "acoes": [
        { "tipo": "painel", "nome": "espectro", "quando": "fim", "ate": "fimCena" }
      ] }
  ] } }
```

| tipo | o que faz |
|---|---|
| `painel` | abre um painel (`nome`, `args` opcional) |
| `forma` | morfa o orbe numa forma registrada |
| `fechar` | fecha o `alvo`: `"painel"`, `"forma"` ou `"tudo"` |
| `mapa` | abre o mapa já focado num `marcador` |
| `camera` | abre a câmera externa, `qual: 1` ou `2` |
| `sfx` | toca um efeito |
| `mergulho` | inicia a sequência de mergulho até `para` (metros) |

Dois campos valem pra quase todas:

- **`quando`** — `"inicio"` (padrão) ou `"fim"`: antes de a IA dizer a linha, ou
  depois de ela terminar. `"fim"` é o que impede o painel de brotar no meio de
  uma frase.
- **`ate`** — o **prazo**, e é a peça central. Tudo que o Diretor abre tem
  validade declarada e ele fecha sozinho quando vence. Nunca existe um painel
  esquecido na frente da plateia.

| prazo | vence |
|---|---|
| `"fimLinha"` | quando a linha acabar, **mais 0,8 s de cauda** |
| `"fimCena"` | quando a cena acabar |
| `{ "linha": 4 }` | quando a linha de índice 4 terminar |
| `{ "segundos": 12 }` | 12 s depois de abrir |

**O `ate` escrito no roteiro vale sempre**, e nenhuma regra de gatilho encosta
nele: quem escreveu disse até quando. A única concessão é a cauda do
`"fimLinha"`, que é o mesmo problema de não cortar no meio da frase seguinte.

O disparo usa os offsets reais de `tempos.json`, então ele acompanha a fala
mesmo que a professora troque uma palavra e o mp3 mude de duração. Era isso que
o `atraso` em ms não conseguia: virava mentira no primeiro ajuste de texto.

### Gatilhos semânticos

O dicionário está em `src/roteiros/gatilhos.json` — texto puro, editável por
quem não programa. Ele liga palavra a resultado:

```json
{ "formas":  { "baleia": ["baleia", "baleias", "cetáceo", "jubarte"] },
  "paineis": { "sonar":  ["sonar", "varredura", "detectado", "localizado"] },
  "marcadores": { "abrolhos": ["Abrolhos"] } }
```

Regras da comparação: **palavra inteira** (`mar` não casa em `marcador`), sem
acento e sem maiúscula, e expressão de várias palavras vale (`mar aberto`).
Quando mais de um casa na mesma linha: **marcadores > painéis > formas**, e
entra só uma forma e um painel por linha — o primeiro na ordem do texto.

O que segura o excesso são as folgas, todas no topo de `src/diretor/diretor.ts`:

| folga | valor | por quê |
|---|---|---|
| sobrevida da forma | 1,5 s | a forma não some no instante em que a frase acaba |
| teto do painel por gatilho | 20 s | painel de gatilho nunca vira mobília |
| mesmo painel de novo | 30 s | evita o sonar piscando a cada "detectado" |
| mesma forma de novo | 10 s | evita o orbe vibrando entre duas silhuetas |
| entre dois painéis quaisquer | 12 s | ver abaixo |

> A última **não estava na especificação; é acréscimo meu.** Sem ela a cena de
> entrada do 2A abre `status`, `sonar`, `mapa` e `camera` em quatro linhas
> seguidas, porque as quatro palavras estão lá. Vira pisca-pisca. Se a
> professora quiser essa cadência, basta abaixar `ESPERA_ENTRE_PAINEIS_MS`.

Um painel aberto por gatilho não ocupa a tela inteira: ele entra na **faixa de
cima** (`.painel--faixa`, 54% da altura), porque a legenda mora embaixo e
**legenda nunca é coberta**. Painel aberto pelo operador continua grande.

### Quanto tempo o painel automático fica

Não é por contagem de linhas — é enquanto **o assunto durar**.

Ao fim de cada linha o Diretor lê a **próxima**. Se ela toca qualquer palavra do
mesmo grupo do dicionário, o painel fica. O mapa é o único com duas fontes: o
grupo `mapa` e **qualquer marcador** — dizer "Abrolhos" é continuar falando do
mapa mesmo sem a palavra "mapa" aparecer.

| regra | valor | por quê |
|---|---|---|
| cauda | 0,8 s | a IA fecha antes de mudar de assunto, não no meio da frase seguinte |
| piso | 4 s | painel que aparece e some em 2 s a plateia lê como defeito |
| teto | 20 s | continua valendo acima de tudo, mesmo com o assunto vivo |

**Exceção: se a próxima linha já abre outro painel, não há cauda** — a troca
acontece no início dela e a tela nunca fica vazia no meio. (A previsão do
gatilho é conservadora: as folgas são todas do tipo "já passou tempo bastante",
então o que passa agora também passa daqui a pouco. Um "vai trocar" aqui é
sempre verdade; um "não vai" pode errar, e aí o pior que acontece é a cauda ter
rodado antes da troca.)

Fechar por fim de assunto **não é sumir**. O painel se despede: o log de bordo
escreve `Encerrando <painel>` e a moldura sai com a animação inteira (520 ms,
mais que o dobro de um painel trocado por outro). A diferença entre "acabou" e
"quebrou" é essa. O **sonar**, se tiver um contato marcado, ainda dá o **ping
final** e apaga o contato antes de sair — sumir com o contato junto jogaria
fora a única coisa que aquele mostrador tinha a dizer.

### Ver a decisão ao vivo

```
file:///.../index.html?turma=2A&debugDiretor=1
```

Põe uma faixa no rodapé com a decisão do Diretor a 8 Hz:

```
diretor  entrada  mapa costa-sudeste · aberto pelo roteiro na linha 2 · prazo do roteiro: fim da linha 4
diretor  entrada  status · aberto por gatilho "sistemas de bordo" na linha 0 ·
                  próxima linha relaciona: não · fim de assunto: fecha em 0.8s
```

É ferramenta de ensaio e é feia de propósito: se alguém esquecer a flag ligada
na feira, tem que ficar óbvio na hora. Sem a flag, nada disso existe na página.

### Desligar tudo

```
/  gatilhos off      desliga a direção automática agora
/  gatilhos on       religa
/  gatilhos          consulta o estado
```

E `?gatilhos=off` na URL começa a apresentação já sem eles — só as ações
escritas no JSON rodam. É o modo de ensaio: útil pra conferir se o roteiro se
sustenta sem a direção automática.

## Painéis

Overlays que se materializam sobre a área central. Um por vez; abrir outro
substitui, e trocar de cena fecha.

- `sonar` — varredura circular com contatos e anéis de distância, e **o ping
  toca a cada volta**, quando a varredura passa pelo topo. Uma vez a cada ~4,8 s
  e não a cada contato: o painel pode ficar minutos aberto na frente da
  plateia, e ping demais vira barulho.
- `status` — os seis subsistemas com barra e valor. Na Fase 2 é este painel que
  mostra a pane.
- `ficha <nome>` — ficha de espécie. **Os dados são reais**, vêm de
  `src/roteiros/fichas.json`: é conteúdo de Biologia, não cenografia. Tem
  entradas pra baleia, tartaruga, agua-viva, coral, peixe e mergulhador.
- `mapa` — costa brasileira que se desenha na frente da plateia e fecha num
  marcador. `mapa abrolhos` já abre focado. Ver abaixo.
- `camera 1` / `camera 2` — a câmera externa em tela cheia.
- `zonas` (ou `camadas`) — as cinco zonas do oceano numa régua vertical, com o
  submarino na profundidade atual. **As palavras de cada faixa são as do
  trabalho do grupo 2** — o painel não acrescenta fato nenhum.
- `eco` (ou `distancia`) — como o sonar mede distância: dispara um ping, a onda
  vai, bate e volta, e a conta `t = 2d / 1500` acontece na tela. O tempo é
  real, não acelerado: a 900 m o eco leva 1,20 s e a animação leva 1,20 s.
  `↑` `↓` mudam a distância, `Enter` dispara.
- `traco` (ou `desenhar`) — **o aluno desenha e a IA assume o desenho.** Ver
  abaixo.
- `espectro` (ou `cores`) — **as cores que o oceano apaga.** Ver abaixo.

Painel novo = um arquivo em `src/paineis/` + uma linha em `nomes.ts` e no
`index.tsx`.

### `mapa` — a rota da expedição

Entrada em três tempos, e ela existe por um motivo de palco: um mapa que
aparece pronto é um slide; desenhado na frente da plateia, vira instrumento
ligando.

1. a costa brasileira se desenha, de norte a sul (~500 ms);
2. o enquadramento fecha no marcador pedido (~800 ms);
3. o marcador pulsa, com anel de mira e uma linha de contexto embaixo.

Marcador novo **na mesma cena é pan, não corte**: a suavização exponencial do
enquadramento dá isso de graça, e o olho acompanha a viagem em vez de se perder
num salto. É o que acontece na transição do 2A pro 2B, que vai de Abrolhos a
Fernando de Noronha sem piscar.

Os marcadores vivem em `src/paineis/mapa.ts`, separados do componente de
propósito: o validador do roteiro precisa saber se `{ "tipo": "mapa",
"marcador": "abrolhos" }` existe e não pode arrastar React e canvas junto pra
descobrir.

| chave | onde |
|---|---|
| `abrolhos` | maior banco de corais do Atlântico Sul |
| `amazonia` | foz do Amazonas: manguezais e corais profundos |
| `fernando-de-noronha` | arquipélago vulcânico, 350 km da costa |
| `costa-sudeste` | ponto de partida da expedição |
| `baia-de-todos-os-santos` | — |
| `atol-das-rocas` | único atol do Atlântico Sul |

As coordenadas são aproximadas de propósito: é um mostrador de bordo pra ler a
15 metros, não carta de navegação. Marcador novo = mais uma entrada nessa lista,
e ele já passa a valer no JSON, no console e no dicionário de gatilhos.

### `traco` — a IA interpreta o seu traço

Área de desenho clara, cursor grande, `pointer events` (funciona com mouse,
trackpad e **toque** — o Chromebook tem tela sensível). O traço passa por uma
média móvel de 3 pontos, que tira o tremor do trackpad sem atrasar o risco.

`Enter` ou o botão `INTERPRETAR` mandam a IA ler: ela entra em `processando`,
o log vai em rajada, e o orbe morfa **no desenho do aluno**, pela mesma rotina
de amostragem das outras formas. `Backspace` limpa, `Esc` fecha.

O desenho vira uma forma temporária (`traco-1`, `traco-2`, …) que entra no
rodízio de `M`/`N` da cena. Ela vive só na memória e **morre quando a cena
muda**: de propósito não entra em `NOMES_FORMAS`, senão `traco-1` passaria a ser
aceito no campo `formas` do JSON e apareceria no autocomplete de qualquer cena,
prometendo uma forma que já não existe.

O canvas do desenho é a *fonte* da amostragem, por isso ele é fundo claro com
tinta escura: quem lê aquilo corta por luminância, e cinza médio deixaria o
corte indeciso.

Por que na aula de Arte: Arte é interpretação e representação. A IA mostra, ao
vivo, que a mesma coisa pode ser lida de outra forma.

### `espectro` — as cores que o oceano apaga

Sete faixas de cor e um controle de profundidade (`↑` `↓`, `shift` acelera; abre
na profundidade em que o submarino está). Conforme desce, cada faixa escurece na
ordem real de absorção: o vermelho morre primeiro, o azul é o último a resistir.
Embaixo, `A ESTA PROFUNDIDADE, UM PEIXE VERMELHO PARECE:` com a cor resultante.

A queda é exponencial, não degrau — na água a luz vai sumindo, e um degrau
ensinaria a coisa errada. Os números são **ordem de grandeza, não medição**:
água limpa de oceano aberto; água de costa apaga tudo muito antes. Por isso os
rótulos dizem "cerca de 10 m", e não um valor cravado.

O passo do controle é proporcional à profundidade (1 m perto da superfície, 25 m
lá embaixo). Com passo fixo de 10 m o painel pularia justamente a faixa onde o
vermelho morre, que é o assunto dele.

## Por que o `audios.js` está versionado

O `public/audios.js` é gerado (`scripts/embutir_audios.py`) e mesmo assim entra
no repositório. Já esteve no `.gitignore`, e a medição mostrou o estrago: um
clone limpo, buildado, abria com

```
[audio] camada A em 0/8 · tempos reais em 0/8 cenas · sfx sintético
```

Três perdas de uma vez, e nenhuma delas óbvia olhando a tela: sem os **tempos
reais** a legenda volta a estimar o ritmo da fala; sem a camada A os **efeitos
gravados** (o canto da baleia e a chuva do hidrofone) são trocados pelos
sintetizados; e o `index.html` sozinho, longe da pasta `audio/`, fica mudo.

Com o arquivo versionado, o mesmo clone abre com `camada A em 8/8 · tempos
reais em 8/8 · sfx de arquivo`. São 5 MB de base64 no repositório — o preço de
o build funcionar na mão de quem apresenta, que usa Chromebook e não tem
terminal pra rodar o gerador.

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

Tipos de cena disponíveis: `fala`, `apresentacao`, `transicao`, `quiz`, `vf`,
`pane`, `combate`, `olho` e `fim`.
O formato de cada um está em `src/roteiros/tipos.ts`.

Campos comuns a todas:

- `id` — único dentro da turma; **é o nome do mp3** que vai ser gerado.
- `avanco` — `"auto"` (avança sozinha quando o áudio termina) ou `"manual"`
  (espera o operador apertar `→`).
- `sfx` — efeito sonoro opcional: `"sonar"`, `"alarme"`, `"estatica"`, `"ok"`,
  `"pressurizacao"`, `"bipe-timer"`, `"casco"`, `"vidro"`, `"pulso"`,
  `"impacto"`, `"presenca"`, `"whoosh"` ou `"agua"`.
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

1. **mp3 gerado** pelo `scripts/gerar_audios.py` — é o padrão, sempre. Os
   arquivos no repositório hoje são a voz **Dora** (`pf_dora`), uma rede neural
   pt-BR rodando localmente, passada pelo filtro de intercomunicador. A legenda
   anda pelos offsets reais de `tempos.json`.
2. **Voz do sistema (Web Speech API)** — rede de segurança e escolha do
   operador, nunca o padrão. Serve se os mp3 não viajarem junto com o
   `index.html`, ou se alguém preferir outra voz na hora. Troca com `/` + `voz`.

> **A voz do sistema contraria a decisão original do projeto**, que proibia a
> Web Speech API — e a razão da proibição era boa: ela depende do que a máquina
> tem instalado, e ninguém testou a voz do Chromebook da escola. Por isso ela
> deixou de ser o padrão assim que os mp3 ficaram bons: o que toca na feira é a
> voz que foi ouvida e aprovada antes, não uma que varia de máquina pra
> máquina. Ela fica como saída de emergência, que é o papel certo dela.

**Teste no dia:** o log da tela mostra, no carregamento, qual fonte está ativa —
`Narração: voz do sistema — <nome da voz>` ou `Narração: gravação de bordo
(mp3)`.

### Escolher a voz

Uma máquina costuma ter várias vozes em português, e a diferença entre elas é
enorme: as "Natural"/"Neural" e as servidas pela rede soam humanas, as locais
soam robóticas. O app já escolhe a melhor por uma nota (pt-BR > pt, nome com
Natural/Neural/WaveNet, Google, voz de rede), mas dá pra conferir e trocar:

```
/  vozes          lista as instaladas, da melhor pra pior, marcando a em uso
/  voz 2          passa a usar a de número 2   (vozes 2 também vale)
/  voz mp3        usa a gravação em vez da voz do sistema
/  voz sistema    volta pra voz do sistema
```

Singular e plural valem igual, com ou sem argumento: na hora de digitar na
frente da plateia, ninguém lembra qual era qual. E um argumento inválido
responde com a forma certa, em vez de cair no "comando não reconhecido".

**Se a voz estiver ruim, esse é o primeiro lugar pra olhar** — pode haver uma
melhor instalada que não ganhou a nota.

## Gerar a voz

A voz da IA é sintetizada **antes da feira**, não na hora. Com o motor padrão
(`kokoro`) a rede neural roda na própria máquina: só precisa de internet na
primeira execução, pra baixar o modelo. A apresentação roda 100% offline em
qualquer caso.

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
| `--motor kokoro` (padrão) | neural, roda local, voz `pf_dora` | só pra baixar o modelo, uma vez |
| `--motor edge` | neural, `pt-BR-FranciscaNeural` | **sim, toda vez** |
| `--motor espeak` | robótica (síntese por formantes) | não |

**Os mp3 no repositório hoje foram gerados com o `kokoro`.** Ele é o padrão
porque resolve o problema real deste projeto: voz neural sem depender de
serviço nenhum. O modelo (~350 MB) é baixado do release do GitHub na primeira
execução, fica em `scripts/.modelos/` e não entra no repositório. As vozes
pt-BR disponíveis são `pf_dora` (feminina), `pm_alex` e `pm_santa`
(masculinas) — troque em `scripts/config.json`.

O `edge` continua aqui porque a voz dele é excelente, se houver internet. O
`espeak` existe porque uma IA de bordo com voz de robô é melhor que uma IA
muda; ajuste a voz e a velocidade em `scripts/config.json` (`pt-br+f1..f4`,
`pt-br+m1..m7`).

**Há dois filtros de rádio**, e a escolha é por tipo de voz, não por motor. O
pesado (usado só pelo `edge`) tira a fundamental e ecoa: dá muito caráter de
intercomunicador, mas só sobra fala inteligível se a fonte for gorda. O leve
corta menos e compensa com compressor, e é o que `kokoro` e `espeak` usam por
motivos opostos — o `espeak` já nasce fino e o filtro pesado borraria os
formantes até virar ruído; o `kokoro` é natural demais pra desperdiçar num
corte agressivo.

O teto do limiter é `0.89` (~-1 dB) e não `0.97` por um motivo medido: a
`0.97` os 25 arquivos do 2A decodificavam com pico entre **+0,12 e +0,34
dBFS**. O mp3 não sai cortado, mas o decodificador estoura na saída, e isso
vira distorção em DAC de Chromebook no volume máximo. A `0.89` o pior pico é
**-0,14 dBFS** e a média ficou em **-14,4 dB** — folga sem perder volume.

### Toda vez que mudar um texto do roteiro

```bash
python3 scripts/gerar_audios.py          # todas as turmas
python3 scripts/gerar_audios.py --turma 2a
npm run build
```

Quanto demora: a síntese leva uns **2–4 s por linha**. O 2A inteiro tem 53
linhas, ou seja **uns 2 a 4 minutos** na primeira vez. Depois disso o cache
(`scripts/.cache.json`, hash de texto + parâmetros reais do motor + filtro) faz
só o que mudou ser regerado — corrigir uma frase leva segundos. `--forcar` ignora o
cache.

Outras flags: `--sem-filtro` (pra comparar sem o filtro de rádio) e
`--so-listar` (mostra todas as falas sem gerar nada). As flags `--voz`,
`--rate` e `--pitch` valem só pro `--motor edge`; o `kokoro` e o `espeak` leem
os parâmetros de `scripts/config.json`.

Cada turma pode ter voz própria em `scripts/config.json`:

```json
{ "turmas": { "2b": { "voz": "pt-BR-AntonioNeural" } } }
```

### O que o script faz

1. lê os JSONs dos roteiros **e** `src/console/respostas.ts` (as respostas
   fixas do console também ganham voz);
2. sintetiza **uma linha por vez** com o motor escolhido (padrão: `kokoro`);
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

Os SFX (`sonar`, `alarme`, `estatica`, `ok`, `pressurizacao`, `bipe-timer`,
`casco`, `vidro`, `pulso`, `impacto`, `presenca`, `whoosh`, `agua`)
são **sintetizados em código** com a Web Audio API, em `src/audio/sfx.ts`. Não
dá pra depender de o professor baixar arquivos do freesound na véspera da
feira: o projeto roda completo sem nenhum mp3 de efeito.

Se você quiser efeitos "de verdade", é só jogar o arquivo em
`public/audio/sfx/<nome>.mp3` — ele passa a ter prioridade sobre o sintético,
um a um. Dá pra ter o `sonar` de arquivo e o resto sintetizado. **Não esqueça
de rodar `python3 scripts/embutir_audios.py` depois**: o player só considera
efeito que esteja embutido no `audios.js`, porque por `file://` um caminho
solto não é confiável.

> **Hoje o `impacto` é gravação** (3,3 s, fornecida pela professora), e ela
> serve os DOIS lugares que disparam esse efeito: a rachadura do visor, depois
> do olho, e cada pancada no casco durante o combate. É a mesma criatura
> batendo no mesmo casco — dois sons diferentes pro mesmo evento é que soaria
> errado. O elemento é reaproveitado e rebobinado a cada disparo, então duas
> pancadas seguidas reiniciam o som em vez de empilhar cauda sobre cauda.

Os níveis foram calibrados pra caixa de som em quadra, não pra fone: os picos
ficam entre 0,35 e 0,7, e tudo passa por um compressor pra o eco do sonar não
somar acima de 1 e distorcer.

### Conferir o som antes da apresentação

O **→** que inicia a apresentação já dá um **bipe duplo** de confirmação. Se
esse bipe não sai, o problema é o áudio da máquina, não o app.

Pra um teste completo, `/` e depois `som`: toca os efeitos em sequência —
inclusive o `rugido`, que fora dali só aparece se a turma vencer o combate — e
escreve no log o estado do `AudioContext`. `running` significa que o navegador
liberou o áudio.

## Controle pelo celular

O operador pode dirigir a apresentação pelo celular, de qualquer lugar da
quadra. **É uma segunda fonte de teclas, não uma troca**: o teclado do
Chromebook continua funcionando ao mesmo tempo, e se a internet cair no meio da
feira a apresentação é exatamente a de sempre. Sem rede, nada muda — o app nem
percebe.

O celular não roda nada do app. Ele só manda a tecla; quem decide tudo continua
sendo o Chromebook.

### Como funciona por dentro

O caminho é um relay do **Supabase Realtime**, em modo `broadcast` puro: sem
tabela, sem login, sem RLS, sem migration. Nada é gravado em lugar nenhum — a
mensagem passa pelo servidor e morre ali.

```
celular              relay Supabase              Chromebook
  |  cmd {tecla:'2'}  ->  domi:2B:4173  ->  KeyboardEvent('keydown')
  |                                            |
  |  <-  estado {cena, instrucao, teclas}  <-  a cada 2 s e a cada troca de cena
```

O canal se chama `domi:<TURMA>:<CÓDIGO>` — por exemplo `domi:2B:4173`. Como cada
Chromebook abre com `?turma=` diferente e sorteia um código de 4 dígitos
próprio a cada carregamento da página, **um Chromebook nunca recebe um comando
destinado a outro**: eles não compartilham canal.

A tecla que chega do celular vira um `KeyboardEvent` sintético disparado na
`window`. Isso é de propósito: ela entra pelo **mesmo caminho do `useTeclado`**
que uma tecla física, então toda regra que já existia continua valendo sem
nenhum caso especial — inclusive a de que o teclado fica desligado quando o
console (`/`) está aberto. Não existe um segundo roteamento de teclas no
projeto.

As credenciais ficam em `src/remoto/config.ts` e repetidas no topo do
`<script>` do `public/controle.html`. A chave é uma `publishable`: é **pública
por desenho** e não é segredo — ela está no HTML que qualquer um baixa. Quem
protege a sessão é o código de 4 dígitos, que muda a cada carregamento e só
aparece na tela do Chromebook.

### Duas telas antes de começar, e por quê

Antes era uma tecla só, e ela fazia duas coisas ao mesmo tempo: liberava o
áudio do navegador **e** começava a apresentação. Na prática isso significava
que o operador não podia encostar na máquina — um clique pra pôr em tela cheia,
com a plateia entrando, acordava a IA no meio da arrumação.

Agora são dois passos:

**1. `PRESSIONE QUALQUER TECLA`** — a tela de sempre, com o PIN do celular.
Qualquer gesto físico serve: tecla, clique, toque. Ele **não** começa nada: só
tira o cadeado do áudio e passa pro standby.

**2. Standby** — o submarino ligado e parado, com a turma, o PIN grande e o
estado do canal. Aqui clique, toque, Enter e espaço não fazem nada. Só a **seta
direita** inicia, e ela pode vir do teclado **ou do celular**.

É a cena `espera`, primeira do roteiro das três turmas. O validador exige que
ela exista, que seja só uma, e na primeira posição.

### O passo que não dá pra fazer pelo celular

Um detalhe do Chrome decide o desenho: uma tecla **criada por script** — que é
o que o celular manda — não conta como gesto do usuário. Se ela passasse da
tela de ativação, o `AudioContext` ficaria suspenso e a apresentação rodaria
**muda do começo ao fim, sem nenhum aviso**, só consertável recarregando.

Por isso o `cmd` do celular é ignorado enquanto a tela 1 está no ar, e o
celular mostra, em vez dos botões: *"este passo é no Chromebook — alguém
precisa apertar uma tecla lá"*. Assim que alguém encosta na máquina, o celular
vira pro standby sozinho e o **→ AVANÇAR** acende.

> Duas redes de segurança que continuam no código mesmo sem aparecer no caminho
> normal: a cena de espera recusa um → que chegue sem nenhum gesto físico na
> página (com um recado de 3 s nos dois lados), e o app **não** usa
> `navigator.userActivation.hasBeenActive`, que seria a resposta oficial do
> navegador — medido aqui, ele já nasce `true` numa página que ninguém tocou.
> Um falso positivo custa a apresentação inteira muda; um falso negativo custa
> um toque a mais.

### O que o F11 faz (e não faz)

Se o operador puser em tela cheia pelo **F11 do navegador**, esse atalho é do
Chrome e pode não chegar na página. Não é problema: um clique na tela também
passa da tela 1, e o standby não avança com clique. **A receita do dia é uma
frase: abriu, apertou uma tecla, esperou a turma, →.**

### O código de 4 dígitos

Aparece em dois lugares:

- na tela `PRESSIONE QUALQUER TECLA` e no **standby**, antes de começar;
- no overlay de ajuda, tecla **H**, junto com o estado da conexão.

O overlay `H` mostra **sempre duas linhas** sobre o canal, funcionando ou não:

```
canal: realtime · há 3m12s
rest: —

canal: rest 420ms · há 47s
realtime: timeout 12s

canal: rest · há 8s · tabela sinais não existe — rodar docs/sinais.sql
realtime: transport failed (CHANNEL_ERROR)
```

A de cima é quem está entregando, há quanto tempo, e — quando é ele que está
quebrado — o que houve. A de baixo é **o último erro do outro transporte**,
guardado mesmo enquanto o de cima funciona. É a de baixo que responde a
pergunta do dia da feira: *estou no rest, o realtime falhou por quê?* Ela só
serve se estiver lá **antes** de alguém precisar, e por isso está sempre.

As duas são discretas com o canal de pé e âmbar quando ele está fora — `rest`
funcionando é informação, não alarme. E um problema da tabela sobe pra linha
de cima, porque aí o que interessa é o que **fazer**, não a latência:

| a linha diz | o que aconteceu |
|---|---|
| `tabela sinais não existe — rodar docs/sinais.sql` | ninguém rodou o SQL no painel |
| `tabela sinais recusou a chave — conferir as policies do SQL` | o SQL rodou pela metade (falta policy ou `grant`) |
| `a tabela respondeu 503` | o projeto está fora do ar |
| `a tabela não respondeu` | sem rede nenhuma |
| `supabase-js não carregou` | o vendor **e** a reserva falharam (copiar a pasta `vendor/` junto do `index.html`) |

A segunda linha é a mais traiçoeira e por isso está na tela: sem o `grant` da
sequência o Chromebook **lê** a tabela perfeitamente e não consegue escrever
nela. Por fora é saúde — ponto verde, latência boa — e o celular fica dizendo
que nenhum submarino respondeu. Serve pra distinguir coisas que, sem
ela, são todas a mesma tela parada: **sem internet**, **projeto pausado ou
chave errada** (o servidor respondeu e recusou) e **wi-fi da escola bloqueando
websocket** (aí o transporte vira `rest` sozinho).

Recarregar a página do Chromebook sorteia um código novo e derruba o celular
(ele fica no canal antigo, sozinho). Se isso acontecer no meio da
apresentação: **H** no Chromebook, leia o código novo, **TROCAR TURMA** no
celular e conecte de novo.

### A bolinha do HUD

No rodapé esquerdo, ao lado da turma:

| bolinha | o que é |
| --- | --- |
| verde pulsando | conectado no relay |
| âmbar | tentando reconectar (ele tenta sozinho a cada 5 s) |
| cinza | sem relay — só o teclado físico |

Cinza **não é erro**: é o estado normal de quem está sem internet, e a
apresentação roda igual.

### Publicando a página do celular (GitHub Pages)

O `public/controle.html` é uma página só, sem build. Ela não entra no
`dist/index.html` (o app é offline; a página do celular precisa de internet de
qualquer jeito), então vai direto pro Pages:

1. No GitHub, **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**.
3. Branch: `main`, pasta: **`/ (root)`**. Salvar.
4. Espere um ou dois minutos e abra:
   `https://duque498.github.io/submarino-Dominante/public/controle.html`

Se preferir a URL curta, copie o arquivo pra raiz do repositório
(`cp public/controle.html controle.html`) e o endereço vira
`https://duque498.github.io/submarino-Dominante/controle.html`.

Abra esse endereço no celular **uma vez em casa**, confirme que carrega, e
salve na tela de início. No dia, o wi-fi da escola costuma ser o gargalo — vale
deixar o 4G ligado.

### No dia da feira

No Chromebook:

1. Abra o `dist/index.html?turma=...`. Ele para em `PRESSIONE QUALQUER TECLA`.
2. Anote o **código de 4 dígitos** que está na tela.
3. **Aperte qualquer tecla** (e ponha em tela cheia, se quiser). Isso libera o
   áudio e põe o submarino em **standby** — não começa nada.
4. Quando a turma estiver pronta, **→** inicia a IA. Pode ser pelo celular.

No celular:

4. Abra a página do controle.
5. Toque na turma, digite o código, **CONECTAR**.
6. Se aparecer *"Nenhum submarino respondeu"*: o código está errado, a turma
   está errada, ou o Chromebook está sem internet. Confira com **H**.
7. Se o celular disser que *este passo é no Chromebook*, ninguém apertou a
   tecla do item 3 ainda. Assim que apertarem, o celular acende sozinho.

Durante:

A tela é sempre a mesma, de cima pra baixo: uma linha fina de conexão, o nome
da cena com a colinha em letra grande (e a próxima cena embaixo, apagada), a
área do modo, e o rodapé. O rodapé **nunca muda de lugar**: em qualquer modo, o
polegar acha o → AVANÇAR no mesmo ponto.

- O botão **→ AVANÇAR** é 90% da apresentação, então é o maior elemento da
  página e mora na zona do polegar. `←`, `espaço` e `esc` ficam logo acima,
  numa fileira de botões baixos, claramente secundários. O **esc** é a saída de
  emergência: fecha o painel que a IA abriu e tira o Diretor do volante até a
  próxima cena — é a tecla que mais faz falta justamente quando o operador está
  longe do Chromebook.
- A área do meio muda sozinha conforme a cena — no quiz 1–4, no combate os três
  setores com as barras de recarga, casco e contato, na pane as luzes dos
  subsistemas — e **rola por dentro** se precisar, sem nunca empurrar o
  avançar. Tecla que não serve na cena atual fica **apagada, no mesmo lugar**:
  assim o dedo não erra o alvo quando o layout muda.
- Cada tecla tem o mesmo desenho: a tecla grande em cima, a função embaixo.
- A cor do cabeçalho do modo diz o tom da cena: neutra na apresentação, âmbar
  nas dinâmicas, vermelha no combate, vermelha piscando devagar na pane.
- Nas cenas em que não há o que fazer (mergulho) a área do meio
  mostra só *"nada a fazer — aguarde"*, em vez de uma grade de botões apagados.
- **P PANE** e **R REINICIAR** não ficam à vista: estão no **···** do canto
  superior direito, numa gaveta, e ainda exigem o dedo parado **2 segundos**
  (com barra de progresso). São as duas que estragariam a apresentação se
  alguém encostasse sem querer.
- Se aparecer uma tarja fina âmbar embaixo do topo ("sem estado há 7s"), o
  Chromebook está há mais de 6 s sem dar notícia. Aos 12 s ela fica vermelha.
  **Os botões continuam funcionando** — pode ser só o `estado` que atrasou, e a
  tarja some sozinha quando ele volta.

### A versão do supabase-js está pinada (e por quê)

Desde a Fase 6.5 a biblioteca vem **junto com o app**: o arquivo
`public/vendor/supabase.js` é o UMD da versão pinada, commitado byte a byte
como o npm o publica (sha e procedência no `public/vendor/README.md`). Por
`file://` e no Pages, carregar o controle remoto custa **zero rede** — que é
o único jeito de confiar nele no wi-fi da escola. A jsDelivr continua nas
duas páginas só como **reserva**, se a pasta `vendor/` não vier junto.

A versão fixa — hoje `2.117.2` — está em quatro lugares:
`src/remoto/config.ts`, `index.html`, `public/controle.html` e o próprio
arquivo do vendor. Mudou uma, mude as quatro (o passo a passo está no README
do vendor).

Não é só higiene de dependência: a versão velha (`2.45.4`) **não funciona com
uma chave `sb_publishable_`**. Medido aqui, subindo um servidor websocket local
e lendo o quadro `phx_join` que cada versão manda:

| versão | protocolo | `access_token` no `phx_join` |
|---|---|---|
| `2.45.4` | `vsn=1.0.0` | manda a chave como `access_token` |
| `2.117.2` | `vsn=2.0.0` | não manda — autentica só pelo `?apikey=` |

O Realtime valida o `access_token` do join **como JWT**. A chave `anon` antiga
era um JWT, então passava; uma `sb_publishable_` não é, então o join é recusado
e o `subscribe()` para em `CHANNEL_ERROR` sem nunca chegar em `SUBSCRIBED` —
exatamente o "abrindo o canal..." que não terminava. A `2.117.2` tirou a chave
do join, e de quebra reconhece o formato `sb_publishable_`/`sb_secret_` (a
`2.45.4` não tem nenhuma menção a ele no bundle).

> **Ressalva honesta:** o contêiner onde isso foi escrito não alcança nem a
> jsDelivr nem o host do Supabase (o proxy recusa), então a recusa do
> *servidor* é dedução a partir do que o cliente manda, não medição de ponta a
> ponta. As duas versões carregam e expõem a mesma API; a diferença medida é o
> conteúdo do join. Se ainda assim não conectar no dia, a linha `canal:` do
> overlay `H` mostra o motivo real.

### Quando o wi-fi da escola derruba o WebSocket

A rede da escola bloqueia `wss://` mas deixa HTTPS passar. Nesse caso o
Realtime nunca sobe, e o controle pelo celular tem um **segundo caminho**: uma
tabela no Supabase onde um lado insere e o outro lê de tempos em tempos. Mais
lento, mais feio, e melhor do que a apresentação sem controle.

**Antes da feira, uma vez só:** abra o SQL Editor do painel do Supabase e rode
o `docs/sinais.sql` inteiro. O REST confere a tabela na primeira coisa que
faz; se ela não existir, o `H` diz o nome do arquivo a rodar. Não precisa do CLI, não precisa de migration —
é uma tabela e três policies. Sem isso o plano B não existe, e você só vai
descobrir no dia.

A troca é automática e não pede nada do operador:

| o que acontece | o que o app faz |
|---|---|
| o canal não sobe em **6 s** | refaz a inscrição, sem trocar de transporte |
| o canal não sobe em **12 s** | troca pro REST |
| o canal cai com `CHANNEL_ERROR`/`TIMED_OUT` | troca pro REST |
| o `supabase-js` nem carregou | troca pro REST (ele não precisa da lib) |
| o celular só alcança o REST | o Chromebook percebe e vai junto |

**Por que 12 s e não 4.** Quando as três turmas abrem os Chromebooks ao mesmo
tempo, o join do Realtime demora mais que quatro segundos e o app caía pro
REST sem precisar — conexão boa, descartada por pressa. Doze segundos é longo
pra uma tela, mas a tela não fica muda: ela diz o que está tentando, e o
teclado físico funciona o tempo todo. A inscrição refeita aos 6 s existe
porque um join perdido no aperto não volta sozinho — o canal fica pendurado
até o prazo estourar, e uma segunda tentativa custa uma mensagem.

O Chromebook lê a tabela a cada 400 ms e o celular a cada 600 ms, e cada um
apaga o que passou de 10 minutos. Na prática a tecla do celular demora uns
**0,6 s** a mais pra fazer efeito no projetor — por isso o celular mostra um
selo **`rest`** no topo. Se ele aparecer, avise o operador: **aperte uma vez e
espere.** Apertar de novo manda o comando duas vezes.

**Voltar pro Realtime.** Estando no REST, o Chromebook tenta o Realtime de
novo a cada 30 s, e volta pra ele quando conseguir — o operador vê
`canal: realtime` outra vez no `H`. Quando isso acontece, o Chromebook avisa o
celular pela própria tabela, e o celular refaz a conexão junto; se o Realtime
não servir pro celular, ele cai pro REST de novo sozinho e o Chromebook vai
atrás.

Se o REST estiver fora **também** — wi-fi que piscou e levou os dois — a
tentativa passa a ser a cada 5 s em vez de 30: não há transporte bom pra
proteger, e aí pressa vale mais que cautela.

**Quando o Realtime sobe e cai em segundos**, duas vezes seguidas, o
Chromebook para de tentar e fica no REST até o fim. Isso é o sintoma de uma
rede que só deixa passar uma ou duas conexões WebSocket ao mesmo tempo: cada
Chromebook que tenta voltar **rouba o socket de outro**, os três se revezam e
nenhum funciona direito. O REST não tem esse problema — ele é HTTP comum, e
os três usam ao mesmo tempo sem se atrapalhar.

Só há um caso em que ele **para** de tentar: quando quem o trouxe pro REST foi
o celular (o Chromebook conseguia Realtime, o celular não). Aí voltar não
resolve nada — o celular puxaria de volta na escuta seguinte, e o único efeito
seria uma janelinha fora do transporte bom a cada 30 s pelo resto da
apresentação.

> O que a tabela expõe: quem tiver a chave publishable (que é pública, está no
> HTML) pode ler e inserir linhas nela. É a mesma exposição que o `broadcast`
> já tinha, com a diferença de que aqui a mensagem fica gravada por 10 minutos
> em vez de passar e sumir. Não vai nada ali além de tecla, nome de cena e a
> colinha. Quem protege a sessão continua sendo o código de 4 dígitos.

### Duas coisas que podem dar errado

**O projeto do Supabase dorme.** No plano gratuito, um projeto sem nenhuma
requisição por **7 dias** é pausado, e aí o relay simplesmente não responde —
o celular diz "nenhum submarino respondeu" e a bolinha fica cinza. Isso não tem
aviso prévio. **Abra a página do controle uma vez na semana da feira**, e de
novo na véspera: qualquer conexão já conta e mantém o projeto acordado. Se ele
tiver pausado, é um clique de *Restore* no painel do Supabase — mas leva alguns
minutos, então não deixe pra descobrir no dia.

**Plano B: teclado sem fio 2.4 GHz.** Se o wi-fi da escola não colaborar, o
substituto é um **teclado (ou apresentador/"caneta laser") sem fio de 2.4 GHz
com dongle USB** — não Bluetooth, que pede pareamento e some na hora errada.
Ele aparece pro Chromebook como um teclado comum, então todas as teclas do app
funcionam sem mudar nada, sem internet, e o alcance de ~10 m cobre a quadra.
Custa pouco e vale ter um na mochila. O apresentador de slides mais simples
manda seta pra direita e pra esquerda — o suficiente pra apresentação inteira.

## Estrutura

```
public/audio/        mp3 fora do bundle: sfx/ e uma pasta por turma
public/audios.js     os mesmos mp3 em base64 (camada A) — versionado de proposito
public/controle.html  a pagina do celular: HTML+CSS+JS numa folha so
src/
  App.tsx            seleção de turma, tela de ativação, monta o Player
  player/            Player.tsx, useTeclado.ts, AudioEngine.ts
  cenas/             um componente por tipo de cena (Espera, Quiz, VF, Combate,
                     Olho, Identificacao, Emergencia, Hidrofone, Fim)
  ui/                Hud, Orbe, Legenda, ritmoLegenda, LogSistemas, Timer, Ajuda
  audio/             efeitos, ambiente do oceano, os sons do hidrofone e a
                     voz do navegador
  console/           barra de comando, parser e as respostas fixas da IA
  paineis/           sonar, status, ficha, mapa, traco, espectro, cache,
                     luzes de emergencia e o registro
  diretor/           Diretor de cena, gatilhos semânticos, mergulho e coluna d'água
  mundo/             o oceano procedural: perfil, motor, bestiário, Feed e Rachadura
  formas/            registro das silhuetas, amostragem, primitivas e dossie/
  remoto/            config.ts, protocolo.ts, receptor.ts, estado.ts e o
                     hook useRemoto (relay do celular)
  roteiros/          tipos.ts, validar.ts, fichas.json, gatilhos.json e os JSONs
scripts/
  gerar_audios.py         voz da IA: kokoro/edge/espeak + ffmpeg + tempos.json
  silhueta_de_prancha.py  tira a silhueta de uma especie de uma prancha
  embutir_audios.py       gera public/audios.js (camada A)
  config.json             voz, rate e pitch, com override por turma
```
