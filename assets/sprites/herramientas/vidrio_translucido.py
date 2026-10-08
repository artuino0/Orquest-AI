"""Vuelve semitransparente el vidrio de una pieza, para que se vea lo que hay
detrás (la oficina de al lado). El vidrio es lo claro y azulado; el marco no
se toca.

Uso: python vidrio_translucido.py <pieza.png>... [--alfa 150]
"""
import sys
from PIL import Image

args = sys.argv[1:]
alpha = 150
if "--alfa" in args:
    i = args.index("--alfa")
    alpha = int(args[i + 1])
    del args[i:i + 2]
for path in args:
    im = Image.open(path).convert("RGBA")
    p = im.load()
    n = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if a and g > r + 6 and b > r + 6 and 0.3 * r + 0.59 * g + 0.11 * b > 135:
                p[x, y] = (r, g, b, alpha)
                n += 1
    im.save(path)
    print(path.replace("\\", "/").split("/")[-1], n, "píxeles de vidrio")
