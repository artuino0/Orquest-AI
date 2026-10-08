"""Mamparas de cubículo para hileras de escritorios frente a frente.

Van encima de los escritorios, sin casilla propia, con el material del kit de
`cubiculos/` (tela verde azulada en marco gris):

  mampara_fondo.png       96 × alto. Corre a lo largo, entre las dos hileras,
                          parada en la orilla donde se tocan los escritorios.
                          Se repite a los lados sin costura (una por escritorio).
  mampara_lado.png        Panel entre vecinos visto de canto, para la hilera de
                          abajo (gente de espaldas): la tapa corre del fondo
                          hacia la silla y al final se le ve el canto, hasta el
                          piso.
  mampara_lado_atras.png  Lo mismo para la hilera de arriba (gente de frente):
                          solo la tapa, porque el canto queda tras la del fondo.

  mampara_vertical.png      8 × 96. Corre de arriba abajo entre dos escritorios
                            de lado que se dan la cara; un tramo por puesto.
  mampara_vertical_fin.png  Su remate de abajo: el canto, hasta el piso.

Uso: python mamparas.py <cubiculos/tramo.png> <carpeta_salida>
"""
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGBA")
out = sys.argv[2]
W, H = src.size
ink = src.getpixel((W // 2, 0))

# Filas del tramo del kit: borde, tapa, tela, riel de abajo, borde.
BANDS = [(0, 2, 2), (2, 8, 6), (8, 46, 20), (46, 52, 4), (52, 54, 2)]
LOW = sum(h for _, _, h in BANDS)  # alto de la mampara baja
scale = H / 54  # el kit pudo estirarse; las filas se miden sobre 54

panel = Image.new("RGBA", (W, LOW), (0, 0, 0, 0))
y = 0
for a, b, height in BANDS:
    band = src.crop((0, round(a * scale), W, round(b * scale))).resize((W, height), Image.NEAREST)
    panel.paste(band, (0, y))
    y += height

# --- la del fondo: dos casillas del tramo, con un poste del marco en cada unión
fondo = Image.new("RGBA", (96, LOW), (0, 0, 0, 0))
fondo.paste(panel, (0, 0))
fondo.paste(panel, (48, 0))
rail = panel.getpixel((W // 2, LOW - 4))
for x in (0, 94):
    fondo.paste(rail, (x, 2, x + 2, LOW - 2))
fondo.save(f"{out}/mampara_fondo.png")

# --- la de lado: tapa angosta que corre hacia la silla y su canto de metal
cap = panel.getpixel((W // 2, 4))
cap_light = panel.getpixel((W // 2, 7))
THICK, RUN, DROP = 8, 46, 62  # grosor, largo de la tapa, alto del canto hasta el piso


def strip(length):
    s = Image.new("RGBA", (THICK, length), ink)
    s.paste(cap, (1, 1, THICK - 1, length))
    s.paste(cap_light, (1, 1, 3, length))
    return s


lado = Image.new("RGBA", (THICK, RUN + DROP), (0, 0, 0, 0))
lado.paste(strip(RUN), (0, 0))
edge = Image.new("RGBA", (THICK, DROP), ink)
edge.paste(rail, (1, 1, THICK - 1, DROP - 2))
edge.paste(cap, (1, 1, 3, DROP - 2))
lado.paste(edge, (0, RUN))
lado.save(f"{out}/mampara_lado.png")

atras = strip(RUN)
atras.paste(ink, (0, RUN - 1, THICK, RUN))
atras.save(f"{out}/mampara_lado_atras.png")
# --- la vertical: corre de arriba abajo entre dos escritorios de lado que se
# dan la cara. Un tramo por puesto (dos casillas), sin bordes arriba ni abajo
# para que se repita sin costura; y su remate: el canto, hasta el piso.
PUESTO, CANTO = 96, 66
vertical = Image.new("RGBA", (THICK, PUESTO), ink)
vertical.paste(cap, (1, 0, THICK - 1, PUESTO))
vertical.paste(cap_light, (1, 0, 3, PUESTO))
vertical.save(f"{out}/mampara_vertical.png")
fin = Image.new("RGBA", (THICK, CANTO), ink)
fin.paste(rail, (1, 1, THICK - 1, CANTO - 2))
fin.paste(cap, (1, 1, 3, CANTO - 2))
fin.save(f"{out}/mampara_vertical_fin.png")
print("fondo", fondo.size, "| lado", lado.size, "| lado_atras", atras.size, "| vertical", vertical.size, "| vertical_fin", fin.size)
