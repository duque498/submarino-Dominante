#!/usr/bin/env python3
"""
Gera a voz da IA de bordo a partir dos roteiros.

Fluxo:
  1. lê src/roteiros/*.json e src/console/respostas.ts e extrai TODA linha
     que a IA fala;
  2. sintetiza UMA linha por vez com o motor escolhido (cacheado por hash);
  3. aplica o filtro de intercomunicador com ffmpeg;
  4. concatena as linhas de cada cena com 600 ms de silêncio entre elas (mais
     o `pausaDepois` da linha, quando ela pedir), virando
     public/audio/<turma>/<id>.mp3;
  5. escreve public/audio/<turma>/tempos.json com o offset real de cada linha
     dentro do mp3 — é o que deixa a legenda trocar de linha na hora exata;
  6. chama embutir_audios.py, que monta a camada A (public/audios.js).

Duas coisas são declaradas por LINHA no roteiro e valem pra qualquer cena:
`prosodia: { rate, pitch }`, que muda ritmo e tom só daquela fala, e
`pausaDepois`, silêncio em ms depois dela. A pausa entra no concat E nos
offsets do tempos.json, então a legenda a respeita sem saber que ela existe.

Precisa de ffmpeg no PATH. O motor padrão (kokoro) roda a rede neural na
própria máquina: só baixa o modelo na primeira vez, depois funciona sem
internet. O motor edge fala com o serviço da Microsoft e precisa de rede
sempre. A apresentação em si roda offline em qualquer caso.

Uso:
    python3 scripts/gerar_audios.py                 # todas as turmas
    python3 scripts/gerar_audios.py --turma 2a
    python3 scripts/gerar_audios.py --sem-filtro    # sem o filtro de rádio
    python3 scripts/gerar_audios.py --forcar        # ignora o cache
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ROTEIROS = RAIZ / "src" / "roteiros"
RESPOSTAS_TS = RAIZ / "src" / "console" / "respostas.ts"
SAIDA_AUDIO = RAIZ / "public" / "audio"
CONFIG = Path(__file__).resolve().parent / "config.json"
CACHE_JSON = Path(__file__).resolve().parent / ".cache.json"
CACHE_DIR = Path(__file__).resolve().parent / ".cache"

MODELOS = Path(__file__).resolve().parent / ".modelos"
KOKORO_MODELO = MODELOS / "kokoro-v1.0.onnx"
KOKORO_VOZES = MODELOS / "voices-v1.0.bin"
KOKORO_RELEASE = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
)

TURMAS = ("2a", "2b", "3a")
PASTA_SISTEMA = "sistema"
MS_SILENCIO = 600
# Batida entre os pedaços de UMA fala.
#
# 120 ms e não 260: cada pedaço já vem com o silêncio de cabeça e de cauda que
# o próprio sintetizador põe. Medido no dossiê, a 260 o vão real entre pedaços
# ficava de 0,40 a 0,82 s — pausa de FRASE, não respiração de meio de frase, e
# a cena inteira crescia cinco segundos.
MS_BATIDA = 120
# Piso do vão entre duas falas, por mais que a linha peça pra emendar. Abaixo
# disso a frase seguinte começa em cima da anterior.
MS_MINIMO_ENTRE = 150
# Parâmetros fixos do mp3: o concat com -c copy exige que todos batam.
TAXA = 24000
CANAIS = 1
BITRATE = "48k"
# Dois filtros de intercomunicador. O pesado corta a fundamental e ecoa: dá
# muito caráter de rádio, mas só sobra voz inteligível se a fonte for gorda
# como a do edge. O leve corta menos e compensa com compressor — é o que os
# outros dois motores usam, por motivos opostos: o espeak é síntese por
# formantes e já nasce fino (o filtro pesado borra os formantes e vira ruído),
# e o kokoro é neural e natural demais pra desperdiçar num corte agressivo.
FILTRO_RADIO = "highpass=f=300,lowpass=f=3400,aecho=0.8:0.9:60:0.3,volume=1.4"
# O compressor com makeup é o que faz a voz atravessar o barulho de uma quadra
# cheia: sobe o corpo da fala sem soltar os picos. Um volume= simples não serve
# — levanta tudo junto e encosta no teto.
#
# O teto do limiter é 0.89 (~-1 dB) e não 0.97 por um motivo medido: a 0.97 os
# 25 arquivos do 2A decodificavam com pico entre +0,12 e +0,34 dBFS. O mp3 não
# sai cortado (flat factor 0), mas o decodificador estoura na saída, e isso
# vira distorção em DAC de Chromebook no volume máximo. A 0.89 o pior pico é
# -0,14 dBFS e a média ficou em -14,4 dB — folga de graça, sem perder volume.
#
# CLAREZA (revisao): tres coisas estavam comendo a inteligibilidade numa caixa
# de som de quadra, e as tres eram do filtro, nao da voz.
#
#   1. lowpass em 5200 Hz cortava a faixa do "s", do "ch" e do "t". Subiu pra
#      7400: ainda soa radio, mas a consoante volta. E a consoante que diz a
#      PALAVRA — a vogal so diz a melodia.
#   2. o eco de 38 ms com 16% de mistura era um slapback curto demais pra ser
#      ouvido como eco e longo demais pra nao borrar o ataque de cada silaba.
#      Caiu pra 24 ms e 9%: sobra a impressao de cabine, sai o borrao.
#   3. faltava presenca. Um realce de 3 dB em 2,8 kHz e um corte de 2,5 dB em
#      330 Hz tiram o abafado e poem a voz na frente do ruido da sala, sem
#      mexer no volume.
FILTRO_RADIO_LEVE = (
    "highpass=f=170,"
    "equalizer=f=330:t=q:w=1.1:g=-2.5,"
    "equalizer=f=2800:t=q:w=1.4:g=3,"
    "lowpass=f=7400,"
    "aecho=0.92:0.85:24:0.09,"
    "acompressor=threshold=-14dB:ratio=3:attack=8:release=200:makeup=6,"
    "alimiter=limit=0.89:level=disabled"
)
# Mesma cadeia com o compressor aberto, pras falas que pedem `dinamica:
# "preservada"`.
#
# Medido nas 17 falas do dossie: o compressor a 3:1 derruba o crest (pico menos
# RMS) de 15,3 dB pra 9,7 dB. Crest e o que faz a silaba acentuada SOAR
# acentuada — comprimir a 3:1 e o que transforma uma fala com emocao numa
# locucao de aeroporto. A 1,8:1 sobra quase tudo, e o makeup cai junto pra a
# linha nao ficar mais alta que as vizinhas.
#
# Nao e o padrao de proposito: o 3:1 existe pra voz atravessar o barulho de uma
# quadra cheia. Quem pede isto esta dizendo que naquele momento a sala esta em
# silencio.
FILTRO_DINAMICO = FILTRO_RADIO_LEVE.replace(
    "acompressor=threshold=-14dB:ratio=3:attack=8:release=200:makeup=6",
    "acompressor=threshold=-16dB:ratio=1.8:attack=12:release=240:makeup=3.5",
)


# --- extração das falas ----------------------------------------------------


class Fala:
    """Uma linha que a IA diz. `grupo` é o mp3 final em que ela vai parar."""

    def __init__(
        self,
        pasta: str,
        grupo: str,
        indice: int,
        texto: str,
        prosodia: dict | None = None,
        pausa_depois: int = 0,
        falado: list[tuple[str, float | None]] | None = None,
    ):
        self.pasta = pasta
        self.grupo = grupo
        self.indice = indice
        # `texto` é o que vai pra tela; `pedacos` é o que vai pro sintetizador,
        # um ou mais. Quando a linha não pede grafia própria, é o texto inteiro.
        self.texto = texto.strip()
        self.pedacos = falado or [(texto.strip(), None)]
        # rate/pitch desta linha, sobrescrevendo o da turma. Genérico: vale pra
        # qualquer cena de qualquer turma.
        self.prosodia = prosodia or {}
        # Ajuste do silêncio DEPOIS desta linha, em ms, somado aos 600 de
        # sempre. Pode ser NEGATIVO, pra emendar duas falas mais perto — numa
        # troca rápida os 600 ms padrão são uma eternidade. Entra no concat e
        # nos offsets, então a legenda respeita sem precisar saber.
        self.pausa_depois = int(pausa_depois or 0)

    @property
    def falado(self) -> str:
        """Os pedaços juntos, só pra listagem e log."""
        return " ".join(t for t, _ in self.pedacos)


def texto_da_linha(linha) -> str:
    """
    Uma linha do roteiro pode ser uma string OU um objeto com ações.

    A Fase 3.5 trocou o modelo (`{ "texto": "...", "acoes": [...] }`) e este
    script continuou lendo só strings — quebrava na primeira cena migrada. Como
    os mp3 já estavam gerados, ninguém notou até tentar regerar. Os dois
    formatos valem, e o roteiro escolhe o que for mais legível por linha.
    """
    if isinstance(linha, dict):
        return str(linha.get("texto") or "")
    return str(linha or "")


def fala_da_linha(linha) -> list[tuple[str, float | None]] | None:
    """
    A grafia que vai pro sintetizador, quando ela difere da que vai pra tela.

    O fonemizador do kokoro é o espeak-ng, e ele lê "Otodus megalodon" como
    `ˌotodˈuz` — acento na última sílaba. Com "Otôdus" sai `ˌotˈoduz`, que é o
    nome certo. A legenda continua escrevendo "Otodus": quem lê vê o nome como
    ele se escreve, quem ouve ouve como ele se fala.
    """
    if isinstance(linha, dict):
        f = linha.get("fala")
        if isinstance(f, str) and f.strip():
            return [(f.strip(), None)]
        # Lista = a MESMA frase dita em pedaços, com uma batida entre eles.
        #
        # Nenhuma pontuação produz pausa dentro de uma frase no kokoro —
        # medido: reticências, vírgula, travessão e ponto dão todos zero
        # silêncio interno. A única forma de o bicho respirar no meio da frase
        # é sintetizar os pedaços separados e emendar com silêncio, que é o
        # que a concatenação já faz entre falas.
        if isinstance(f, list):
            pedacos: list[tuple[str, float | None]] = []
            for x in f:
                # Um pedaço pode trazer `cortarApos`: sintetiza um texto mais
                # longo e joga fora o resto. É a saída pra uma palavra que o
                # modelo relaxa quando ela é a ÚLTIMA da frase — com uma
                # palavra de apoio depois dela, ela sai inteira, e a palavra de
                # apoio some no corte. O ponto de corte é medido no envelope de
                # energia, uma vez; o modelo é determinístico (conferido: o
                # mesmo texto dá os mesmos bytes), então ele não escorrega.
                if isinstance(x, dict):
                    t = str(x.get("texto") or "").strip()
                    if not t:
                        continue
                    corte = x.get("cortarApos")
                    pedacos.append((t, float(corte) if corte else None))
                elif str(x).strip():
                    pedacos.append((str(x).strip(), None))
            if pedacos:
                return pedacos
    return None


def prosodia_da_linha(linha) -> dict:
    """`{ "rate": "-15%", "pitch": "-4Hz" }` de uma linha, ou vazio."""
    if isinstance(linha, dict):
        p = linha.get("prosodia")
        if isinstance(p, dict):
            return p
    return {}


def pausa_da_linha(linha) -> int:
    """`pausaDepois` em ms, ou 0."""
    if isinstance(linha, dict):
        try:
            return int(linha.get("pausaDepois") or 0)
        except (TypeError, ValueError):
            return 0
    return 0


def falas_do_roteiro(turma: str, roteiro: dict) -> list[Fala]:
    falas: list[Fala] = []

    def juntar(grupo: str, linhas: list | None):
        if not linhas:
            return
        for i, linha in enumerate(linhas):
            texto = texto_da_linha(linha)
            if texto.strip():
                falas.append(
                    Fala(
                        turma,
                        grupo,
                        i,
                        texto,
                        prosodia_da_linha(linha),
                        pausa_da_linha(linha),
                        fala_da_linha(linha),
                    )
                )

    for cena in roteiro.get("cenas", []):
        cid = cena.get("id", "?")
        tipo = cena.get("tipo")

        # Os reparos não pertencem a um tipo de cena: são um campo da base, e
        # qualquer cena pode ter. Ficam fora do switch por isso.
        for reparo in cena.get("reparos") or []:
            juntar(f"reparo-{reparo['subsistema'].lower()}", reparo.get("fala"))

        if tipo in ("fala", "transicao"):
            juntar(cid, cena.get("tela", {}).get("linhas"))
        elif tipo == "apresentacao":
            # Apresentação só tem áudio se o JSON declarar um.
            pass
        elif tipo == "quiz":
            juntar(f"{cid}-pergunta", [cena.get("pergunta")])
            juntar(f"{cid}-acerto", cena.get("falaAcerto"))
            juntar(f"{cid}-erro", cena.get("falaErro"))
        elif tipo == "vf":
            juntar(f"{cid}-afirmacao", [cena.get("afirmacao")])
            juntar(f"{cid}-acerto", cena.get("falaAcerto"))
            juntar(f"{cid}-erro", cena.get("falaErro"))
        elif tipo == "pane":
            juntar(f"{cid}-entrada", cena.get("falaEntrada"))
            juntar(f"{cid}-retorno", cena.get("falaRetorno"))
        elif tipo == "emergencia":
            # Dois mp3 e não um: entre a queda e o retorno a tela de falha fica
            # travada por segundos, e um arquivo só emendaria por cima dela.
            juntar(f"{cid}-queda", cena.get("falasQueda"))
            juntar(f"{cid}-retorno", cena.get("falasRetorno"))
        elif tipo == "hidrofone":
            falas_hidro = cena.get("falas", {})
            for chave in ("inicio", "acerto", "revelado"):
                for n, bloco in enumerate(falas_hidro.get(chave) or [], start=1):
                    juntar(f"{cid}-{chave}-{n}", bloco)
            # Uma pista por som, com o id no nome: trocar um som não embaralha
            # os arquivos dos outros.
            for som in cena.get("sons") or []:
                juntar(f"{cid}-{som['id']}-pista", [som.get("pista")])
        elif tipo == "combate":
            # Cada fala do combate vira um mp3 próprio, porque elas não são
            # ditas em sequência: entre uma e outra a plateia responde. Os nomes
            # batem com o campo `audio` do JSON — se mudar aqui, muda lá.
            falas_combate = cena.get("falas", {})
            for chave in ("rodada", "acerto", "erro", "perdido", "retorno"):
                for n, bloco in enumerate(falas_combate.get(chave) or [], start=1):
                    juntar(f"{cid}-{chave}-{n}", bloco)
            juntar(f"{cid}-critico", falas_combate.get("critico"))
        elif tipo == "identificacao":
            # As falas da identificação também não são ditas em sequência: entre
            # uma e outra a plateia está tentando reconhecer o bicho. Cada uma
            # vira um mp3, e os nomes batem com o `audio` do JSON.
            falas_ident = cena.get("falas", {})
            for chave in ("inicio", "acerto", "revelado"):
                for n, bloco in enumerate(falas_ident.get(chave) or [], start=1):
                    juntar(f"{cid}-{chave}-{n}", bloco)
            # As pistas são por espécie, na ordem — e o nome traz o id dela, pra
            # trocar uma espécie não embaralhar os arquivos das outras.
            for especie in cena.get("especies") or []:
                for n, pista in enumerate(especie.get("pistas") or [], start=1):
                    juntar(f"{cid}-{especie['id']}-pista-{n}", [pista])
                # A fala sobre a espécie é UM mp3: ela é dita de uma vez, com a
                # sala olhando o bicho, e cortá-la em pedaços criaria pausas
                # onde não há motivo pra nenhuma.
                juntar(f"{cid}-{especie['id']}-sobre", especie.get("curiosidade"))

    return falas


def falas_do_console() -> list[Fala]:
    """Lê as respostas fixas de src/console/respostas.ts."""
    if not RESPOSTAS_TS.is_file():
        return []
    texto = RESPOSTAS_TS.read_text(encoding="utf-8")
    bloco = re.search(r"export const RESPOSTAS = \{(.*?)\n\}", texto, re.S)
    if not bloco:
        print("aviso: não achei o bloco RESPOSTAS em respostas.ts", file=sys.stderr)
        return []
    pares = re.findall(r"^\s*(\w+):\s*'([^']*)',\s*$", bloco.group(1), re.M)
    return [Fala(PASTA_SISTEMA, chave, 0, valor) for chave, valor in pares]


# --- ferramentas externas --------------------------------------------------


def exigir(programa: str, como_instalar: str):
    if shutil.which(programa) is None:
        print(f"\nerro: '{programa}' não está no PATH.", file=sys.stderr)
        print(f"       {como_instalar}\n", file=sys.stderr)
        raise SystemExit(1)


def rodar(comando: list[str], descricao: str):
    resultado = subprocess.run(comando, capture_output=True, text=True)
    if resultado.returncode != 0:
        print(f"\nerro em {descricao}:", file=sys.stderr)
        print(resultado.stderr.strip()[-1500:], file=sys.stderr)
        raise SystemExit(1)


def duracao_ms(caminho: Path) -> int:
    saida = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0", str(caminho),
        ],
        capture_output=True, text=True,
    )
    try:
        return int(round(float(saida.stdout.strip()) * 1000))
    except ValueError:
        return 0


# O modelo sobe uma vez só: carregar o ONNX leva alguns segundos, e são 25
# falas. Sem isto o script gastaria mais tempo carregando que sintetizando.
_kokoro = None


def baixar_modelos_kokoro():
    """
    Busca o modelo no release do GitHub, uma vez. São ~350 MB, então ficam
    fora do repositório (.gitignore) — quem clonar baixa na primeira execução.
    """
    import urllib.request

    MODELOS.mkdir(parents=True, exist_ok=True)
    for caminho, aprox in ((KOKORO_MODELO, "310 MB"), (KOKORO_VOZES, "27 MB")):
        if caminho.is_file() and caminho.stat().st_size > 1_000_000:
            continue
        print(f"  baixando {caminho.name} (~{aprox}, só na primeira vez)...")
        parcial = caminho.with_suffix(caminho.suffix + ".parcial")
        try:
            urllib.request.urlretrieve(KOKORO_RELEASE + caminho.name, parcial)
        except Exception as erro:  # rede caiu, proxy barrou, disco cheio
            parcial.unlink(missing_ok=True)
            print(f"\nerro ao baixar {caminho.name}: {erro}", file=sys.stderr)
            print("       sem o modelo o motor kokoro não roda.", file=sys.stderr)
            print("       use --motor espeak (offline) ou --motor edge.", file=sys.stderr)
            raise SystemExit(1)
        # Só vira o arquivo definitivo depois de completo: um download cortado
        # no meio não pode passar pelo teste de existência da próxima execução.
        parcial.replace(caminho)


# --- prosódia por linha ----------------------------------------------------
#
# `prosodia: { rate, pitch }` no JSON vale pra QUALQUER linha de qualquer cena.
# A regra é uma só, e os três motores a aplicam nas unidades deles:
#
#   `rate` é RELATIVO AO RITMO NORMAL daquela voz. "-15%" é quinze por cento
#   mais devagar que o normal, tanto no edge (que tem parâmetro de rate e
#   recebe o valor direto, substituindo o da turma) quanto no kokoro e no
#   espeak (onde vira multiplicador da velocidade configurada).
#
#   `pitch` vem em Hz, que é a unidade do edge-tts. O edge recebe direto; o
#   kokoro e o espeak não têm parâmetro de tom, então o deslocamento vira uma
#   RAZÃO de frequência aplicada no ffmpeg.

# F0 mediana da voz do kokoro (pf_dora), medida por autocorrelação em 1535
# janelas com energia dos mp3 já gerados: 175 Hz (p25 160, p75 195). É o que
# converte "-4Hz" numa razão — sem uma base medida, o número em Hz não
# significa nada fora do edge.
F0_BASE_HZ = 175.0


def fator_de_rate(rate: str | None) -> float:
    """'-15%' -> 0.85. Sem valor, 1.0."""
    if not rate:
        return 1.0
    achado = re.fullmatch(r"\s*([+-]?\d+(?:\.\d+)?)\s*%\s*", str(rate))
    if not achado:
        print(f"aviso: rate {rate!r} não entendido, ignorando.", file=sys.stderr)
        return 1.0
    return max(0.3, 1 + float(achado.group(1)) / 100)


def razao_de_pitch(pitch: str | None) -> float:
    """'-4Hz' -> 0.977, em cima da F0 medida. Sem valor, 1.0."""
    if not pitch:
        return 1.0
    achado = re.fullmatch(r"\s*([+-]?\d+(?:\.\d+)?)\s*[Hh][Zz]\s*", str(pitch))
    if not achado:
        print(f"aviso: pitch {pitch!r} não entendido, ignorando.", file=sys.stderr)
        return 1.0
    return max(0.5, min(2.0, (F0_BASE_HZ + float(achado.group(1))) / F0_BASE_HZ))


_tem_rubberband: bool | None = None


def tem_rubberband() -> bool:
    """O ffmpeg desta máquina foi compilado com o rubberband?"""
    global _tem_rubberband
    if _tem_rubberband is None:
        saida = subprocess.run(
            ["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True
        ).stdout
        _tem_rubberband = bool(re.search(r"^\s*\S*\s+rubberband\s", saida, re.M))
    return _tem_rubberband


def filtro_de_pitch(razao: float) -> str:
    """
    Desloca o tom sem mexer na duração, preservando os FORMANTES.

    Formante é o que identifica a vogal e, junto, o "tamanho" de quem fala.
    Deslocar o tom arrastando os formantes junto é o que faz voz virar
    esquilo — ou, num deslocamento pequeno como o daqui, sair anasalada em
    algumas palavras (as que têm formante perto da faixa deslocada).

    `rubberband=formant=preserved` desloca só a fundamental. A alternativa
    `asetrate`+`atempo` arrasta os formantes E ainda emenda o áudio por WSOLA,
    que borra transiente. Ela fica de reserva pra um ffmpeg sem rubberband.
    """
    if abs(razao - 1) < 0.001:
        return ""
    if tem_rubberband():
        return f"rubberband=pitch={razao:.6f}:pitchq=quality:formant=preserved"
    print(
        "aviso: ffmpeg sem rubberband — o tom vai por asetrate/atempo, que "
        "arrasta o formante.",
        file=sys.stderr,
    )
    return f"asetrate={TAXA}*{razao:.6f},aresample={TAXA},atempo={1 / razao:.6f}"


def carregar_kokoro():
    global _kokoro
    if _kokoro is None:
        baixar_modelos_kokoro()
        from kokoro_onnx import Kokoro

        print("  carregando o modelo de voz...")
        _kokoro = Kokoro(str(KOKORO_MODELO), str(KOKORO_VOZES))
    return _kokoro


def sintetizar_kokoro(texto: str, destino: Path, config: dict, rate: str | None = None):
    """
    Motor padrão: rede neural rodando localmente. Voz natural sem depender de
    serviço nenhum — o que importa aqui, porque quem apresenta não tem terminal
    e o edge-tts exige internet.

    Escreve WAV com extensão .mp3 de propósito: quem lê isso é o ffmpeg do
    aplicar_filtro, que vai pelo conteúdo e não pelo nome. Mesmo caminho do
    espeak, logo abaixo.
    """
    import soundfile as sf

    kokoro = carregar_kokoro()
    cfg = config.get("kokoro", {})
    amostras, taxa = kokoro.create(
        texto,
        voice=cfg.get("voz", "pf_dora"),
        speed=float(cfg.get("velocidade", 0.95)) * fator_de_rate(rate),
        lang=cfg.get("idioma", "pt-br"),
    )
    sf.write(str(destino), amostras, taxa, format="WAV")


def sintetizar_espeak(texto: str, destino: Path, config: dict, rate: str | None = None):
    """
    Motor offline, de emergência. O espeak-ng é síntese por formantes: soa
    robótico perto de uma voz neural. Existe aqui por um motivo prático — quem
    apresenta pode não ter máquina com terminal e internet pra rodar o edge-tts,
    e uma IA de bordo com voz de robô é melhor que uma IA muda.

    Passando pelo filtro de intercomunicador, o resultado fica aceitável como
    "computador de bordo". Pra a voz de verdade, use o motor edge.
    """
    espeak = config.get("espeak", {})
    wav = destino.with_suffix(".wav")
    comando = [
        "espeak-ng",
        "-v", espeak.get("voz", "pt-br+f3"),
        "-s", str(int(espeak.get("velocidade", 148) * fator_de_rate(rate))),
        "-p", str(espeak.get("tom", 42)),
        "-a", str(espeak.get("amplitude", 190)),
        "-g", str(espeak.get("pausa", 8)),
        "-w", str(wav),
        texto,
    ]
    resultado = subprocess.run(comando, capture_output=True, text=True)
    if resultado.returncode != 0 or not wav.exists():
        print(f"\nerro no espeak-ng: {texto[:60]!r}", file=sys.stderr)
        print(f"       {resultado.stderr.strip()[-400:]}", file=sys.stderr)
        raise SystemExit(1)
    wav.replace(destino)


def sintetizar(texto: str, voz: str, rate: str, pitch: str, destino: Path):
    """edge-tts numa linha. Erros de rede aparecem aqui."""
    comando = [
        sys.executable, "-m", "edge_tts",
        "--voice", voz,
        "--rate", rate,
        "--pitch", pitch,
        "--text", texto,
        "--write-media", str(destino),
    ]
    resultado = subprocess.run(comando, capture_output=True, text=True)
    if resultado.returncode != 0 or not destino.exists() or destino.stat().st_size == 0:
        erro = resultado.stderr.strip()
        print(f"\nerro ao sintetizar: {texto[:60]!r}", file=sys.stderr)
        if "CERTIFICATE_VERIFY_FAILED" in erro:
            print("       problema de certificado TLS. Se você está atrás de um", file=sys.stderr)
            print("       proxy corporativo, aponte o certifi pra CA dele.", file=sys.stderr)
        elif "getaddrinfo" in erro or "Cannot connect" in erro or "403" in erro:
            print("       sem acesso ao serviço de síntese da Microsoft.", file=sys.stderr)
            print("       O edge-tts PRECISA de internet. A apresentação roda", file=sys.stderr)
            print("       offline, mas a geração da voz não — rode isto em casa.", file=sys.stderr)
        else:
            print(f"       {erro[-600:]}", file=sys.stderr)
        raise SystemExit(1)


def cadeia_radio(motor: str, dinamica: bool) -> str:
    """O filtro de intercomunicador do motor, na versão normal ou aberta."""
    if motor == "edge":
        return FILTRO_RADIO
    return FILTRO_DINAMICO if dinamica else FILTRO_RADIO_LEVE


def filtro_atual(
    com_filtro: bool, motor: str, pitch_extra: str = "", dinamica: bool = False
) -> str:
    """A cadeia de filtros que vai ser aplicada. Entra na chave do cache."""
    base = "sem-filtro" if not com_filtro else cadeia_radio(motor, dinamica)
    return f"{pitch_extra},{base}" if pitch_extra else base


def aplicar_filtro(
    origem: Path,
    destino: Path,
    com_filtro: bool,
    motor: str = "kokoro",
    pitch_extra: str = "",
    dinamica: bool = False,
):
    """Normaliza taxa/canais/bitrate — sem isso o concat com -c copy falha."""
    comando = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(origem)]
    # O deslocamento de tom vem ANTES do filtro de rádio: reamostrar depois da
    # equalização moveria junto as bandas que o filtro acabou de posicionar.
    cadeia = [p for p in (pitch_extra, cadeia_radio(motor, dinamica)) if p]
    if not com_filtro:
        cadeia = [p for p in (pitch_extra,) if p]
    if cadeia:
        comando += ["-af", ",".join(cadeia)]
    comando += ["-ar", str(TAXA), "-ac", str(CANAIS), "-b:a", BITRATE, str(destino)]
    rodar(comando, "filtro de intercomunicador")


def cortar(origem: Path, destino: Path, segundos: float):
    """
    Corta o áudio em `segundos`, com um fade de 20 ms pra não estalar.

    Cortar no seco deixa um clique: a onda para no meio de um ciclo e o
    alto-falante tem que pular pro zero de uma vez.
    """
    rodar(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(origem),
            "-t", f"{segundos:.3f}",
            "-af", f"afade=t=out:st={max(0.0, segundos - 0.02):.3f}:d=0.02",
            "-ar", str(TAXA), "-ac", str(CANAIS), "-b:a", BITRATE,
            str(destino),
        ],
        "corte do pedaço",
    )


def gerar_silencio(destino: Path, ms: int = MS_SILENCIO):
    rodar(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi",
            "-i", f"anullsrc=r={TAXA}:cl=mono",
            "-t", str(ms / 1000),
            "-ar", str(TAXA), "-ac", str(CANAIS), "-b:a", BITRATE,
            str(destino),
        ],
        "geração do silêncio",
    )


def silencio_de(ms: int) -> Path:
    """Um mp3 de silêncio por duração, cacheado. `pausaDepois` usa isto."""
    arquivo = CACHE_DIR / f"_silencio-{int(ms)}.mp3"
    if not arquivo.exists():
        gerar_silencio(arquivo, ms)
    return arquivo


def concatenar(partes: list[Path], destino: Path):
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as lista:
        for parte in partes:
            lista.write(f"file '{parte.as_posix()}'\n")
        caminho_lista = lista.name
    try:
        rodar(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "concat", "-safe", "0",
                "-i", caminho_lista,
                "-c", "copy", str(destino),
            ],
            "concatenação das linhas",
        )
    finally:
        Path(caminho_lista).unlink(missing_ok=True)


# --- programa --------------------------------------------------------------


def carregar_config() -> dict:
    if CONFIG.is_file():
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    return {"padrao": {"voz": "pt-BR-FranciscaNeural", "rate": "-8%", "pitch": "-2Hz"}}


def voz_da_pasta(config: dict, pasta: str, args) -> tuple[str, str, str]:
    padrao = config.get("padrao", {})
    especifico = config.get("turmas", {}).get(pasta, {})
    voz = args.voz or especifico.get("voz") or padrao.get("voz", "pt-BR-FranciscaNeural")
    rate = args.rate or especifico.get("rate") or padrao.get("rate", "-8%")
    pitch = args.pitch or especifico.get("pitch") or padrao.get("pitch", "-2Hz")
    return voz, rate, pitch


def perfil_do_motor(motor: str, config: dict, voz: str, rate: str, pitch: str) -> str:
    """
    Identidade do motor pro cache. Tem que carregar TODO parâmetro que muda o
    áudio: se ficar de fora, mexer nele reaproveita o mp3 antigo sem avisar —
    e você fica achando que a mudança não pegou.
    """
    if motor == "kokoro":
        cfg = config.get("kokoro", {})
        return (f"kokoro|{cfg.get('voz', 'pf_dora')}"
                f"|{cfg.get('velocidade', 0.95)}|{cfg.get('idioma', 'pt-br')}")
    if motor == "espeak":
        cfg = config.get("espeak", {})
        campos = ("voz", "velocidade", "tom", "amplitude", "pausa")
        return "espeak|" + "|".join(str(cfg.get(c)) for c in campos)
    return f"edge|{voz}|{rate}|{pitch}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Gera a voz da IA do Submarino DOMI.")
    ap.add_argument("--turma", action="append", choices=TURMAS, help="só esta turma (repetível)")
    ap.add_argument("--voz", help="sobrescreve a voz de todas as turmas")
    ap.add_argument("--rate", help='ex.: "-8%%"')
    ap.add_argument("--pitch", help='ex.: "-2Hz"')
    ap.add_argument("--sem-filtro", action="store_true", help="sem o filtro de rádio")
    ap.add_argument("--forcar", action="store_true", help="ignora o cache e regera tudo")
    ap.add_argument("--so-listar", action="store_true", help="lista as falas e sai")
    ap.add_argument(
        "--motor",
        choices=("kokoro", "edge", "espeak"),
        default="kokoro",
        help="kokoro = voz neural local (padrão); edge = neural via internet; "
             "espeak = offline, robótico",
    )
    args = ap.parse_args()

    com_filtro = not args.sem_filtro
    config = carregar_config()
    turmas = args.turma or list(TURMAS)

    # 1) juntar tudo que a IA fala
    falas: list[Fala] = []
    for turma in turmas:
        arquivo = ROTEIROS / f"{turma}.json"
        if not arquivo.is_file():
            print(f"aviso: {arquivo.name} não existe, pulando.", file=sys.stderr)
            continue
        falas += falas_do_roteiro(turma, json.loads(arquivo.read_text(encoding="utf-8")))
    falas += falas_do_console()

    if not falas:
        print("nenhuma fala encontrada nos roteiros.")
        return 0

    grupos: dict[tuple[str, str], list[Fala]] = {}
    for fala in falas:
        grupos.setdefault((fala.pasta, fala.grupo), []).append(fala)
    for lista in grupos.values():
        lista.sort(key=lambda f: f.indice)

    if args.so_listar:
        for (pasta, grupo), lista in sorted(grupos.items()):
            print(f"{pasta}/{grupo}.mp3  ({len(lista)} linha(s))")
            for fala in lista:
                marca = f"   (falado: {fala.falado})" if fala.falado != fala.texto else ""
                print(f"    {fala.texto}{marca}")
        print(f"\ntotal: {len(falas)} linhas em {len(grupos)} arquivos")
        return 0

    exigir("ffmpeg", "instale com: sudo apt install ffmpeg  (ou brew install ffmpeg)")
    exigir("ffprobe", "vem junto com o ffmpeg")
    if args.motor == "espeak":
        exigir("espeak-ng", "instale com: sudo apt install espeak-ng")
    elif args.motor == "kokoro":
        try:
            import kokoro_onnx  # noqa: F401
            import soundfile  # noqa: F401
        except ImportError:
            print("\nerro: o motor kokoro não está instalado.", file=sys.stderr)
            print("       pip install -r scripts/requirements.txt", file=sys.stderr)
            print("       ou use --motor espeak (offline, voz robótica)\n", file=sys.stderr)
            return 1
    else:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            print("\nerro: edge-tts não está instalado.", file=sys.stderr)
            print("       pip install -r scripts/requirements.txt", file=sys.stderr)
            print("       ou use --motor kokoro (neural, roda local)\n", file=sys.stderr)
            return 1

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = json.loads(CACHE_JSON.read_text(encoding="utf-8")) if CACHE_JSON.is_file() else {}

    silencio = CACHE_DIR / "_silencio.mp3"
    if not silencio.exists():
        gerar_silencio(silencio)

    # 2 e 3) sintetizar linha a linha, com cache
    gerados = 0
    do_cache = 0
    caminhos: dict[int, list[Path]] = {}

    for (pasta, _grupo), lista in sorted(grupos.items()):
        voz, rate, pitch = voz_da_pasta(config, pasta, args)
        for fala in lista:
            # Prosódia da LINHA sobrescreve a da turma. No edge os dois
            # parâmetros vão direto pro sintetizador; nos outros dois motores o
            # rate vira multiplicador de velocidade e o pitch vira um filtro.
            rate_linha = fala.prosodia.get("rate") or None
            pitch_linha = fala.prosodia.get("pitch") or None
            rate_efetivo = rate_linha or rate
            pitch_efetivo = pitch_linha or pitch
            pitch_extra = (
                "" if args.motor == "edge" else filtro_de_pitch(razao_de_pitch(pitch_linha))
            )
            dinamica = fala.prosodia.get("dinamica") == "preservada"
            perfil = perfil_do_motor(args.motor, config, voz, rate_efetivo, pitch_efetivo)
            if args.motor != "edge" and rate_linha:
                perfil += f"|rate:{rate_linha}"
            # DUAS assinaturas: a da sintese e a do filtro.
            #
            # Antes havia uma so, e ela nem citava o filtro — mexer no filtro
            # nao invalidava nada e o ajuste simplesmente nao saia. Citar o
            # filtro numa assinatura unica resolveria isso ao custo de
            # ressintetizar as ~150 linhas das tres turmas a cada ajuste de
            # equalizacao. Guardando o CRU em separado, mexer no filtro passa a
            # ser so um ffmpeg por linha: segundos em vez de meia hora.
            pedacos: list[Path] = []
            for pedaco, cortar_apos in fala.pedacos:
                sufixo_corte = f"|corte:{cortar_apos:.3f}" if cortar_apos else ""
                assinatura_crua = f"{pedaco}|{perfil}{sufixo_corte}"
                chave_crua = hashlib.sha1(assinatura_crua.encode("utf-8")).hexdigest()
                bruto = CACHE_DIR / f"cru-{chave_crua}.mp3"

                assinatura = (
                    f"{assinatura_crua}|"
                    f"{filtro_atual(com_filtro, args.motor, pitch_extra, dinamica)}"
                )
                chave = hashlib.sha1(assinatura.encode("utf-8")).hexdigest()
                destino = CACHE_DIR / f"{chave}.mp3"

                if destino.exists() and cache.get(chave) == assinatura and not args.forcar:
                    do_cache += 1
                else:
                    if not bruto.exists() or args.forcar:
                        print(f"  gerando: {pedaco[:62]}")
                        if args.motor == "espeak":
                            sintetizar_espeak(pedaco, bruto, config, rate_linha)
                        elif args.motor == "kokoro":
                            sintetizar_kokoro(pedaco, bruto, config, rate_linha)
                        else:
                            sintetizar(pedaco, voz, rate_efetivo, pitch_efetivo, bruto)
                        gerados += 1
                    else:
                        print(f"  refiltrando: {pedaco[:58]}")
                    fonte = bruto
                    if cortar_apos:
                        fonte = CACHE_DIR / f"corte-{chave_crua}.mp3"
                        cortar(bruto, fonte, cortar_apos)
                    aplicar_filtro(fonte, destino, com_filtro, args.motor, pitch_extra, dinamica)
                    cache[chave] = assinatura
                pedacos.append(destino)
            caminhos[id(fala)] = pedacos

    CACHE_JSON.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    # 4 e 5) concatenar por grupo e anotar os offsets reais
    tempos: dict[str, dict] = {}
    bytes_totais = 0

    for (pasta, grupo), lista in sorted(grupos.items()):
        destino_dir = SAIDA_AUDIO / pasta
        destino_dir.mkdir(parents=True, exist_ok=True)
        final = destino_dir / f"{grupo}.mp3"

        partes: list[Path] = []
        offsets: list[dict] = []
        acumulado = 0
        for i, fala in enumerate(lista):
            if i > 0:
                # O silêncio entre duas falas: o padrão mais (ou menos) o que a
                # linha ANTERIOR pediu. Fica aqui e não logo depois dela porque
                # silêncio só faz sentido ENTRE duas linhas: depois da última
                # seria rabo morto no fim do mp3.
                vao = max(MS_MINIMO_ENTRE, MS_SILENCIO + lista[i - 1].pausa_depois)
                partes.append(silencio_de(vao))
                acumulado += vao
            # A linha pode ser dita em pedaços. O offset dela vai do começo do
            # primeiro ao fim do último: pra a legenda é UMA linha só.
            inicio = acumulado
            for k, parte in enumerate(caminhos[id(fala)]):
                if k > 0:
                    partes.append(silencio_de(MS_BATIDA))
                    acumulado += MS_BATIDA
                partes.append(parte)
                acumulado += duracao_ms(parte)
            offsets.append({"inicio": inicio, "fim": acumulado})

        concatenar(partes, final)
        bytes_totais += final.stat().st_size

        # O concat de mp3 pode derivar alguns ms; se derivar muito, reescala.
        real = duracao_ms(final)
        if real > 0 and acumulado > 0 and abs(real - acumulado) / acumulado > 0.02:
            fator = real / acumulado
            for o in offsets:
                o["inicio"] = int(o["inicio"] * fator)
                o["fim"] = int(o["fim"] * fator)
            acumulado = real

        tempos.setdefault(pasta, {})[grupo] = {
            "duracaoMs": real or acumulado,
            "linhas": offsets,
        }

    for pasta, dados in tempos.items():
        (SAIDA_AUDIO / pasta).mkdir(parents=True, exist_ok=True)
        (SAIDA_AUDIO / pasta / "tempos.json").write_text(
            json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # 6) camada A
    print("\nmontando a camada A (public/audios.js)...")
    embutir = Path(__file__).resolve().parent / "embutir_audios.py"
    subprocess.run([sys.executable, str(embutir)], check=False)

    audios_js = RAIZ / "public" / "audios.js"
    tamanho_js = audios_js.stat().st_size / (1024 * 1024) if audios_js.is_file() else 0

    print("\n" + "=" * 58)
    print(f"  linhas geradas ............ {gerados}")
    print(f"  linhas reaproveitadas ..... {do_cache} (cache)")
    print(f"  arquivos de cena .......... {len(grupos)}")
    print(f"  tamanho dos mp3 ........... {bytes_totais / (1024 * 1024):.1f} MB")
    print(f"  tamanho do audios.js ...... {tamanho_js:.1f} MB")
    print(f"  filtro de intercomunicador  {'sim' if com_filtro else 'NÃO (--sem-filtro)'}")
    if args.motor == "espeak":
        recado = "  (voz robótica — use --motor kokoro pra voz neural)"
    elif args.motor == "kokoro":
        recado = f"  ({config.get('kokoro', {}).get('voz', 'pf_dora')}, neural, local)"
    else:
        recado = ""
    print(f"  motor ..................... {args.motor}{recado}")
    print("=" * 58)
    print("\nagora rode: npm run build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
