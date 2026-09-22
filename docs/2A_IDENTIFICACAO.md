# 2A — EXPEDIÇÃO DE IDENTIFICAÇÃO (substitui o quiz)

## Conceito
Na descida, o banco de espécies do submarino corrompeu. `CACHE DE ESPÉCIES: 0 / 240.112`. A IA precisa que a tripulação identifique o que as câmeras estão captando pra recalibrar. A água está turva: só uma silhueta se movendo. A IA dá pistas, da mediana pra fácil. A plateia grita o nome quando souber; quanto antes, maior a calibração. Acertou: a água clareia, o animal aparece nítido, ficha abre, cache pula.

Tom: descoberta, não perigo. Trilha aqui é ambiente (drone claro, água, sem tensão) — sintética, não tem mp3.

## Cenas novas no 2a.json (entre `arte` e `transicao-2b`, profundidade 600)

**ident-intro** (fala, auto) — todas [nova]
- "Confirmado. Demonstração de identificação de espécies."
- "Banco de espécies corrompido durante a descida." → painel `cache` abre, contador em 0 piscando `CORROMPIDO`
- "Tripulação: vou mostrar o que as câmeras captam. Identifiquem a espécie. Digam o nome assim que souberem."

**ident** (identificacao) — ver schema.

**ident-fim** (fala, auto) — [nova]
- "Banco de espécies recalibrado." → cache completa até 240.112 com rolagem rápida
- "Sonar operando com referência completa."

## Schema
type CenaIdentificacao = CenaBase & {
  tipo: "identificacao";
  especies: {
    id: string;              // chave do bestiário/forma/ficha
    nome: string;            // como a plateia vai dizer
    aceitos: string[];       // sinônimos, referência pro operador no overlay H
    pistas: string[];        // 3 pistas, da MEDIANA pra FÁCIL; a 3ª quase entrega
    intervaloPistas: number; // segundos entre pistas (padrão 7)
    profundidade?: number;
    ambiente?: "recife" | "mangue" | "aberto";
    incrementoCache: number;
  }[];
  falas: {
    inicio: string[];        // sorteia: "Contato biológico. Câmera um."
    acerto: string[];        // "Identificação confirmada."
    revelado: string[];      // ninguém acertou: "Registrado por sensores."
  };
  audio: { ... }
};
Cena com `cameras: false` (a câmera grande é o palco) e `orbe: "discreto"` até a revelação.

## Fluxo por espécie
1. Câmera grande abre (tamanho da cena olho). Água TURVA: partículas densas, contraste baixo, blur por baixa resolução (160×90 escalado), tom esverdeado/marrom no mangue, azul-leitoso no recife. Silhueta se movendo no meio — reconhecível como ser vivo, não identificável de cara.
2. Fala `inicio`. Barra `CALIBRAÇÃO` em 100%, caindo com o tempo.
3. Pista 1 (mediana). 7s. Pista 2 (mais fácil). 7s. Pista 3 (quase entrega). A partir daí a barra estaciona em 33%.
4. Operador aperta Enter quando ouvir o nome certo. X = revelar sem acerto.
5. Acerto: turbidez limpa em 1.5s (partículas somem, contraste sobe, resolução interna 640×360), animal nítido nadando, ficha ao lado com 3–4 dados, cache pula com rolagem de dígitos, sfx ok, orbe morfa na forma. Fala `acerto`. 4s de contemplação, próxima espécie.
6. Revelado sem acerto: mesma revelação, fala `revelado`, cache pula metade.
7. Após a última: ident-fim.
Sem penalidade. Sem timer visível — só a barra de calibração, suave.

## As criaturas têm que ser BOAS de ver
- Fonte de cada criatura: PNG de silhueta de alta qualidade em src/formas/ (eu forneço, PhyloPic CC0). Bestiário ganha tipo `sprite`.
- Movimento por WARP DE TIRAS: fatiar o PNG em ~24 tiras verticais cabeça→cauda, cada tira com deslocamento em y por seno, amplitude crescendo pra cauda, fase avançando no tempo. Nadadeiras: regiões `nadadeiras: [{x,y,w,h}]` no registro ganham seno independente. Tartaruga usa as quatro; baleia cauda e peitorais.
- Mais: roll ±4°, respiração ±2% de escala, deriva vertical, flip espelhado ao mudar direção com 300ms de afinamento.
- Turvo: sprite escuro e borrado. Revelado: gradiente de contraluz do farol + brilho na borda superior.
- Escala relativa correta: tartaruga pequena, jubarte não cabe inteira — entra e passa. Comportamento por espécie: tartaruga rema devagar; jubarte passa lenta e enorme com cauda subindo; peixe-boi paira e sobe pra respirar; manta plana "voa" batendo as asas.

## Espécies provisórias (a professora confirma). Verificar cada fato antes de entrar no JSON; se não bater, trocar por outro verificável mantendo a ordem mediana→fácil. Não inventar.
1. Tartaruga-verde · recife, 20 m · aceitos: tartaruga, tartaruga-verde, aruanã · cache +40.000
   - "Detectado em recife raso. Respira ar, sobe à superfície a cada poucos minutos."
   - "Volta sempre à mesma praia onde nasceu para desovar."
   - "Réptil marinho com casco. Pode viver mais de 70 anos."
2. Baleia-jubarte · Abrolhos, aberto, 40 m · aceitos: baleia, jubarte, baleia-jubarte · +70.000
   - "Contato de grande porte. Migra da Antártida até o litoral da Bahia todo inverno para se reproduzir."
   - "Captado canto de baixa frequência. Os machos cantam por horas."
   - "Mamífero. Saltos e batidas de cauda são sua marca."
3. Peixe-boi-marinho · mangue, 5 m, água marrom · aceitos: peixe-boi, peixe-boi-marinho, manati · +50.000
   - "Detectado em manguezal do litoral norte. Herbívoro: come plantas aquáticas."
   - "Mamífero lento, dócil. Um dos mais ameaçados do Brasil."
   - "Parente do elefante. Sobe para respirar pelas narinas do focinho."
4. Arraia-manta · aberto, 30 m · aceitos: arraia, raia, manta, arraia-manta, jamanta · +80.112
   - "Contato plano, envergadura de vários metros. Filtra plâncton da água."
   - "Não tem ferrão. Salta fora d'água."
   - "Parente dos tubarões. Nada batendo as 'asas'."
Fichas correspondentes em fichas.json, mesma regra.

## Painel cache
Contador grande com rolagem de dígitos (odômetro), rótulo `CACHE DE ESPÉCIES`, barra de progresso, grade de 4 slots preenchidos com a silhueta pequena de cada espécie identificada. Aberto durante toda a ident, canto superior direito da área central — medir colisão com câmera grande e legenda a 1366×768.

## Câmera turva
Parâmetro do mundo `turbidez: 0..1` e `tom: "recife" | "mangue" | "aberto"`. Transição suave 1.5s. Console `turbidez 0.8` pra debug.

## Entrega
Via file://: 4 espécies com PNGs de teste, turbidez limpando, warp de tiras (2 frames com 100ms de diferença), cache rolando até 240.112, X revelando. 60 fps com câmera grande + cache + orbe + log. Listar PNGs necessários com nome exato. PARE.
