# Resiliencia y Tolerancia a Fallos en Sistemas Distribuidos

Esta referencia define las estrategias obligatorias para evitar caídas en cascada y garantizar que los servicios sobrevivan a la degradación parcial de sus dependencias.

---

## 1. Patrones Fundamentales de Resiliencia

### A. Límites de Tiempo (Timeouts) Obligatorios
**Regla inquebrantable**: Ninguna llamada de red (HTTP, BD, Redis, cola) puede realizarse sin un timeout explícito configurado.
- Las llamadas sin timeout retienen sockets y hilos de ejecución abiertos indefinidamente cuando un servicio remoto se congela, provocando el colapso por agotamiento de recursos del llamador (*thread pool exhaustion*).
- Define timeouts agresivos para lecturas rápidas (ej. 500 ms) y moderados para operaciones de fondo (ej. 3 a 5 s).

### B. Reintentos con Retroceso Exponencial y Variación Aleatoria (Exponential Backoff & Jitter)
Reintentar inmediatamente ante un fallo agrava la sobrecarga del servicio destino y produce una "tormenta de reintentos" (*retry storm* o *thundering herd problem*).

- **Fórmula de retroceso con jitter completo**:
  $$\text{delay} = \text{random}(0, \min(T_{\max}, T_{\text{base}} \times 2^{\text{intento}}))$$
- El *jitter* (variación aleatoria) desincroniza a cientos de clientes reintentando al mismo tiempo, distribuyendo la carga de recuperación uniformemente.

### C. Disyuntor / Cortacircuito (Circuit Breaker)
Monitorea la tasa de fallos de una dependencia externa.
- **Estado Cerrado (Closed)**: Operación normal. Si la tasa de fallos supera un umbral (ej. 50% de errores en los últimos 20 segundos), el circuito pasa a Abierto.
- **Estado Abierto (Open)**: Falla de inmediato (*fail-fast*) sin tocar la red durante una ventana de descanso (ej. 30 segundos), protegiendo al servicio caído y retornando una respuesta de fallback.
- **Estado Semi-Abierto (Half-Open)**: Tras el periodo de descanso, permite pasar una cantidad reducida de peticiones de prueba. Si tienen éxito, el circuito vuelve a Cerrado; si fallan, regresa a Abierto.

### D. Mamparos (Bulkheads)
Aísla grupos de recursos (pools de conexiones, pools de hilos, colas de trabajo) para que la saturación de una funcionalidad lenta (ej. generación de reportes pesados) no agote los recursos necesarios para funcionalidades críticas (ej. autenticación y pagos).

---

## 2. Checklist de Resiliencia

- [ ] ¿Todas las llamadas de red externas cuentan con timeouts explícitos configurados?
- [ ] ¿Los reintentos se aplican únicamente a fallos transitorios comprobados (HTTP 502, 503, 504, timeouts de red) y NUNCA a errores 4xx?
- [ ] ¿Los reintentos incorporan retroceso exponencial con jitter aleatorio?
- [ ] ¿Se cuenta con un Circuit Breaker configurado para dependencias críticas de terceros?
- [ ] ¿Existe una estrategia de fallback (degradación elegante, datos en caché local, respuesta por defecto) cuando una dependencia cae?
