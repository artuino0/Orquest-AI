"""Arma las cuatro esquinas de un muro juntando su tramo horizontal y su tramo
vertical. El generador no las dibuja bien, y hechas así embonan exactas con el
resto de las piezas.

  esquina_arriba_izq  ┌  el tramo vertical baja desde el extremo izquierdo
  esquina_arriba_der  ┐  espejo de la anterior
  esquina_abajo_izq   └  el tramo vertical llega al extremo izquierdo por arriba
  esquina_abajo_der   ┘  espejo de la anterior

En esta vista lo que está más abajo en pantalla queda más cerca: en las de
arriba el tramo vertical va encima del horizontal; en las de abajo, al revés.

Uso: python armar_esquinas.py <carpeta> <horizontal.png> <vertical.png>
"""
import sys
from PIL import Image, ImageOps

folder, h_name, v_name = sys.argv[1:4]
hor = Image.open(f"{folder}/{h_name}").convert("RGBA")
ver = Image.open(f"{folder}/{v_name}").convert("RGBA")
# Sin la línea de arriba del tramo vertical, su tapa se continúa con la del horizontal.
ver_open = ver.crop((0, 1, ver.width, ver.height))


def canvas(height):
    return Image.new("RGBA", (hor.width, height), (0, 0, 0, 0))


top = canvas(max(hor.height, ver_open.height + 1))
top.alpha_composite(hor, (0, 0))
top.alpha_composite(ver_open, (0, 1))

bottom = canvas(max(ver.height, hor.height))
bottom.alpha_composite(ver, (0, 0))
bottom.alpha_composite(hor, (0, bottom.height - hor.height))

for name, img in (("arriba", top), ("abajo", bottom)):
    img.save(f"{folder}/esquina_{name}_izq.png")
    ImageOps.mirror(img).save(f"{folder}/esquina_{name}_der.png")
print(folder.replace("\\", "/").split("/")[-1], "arriba", top.size, "abajo", bottom.size)
