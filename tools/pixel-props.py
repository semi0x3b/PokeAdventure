# GPT 그림(1536x1024, 3x2 칸, 칸마다 32x32 도트)을 실제 도트로 되돌린다: 칸마다 격자 오프셋을 찾아 블록 최빈색으로 줄이고,
# 자홍 배경을 투명으로, 경계 상자로 자른다.
import sys
from PIL import Image
from collections import Counter

def is_bg(c):
    r, g, b = c[:3]
    return r > 170 and b > 170 and g < 110 and abs(r - b) < 90

def cell_sprite(cell):
    w, h = cell.size
    px = cell.load()
    # 블록 크기 추정: 16 근처에서 경계 맞춤이 가장 좋은 값
    best = None
    for size in [14, 15, 16, 17, 18]:
        for off in range(0, size, 2):
            score = 0
            for y in range(off, h - 1, size):
                for x in range(0, w, 8):
                    a, b2 = px[x, y], px[x, max(0, y - 1)]
                    score += sum(abs(a[i] - b2[i]) for i in range(3))
            if best is None or score > best[0]:
                best = (score, size, off)
    _, size, offy = best
    bestx = None
    for off in range(0, size, 2):
        score = 0
        for x in range(off, w - 1, size):
            for y in range(0, h, 8):
                a, b2 = px[x, y], px[max(0, x - 1), y]
                score += sum(abs(a[i] - b2[i]) for i in range(3))
        if bestx is None or score > bestx[0]:
            bestx = (score, off)
    offx = bestx[1]
    cols = (w - offx) // size
    rows = (h - offy) // size
    out = Image.new('RGBA', (cols, rows), (0, 0, 0, 0))
    o = out.load()
    for j in range(rows):
        for i in range(cols):
            x0, y0 = offx + i * size, offy + j * size
            m = size // 4
            samples = [px[x, y][:3] for y in range(y0 + m, y0 + size - m) for x in range(x0 + m, x0 + size - m)]
            q = Counter(tuple(v // 8 * 8 for v in s) for s in samples).most_common(1)[0][0]
            # 그 묶음 안 실제 색 평균
            group = [s for s in samples if tuple(v // 8 * 8 for v in s) == q]
            c = tuple(sum(s[k] for s in group) // len(group) for k in range(3))
            o[i, j] = (0, 0, 0, 0) if is_bg(c) else c + (255,)
    box = out.getbbox()
    return out.crop(box) if box else None

def main(src, theme, dest):
    im = Image.open(src).convert('RGB')
    W, H = im.size
    cw, ch = W // 3, H // 2
    sprites = []
    for r in range(2):
        for c in range(3):
            s = cell_sprite(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)))
            sprites.append(s)
    # 한 줄 시트(칸 32x32, 아래 가운데 정렬)
    sheet = Image.new('RGBA', (32 * 6, 32), (0, 0, 0, 0))
    for n, s in enumerate(sprites):
        if s is None: continue
        if s.width > 32 or s.height > 32:
            s.thumbnail((32, 32), Image.NEAREST)
        sheet.alpha_composite(s, (n * 32 + (32 - s.width) // 2, 32 - s.height))
    sheet.save(dest)
    print(theme, [None if s is None else s.size for s in sprites])

main(*sys.argv[1:4])
