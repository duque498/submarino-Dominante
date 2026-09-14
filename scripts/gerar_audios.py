#!/usr/bin/env python3
"""
Gera a voz da IA de bordo a partir dos roteiros.

Fluxo:
  1. lê src/roteiros/*.json e src/console/respostas.ts e extrai TODA linha
     que a IA fala;
  2. sintetiza UMA linha por vez com edge-tts (cacheado por hash);
  3. aplica o filtro de intercomunicador com ffmpeg;
  4. concatena as linhas de cada cena com 600 ms de silêncio entre elas,
     virando public/audio/<turma>/<id>.mp3;
  5. escreve public/audio/<turma>/tempos.json com o offset real de cada linha
     dentro do mp3 — é o que deixa a legenda trocar de linha na hora exata;
  6. chama embutir_audios.py, que monta a camada A (public/audios.js).

Precisa de internet (o edge-tts fala com o serviço da Microsoft) e de ffmpeg
no PATH. A apresentação em si roda offline: só a geração precisa de rede.

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

TURMAS = ("2a", "2b", "3a")
PASTA_SISTEMA = "sistema"
MS_SILENCIO = 600
# Parâmetros fixos do mp3: o concat com -c copy exige que todos batam.
TAXA = 24000
CANAIS = 1
BITRATE = "48k"
# Filtro de intercomunicador. O do edge corta pesado (corta a fundamental e
# ecoa), o que dá o caráter de rádio sem prejudicar uma voz neural. O espeak é
# síntese por formantes: já nasce fino, e esse mesmo filtro borra os formantes
# e a fala vira ruído. Por isso ele tem um filtro mais leve — o objetivo ali é
# ser ENTENDIDO, não ser bonito.
FILTRO_RADIO = "highpass=f=300,lowpass=f=3400,aecho=0.8:0.9:60:0.3,volume=1.4"
FILTRO_RADIO_LEVE = "highpass=f=170,lowpass=f=5200,aecho=0.9:0.85:38:0.16,volume=1.5"


# --- extração das falas ----------------------------------------------------


class Fala:
    """Uma linha que a IA diz. `grupo` é o mp3 final em que ela vai parar."""

    def __init__(self, pasta: str, grupo: str, indice: int, texto: str):
        self.pasta = pasta
        self.grupo = grupo
        self.indice = indice
        self.texto = texto.strip()


def falas_do_roteiro(turma: str, roteiro: dict) -> list[Fala]:
    falas: list[Fala] = []

    def juntar(grupo: str, linhas: list[str] | None):
        if not linhas:
            return
        for i, linha in enumerate(linhas):
            if linha and linha.strip():
                falas.append(Fala(turma, grupo, i, linha))

    for cena in roteiro.get("cenas", []):
        cid = cena.get("id", "?")
        tipo = cena.get("tipo")

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


def sintetizar_espeak(texto: str, destino: Path, config: dict):
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
        "-s", str(espeak.get("velocidade", 148)),
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


def aplicar_filtro(origem: Path, destino: Path, com_filtro: bool, motor: str = "edge"):
    """Normaliza taxa/canais/bitrate — sem isso o concat com -c copy falha."""
    comando = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(origem)]
    if com_filtro:
        comando += ["-af", FILTRO_RADIO_LEVE if motor == "espeak" else FILTRO_RADIO]
    comando += ["-ar", str(TAXA), "-ac", str(CANAIS), "-b:a", BITRATE, str(destino)]
    rodar(comando, "filtro de intercomunicador")


def gerar_silencio(destino: Path):
    rodar(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi",
            "-i", f"anullsrc=r={TAXA}:cl=mono",
            "-t", str(MS_SILENCIO / 1000),
            "-ar", str(TAXA), "-ac", str(CANAIS), "-b:a", BITRATE,
            str(destino),
        ],
        "geração do silêncio",
    )


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
        choices=("edge", "espeak"),
        default="edge",
        help="edge = voz neural (precisa de internet); espeak = offline, robótico",
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
                print(f"    {fala.texto}")
        print(f"\ntotal: {len(falas)} linhas em {len(grupos)} arquivos")
        return 0

    exigir("ffmpeg", "instale com: sudo apt install ffmpeg  (ou brew install ffmpeg)")
    exigir("ffprobe", "vem junto com o ffmpeg")
    if args.motor == "espeak":
        exigir("espeak-ng", "instale com: sudo apt install espeak-ng")
    else:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            print("\nerro: edge-tts não está instalado.", file=sys.stderr)
            print("       pip install -r scripts/requirements.txt", file=sys.stderr)
            print("       ou use --motor espeak (offline, voz robótica)\n", file=sys.stderr)
            return 1

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = json.loads(CACHE_JSON.read_text(encoding="utf-8")) if CACHE_JSON.is_file() else {}

    silencio = CACHE_DIR / "_silencio.mp3"
    if not silencio.exists():
        gerar_silencio(silencio)

    # 2 e 3) sintetizar linha a linha, com cache
    gerados = 0
    do_cache = 0
    caminhos: dict[int, Path] = {}

    for (pasta, _grupo), lista in sorted(grupos.items()):
        voz, rate, pitch = voz_da_pasta(config, pasta, args)
        for fala in lista:
            assinatura = f"{fala.texto}|{args.motor}|{voz}|{rate}|{pitch}|{com_filtro}"
            chave = hashlib.sha1(assinatura.encode("utf-8")).hexdigest()
            destino = CACHE_DIR / f"{chave}.mp3"

            if destino.exists() and cache.get(chave) == assinatura and not args.forcar:
                do_cache += 1
            else:
                print(f"  gerando: {fala.texto[:62]}")
                with tempfile.TemporaryDirectory() as tmp:
                    cru = Path(tmp) / "cru.mp3"
                    if args.motor == "espeak":
                        sintetizar_espeak(fala.texto, cru, config)
                    else:
                        sintetizar(fala.texto, voz, rate, pitch, cru)
                    aplicar_filtro(cru, destino, com_filtro, args.motor)
                cache[chave] = assinatura
                gerados += 1
            caminhos[id(fala)] = destino

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
            parte = caminhos[id(fala)]
            if i > 0:
                partes.append(silencio)
                acumulado += MS_SILENCIO
            partes.append(parte)
            duracao = duracao_ms(parte)
            offsets.append({"inicio": acumulado, "fim": acumulado + duracao})
            acumulado += duracao

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
    print(f"  motor ..................... {args.motor}"
          f"{'  (voz robótica — use --motor edge pra voz neural)' if args.motor == 'espeak' else ''}")
    print("=" * 58)
    print("\nagora rode: npm run build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
