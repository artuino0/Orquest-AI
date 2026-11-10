// Oficina 3D: la misma oficina que la de píxel (mismo contrato que oficina/puente.js), con un robot
// de color por puesto. Three.js va empaquetado con la app (la CSP no deja cargarlo de fuera); la
// escena es un guion clásico que lo toma de window.THREE, como la versión que se diseñó suelta.
import * as THREE from 'three'

window.THREE = THREE
await import('./escena.js')
