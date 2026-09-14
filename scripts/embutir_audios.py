#!/usr/bin/env python3
"""
Gera public/audios.js a partir dos mp3 em public/audio/.

Esse arquivo é a "camada A" do áudio: um script clássico que define
window.__AUDIOS = { "2a/entrada": "data:audio/mpeg;base64,...", ... }.

Por que isso existe: via file://, o Chrome se recusa a ler o áudio de um
<audio> com a Web Audio API (trata como origem opaca), então não dá pra medir
o nível real do som pra animar o orbe. Com o mp3 em data URL, o fetch é
same-origin e o decodeAudioData funciona.

Leva também os tempos.json de cada turma em window.__TEMPOS: são os offsets de
cada linha dentro do mp3, que deixam a legenda trocar de linha na hora exata.

Uso:
    python3 scripts/embutir_audios.py

Na Fase 3 o gerar_audios.py vai chamar isso no fim da geração.
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA_AUDIO = RAIZ / "public" / "audio"
SAIDA = RAIZ / "public" / "audios.js"
PASTAS = ("2a", "2b", "3a", "sfx", "sistema")
# Acima disso o Chromebook começa a sofrer pra segurar tudo em memória.
AVISO_TAMANHO_MB = 40


def main() -> int:
    if not PASTA_AUDIO.is_dir():
        print(f"erro: {PASTA_AUDIO} não existe", file=sys.stderr)
        return 1

    entradas: dict[str, str] = {}
    tempos: dict[str, dict] = {}
    for nome in PASTAS:
        pasta = PASTA_AUDIO / nome
        if not pasta.is_dir():
            continue
        for mp3 in sorted(pasta.glob("*.mp3")):
            chave = f"{nome}/{mp3.stem}"
            dados = base64.b64encode(mp3.read_bytes()).decode("ascii")
            entradas[chave] = f"data:audio/mpeg;base64,{dados}"
        # Os offsets de cada linha viajam junto: sem eles a legenda cai no
        # modo proporcional mesmo com o áudio presente.
        arquivo_tempos = pasta / "tempos.json"
        if arquivo_tempos.is_file():
            tempos[nome] = json.loads(arquivo_tempos.read_text(encoding="utf-8"))

    if not entradas:
        print("nenhum mp3 encontrado em public/audio/<turma>/ — nada a fazer.")
        print("o app continua funcionando na camada B (envelope sintético).")
        return 0

    partes = ["window.__AUDIOS = {\n"]
    for chave, data_url in entradas.items():
        partes.append(f'  "{chave}": "{data_url}",\n')
    partes.append("};\n")
    partes.append("window.__TEMPOS = ")
    partes.append(json.dumps(tempos, ensure_ascii=False))
    partes.append(";\n")
    conteudo = "".join(partes)

    SAIDA.write_text(conteudo, encoding="utf-8")

    tamanho_mb = len(conteudo) / (1024 * 1024)
    cenas_com_tempos = sum(len(v) for v in tempos.values())
    print(
        f"public/audios.js gerado: {len(entradas)} áudio(s), "
        f"{cenas_com_tempos} cena(s) com tempos reais, {tamanho_mb:.1f} MB"
    )
    if tamanho_mb > AVISO_TAMANHO_MB:
        print(
            f"aviso: passou de {AVISO_TAMANHO_MB} MB. Considere reduzir o bitrate "
            "dos mp3 (o TTS de voz não precisa de mais que 64 kbps mono).",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
