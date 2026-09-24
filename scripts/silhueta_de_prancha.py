#!/usr/bin/env python3
"""Tira a silhueta de uma espécie a partir de uma prancha de referência.

Desenhar o bicho à mão em coordenadas não bastou pro tubarão: mesmo com curva
e cabeça curta, a caudal que eu desenhava era de tubarão-tigre — lóbulo de
cima comprido e fino — quando a do branco é quase meia-lua, com os dois
lóbulos grandes. Contra isso só uma referência.

O fundo é achado por INUNDAÇÃO a partir da borda, não por limiar de brilho: o
tubarão tem a barriga branca, e limiar simples comeria a barriga junto com o
fundo. Tudo que a inundação não alcança é bicho, mesmo sendo branco.

A prancha é referência de FORMA. A silhueta segue provisória até os PNGs CC0
do PhyloPic; as pranchas não entram no repositório.

Uso:
    python3 scripts/silhueta_de_prancha.py prancha.png tubarao [--nao-espelhar]

Precisa de Pillow — ferramenta de bancada, não dependência do projeto.
"""

from __future__ import annotations

import argparse
import collections
from pathlib import Path

from PIL import Image, ImageFilter

SAIDA = Path(__file__).resolve().parent.parent / 'src' / 'formas' / 'especies'
COR = (12, 26, 30)
# Folga vertical: o warp desloca as tiras em y, e bicho encostado na borda
# seria cortado no deslocamento.
FOLGA_Y, FOLGA_X = 0.07, 0.02


def mascara_do_fundo(im: Image.Image, limiar: int) -> Image.Image:
    largura, altura = im.size
    px = im.load()
    claro = lambda p: p[0] > limiar and p[1] > limiar and p[2] > limiar
    fundo = bytearray(largura * altura)
    fila: collections.deque = collections.deque()

    def semear(x: int, y: int) -> None:
        if claro(px[x, y]) and not fundo[y * largura + x]:
            fundo[y * largura + x] = 1
            fila.append((x, y))

    for x in range(largura):
        semear(x, 0)
        semear(x, altura - 1)
    for y in range(altura):
        semear(0, y)
        semear(largura - 1, y)
    while fila:
        x, y = fila.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < largura and 0 <= ny < altura:
                semear(nx, ny)

    m = Image.new('L', (largura, altura))
    m.putdata([0 if fundo[i] else 255 for i in range(largura * altura)])
    return m


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('prancha')
    p.add_argument('especie')
    p.add_argument('--largura', type=int, default=1400)
    p.add_argument('--limiar', type=int, default=244)
    p.add_argument('--nao-espelhar', action='store_true',
                   help='a prancha já olha pra DIREITA (orientação canônica)')
    a = p.parse_args()

    m = mascara_do_fundo(Image.open(a.prancha).convert('RGB'), a.limiar)
    if not a.nao_espelhar:
        m = m.transpose(Image.FLIP_LEFT_RIGHT)
    m = m.crop(m.getbbox())

    mx, my = round(m.width * FOLGA_X), round(m.height * FOLGA_Y)
    folga = Image.new('L', (m.width + 2 * mx, m.height + 2 * my), 0)
    folga.paste(m, (mx, my))
    m = folga

    # Suaviza o serrilhado antes de ampliar; depois aperta a curva do alfa, pra
    # a borda não virar um halo de três pixels em volta do bicho.
    m = m.filter(ImageFilter.GaussianBlur(1.1))
    alto = max(1, round(a.largura * m.height / m.width))
    m = m.resize((a.largura, alto), Image.LANCZOS)
    m = m.point(lambda v: 0 if v < 90 else (255 if v > 165 else int((v - 90) * 255 / 75)))

    fora = Image.new('RGBA', (a.largura, alto), COR + (0,))
    fora.putalpha(m)
    destino = SAIDA / f'{a.especie}.png'
    fora.save(destino)
    print(f'  {a.especie}  {fora.size}  razao {alto / a.largura:.3f}  ->  {destino}')


if __name__ == '__main__':
    main()
