# Pruebas de Rendimiento Básico

Esta referencia orienta a QA en la detección temprana de cuellos de botella obvios, consultas lentas, fugas de memoria y sobrecargas de red antes de llegar a producción.

---

## 1. Métricas Clave y Umbrales de Aceptación Básicos

- **Tiempo de Respuesta de API (p95)**:
  - Operaciones de lectura sencillas (`GET /users/:id`): < 100 ms.
  - Operaciones de escritura o consultas con agregación: < 300 ms.
  - Procesos pesados o reportes: Si superan 1 segundo, deben ejecutarse de forma asíncrona mediante colas de trabajo.
- **Tamaño de Payloads de Red**:
  - Respuestas JSON no deberían exceder 200 KB sin paginación.
  - Recursos estáticos (bundles JS/CSS): Deben estar comprimidos (Gzip/Brotli) y con encabezados de caché adecuados.
- **Consultas a Base de Datos (Problema N+1)**:
  - Una llamada a un endpoint que liste 50 registros no debe disparar 51 consultas SQL consecutivas.

---

## 2. Medición Rápida con `curl`

Usa `curl` para medir tiempos de latencia y transferencia sin interferencia del navegador:

```bash
# Medir tiempo de conexión, TTFB (time to first byte) y tiempo total
curl -w "DNS: %{time_namelookup}s | Connect: %{time_connect}s | TTFB: %{time_starttransfer}s | Total: %{time_total}s | Size: %{size_download} bytes\n" \
  -o /dev/null -s http://localhost:3000/api/v1/dashboard/summary
```

Si `time_starttransfer` supera 500 ms en entorno local sobre base de datos de desarrollo, reporta una advertencia de rendimiento.

---

## 3. Verificación de Memoria y Carga Básica

### Prueba de Carga Concurrente Sencilla con `autocannon` o `ab` (Apache Bench)

Si Node.js está disponible:
```bash
# 50 conexiones concurrentes durante 10 segundos
npx autocannon -c 50 -d 10 http://localhost:3000/api/v1/health
```

Verifica:
- Cero peticiones fallidas o con timeout.
- El proceso del backend no debe incrementar su consumo de RAM indefinidamente (fuga de memoria).

---

## 4. Checklist de Rendimiento

- [ ] Los endpoints clave responden en menos de 200 ms en entorno local.
- [ ] Las listas de recursos retornan paginadas (`limit` / `offset` o cursores).
- [ ] No se observan bucles de consultas N+1 en los logs de la base de datos.
- [ ] El payload JSON incluye únicamente los campos necesarios para la vista cliente.
- [ ] No se producen picos inusuales de CPU o RAM al procesar peticiones continuas.
