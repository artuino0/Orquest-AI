-- Arma un .aseprite animado a partir de una hoja horizontal de celdas iguales
-- (la `hoja.png` que deja limpiar_hoja.py) y, si se pide, un GIF ampliado.
-- Uso: aseprite -b --script-param hoja=<hoja.png> --script-param n=<celdas>
--        --script-param out=<archivo.aseprite> --script-param tag=<nombre>
--        [--script-param orden=1,2,3] [--script-param ms=120]
--        [--script-param gif=<archivo.gif>] --script armar_animacion.lua
local p = app.params
local sheet = Image{ fromFile = p.hoja }
local n = tonumber(p.n)
local cw, ch = sheet.width // n, sheet.height
local order = {}
if p.orden then
  for s in p.orden:gmatch("%d+") do order[#order + 1] = tonumber(s) end
else
  for i = 1, n do order[i] = i end
end

local spr = Sprite(cw, ch, ColorMode.RGB)
spr.layers[1].name = "personaje"
for k, i in ipairs(order) do
  if k > 1 then spr:newEmptyFrame() end
  local img = Image(cw, ch, ColorMode.RGB)
  img:drawImage(sheet, Point(-(i - 1) * cw, 0))
  spr:newCel(spr.layers[1], k, img, Point(0, 0))
  spr.frames[k].duration = (tonumber(p.ms) or 120) / 1000
end
spr:newTag(1, #order).name = p.tag or "anim"
spr:saveAs(p.out)
if p.gif then
  app.command.SpriteSize{ ui = false, scale = 5 }
  spr:saveCopyAs(p.gif)
end
print(#spr.frames .. " cuadros de " .. cw .. "x" .. ch)
