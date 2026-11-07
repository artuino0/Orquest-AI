# Requisitos No Funcionales (RNF) y Dimensionamiento

Esta referencia define cómo levantar, cuantificar y priorizar los atributos de calidad de un sistema antes de tomar decisiones arquitectónicas.

---

## 1. El Peligro de los Requisitos Ambiguos

Frases como *"el sistema debe ser rápido y escalable"* no son requisitos arquitectónicos; son deseos. Cada RNF debe expresarse con una métrica observable, un umbral numérico y las condiciones bajo las cuales aplica.

| RNF Ambiguo | RNF Cuantificado y Accionable |
| :--- | :--- |
| "Debe ser de alta disponibilidad" | **Disponibilidad 99.9%** (máximo 8.76 horas de indisponibilidad anual), admitiendo mantenimiento programado con previo aviso de 48h. |
| "Debe responder rápido" | **Latencia p95 ≤ 150 ms y p99 ≤ 400 ms** para peticiones de lectura con hasta 500 RPS concurrentes. |
| "Debe soportar mucho tráfico" | **Carga sostenida de 1,200 RPS** y picos previstos de 3,500 RPS durante eventos promocionales de 2 horas. |
| "Debe ser seguro" | **Cumplimiento PCI-DSS Nivel 3**: datos de tarjetas tokenizados mediante pasarela externa; cifrado en tránsito (TLS 1.3) y en reposo (AES-256). |

---

## 2. Dimensiones Fundamentales a Cuantificar

### A. Escalabilidad y Volumen
- **Lecturas vs Escrituras**: Ratio de lectura/escritura (ej. 90:10 para catálogos, 50:50 para mensajería).
- **Almacenamiento**: Volumen inicial de datos, tasa de crecimiento mensual estimada (GB/mes) y política de retención/archivado.

### B. Disponibilidad y Recuperación ante Desastres
- **SLA / SLO**: Definir el objetivo de nivel de servicio.
- **RTO (Recovery Time Objective)**: Tiempo máximo tolerable para restaurar el servicio tras un desastre (ej. < 30 minutos).
- **RPO (Recovery Point Objective)**: Cantidad máxima de datos perdidos medida en tiempo (ej. < 5 minutos de transacciones).

### C. Cumplimiento y Gobernanza
- **Regulaciones aplicables**: GDPR / LGPD (derecho al olvido, residencia de datos en la UE), HIPAA (datos médicos cifrados y auditados), SOX.
- **Auditoría**: Trazabilidad inmutable de todas las acciones administrativas y cambios sobre entidades sensibles.

### D. Restricciones de Costo y Equipo
- **Presupuesto en la nube**: Límite mensual estimado de gasto en infraestructura (ej. $1,500 USD/mes). Una solución que requiera clusters Kubernetes multi-región no es viable si el presupuesto no cubre su administración.
- **Topología del equipo (Team Topologies)**: Número de ingenieros disponibles y sus destrezas reales. No diseñes una arquitectura con 20 microservicios si hay un equipo de 3 personas.

---

## 3. Checklist de Levantamiento de RNF

- [ ] ¿Están definidos los percentiles de latencia (p50, p95, p99) para los endpoints críticos?
- [ ] ¿Se estimó el caudal de peticiones por segundo (RPS normal y pico)?
- [ ] ¿Se definió el RTO y RPO ante caídas graves de infraestructura?
- [ ] ¿Se identificaron las normativas legales de privacidad y residencia de datos?
- [ ] ¿El costo de la infraestructura proyectada cabe dentro del presupuesto del negocio?
