# Basic Performance Testing

This reference guides QA in detecting obvious bottlenecks, slow queries, memory leaks, and network overhead prior to production deployments.

---

## 1. Key Metrics and Basic Thresholds

- **API Response Time (p95)**:
  - Simple read endpoints (`GET /users/:id`): < 100 ms.
  - Complex business writes or aggregations: < 300 ms.
  - Heavy batch jobs or report exports: If exceeding 1 second, they should run asynchronously via background workers.
- **Network Payload Sizes**:
  - JSON payloads should not exceed 200 KB without pagination.
  - Static assets (JS/CSS bundles) should be compressed (Gzip/Brotli) and served with caching headers.
- **Database Query Patterns (N+1 Problem)**:
  - An endpoint returning 50 entities must not execute 51 consecutive SQL queries.

---

## 2. Quick CLI Latency Measurement with `curl`

Measure network latency and transfer times:

```bash
curl -w "DNS: %{time_namelookup}s | Connect: %{time_connect}s | TTFB: %{time_starttransfer}s | Total: %{time_total}s | Size: %{size_download} bytes\n" \
  -o /dev/null -s http://localhost:3000/api/v1/dashboard/summary
```

If `time_starttransfer` exceeds 500 ms in a local environment against development databases, flag a performance warning.

---

## 3. Basic Concurrency and Memory Verification

Run a lightweight concurrent load test using `autocannon`:

```bash
# 50 concurrent connections over 10 seconds
npx autocannon -c 50 -d 10 http://localhost:3000/api/v1/health
```

Verify:
- Zero failed or timed-out requests.
- Backend process RSS memory does not climb monotonically without recovering (memory leak).

---

## 4. Performance Checklist

- [ ] Core endpoints respond in under 200 ms locally.
- [ ] Collection endpoints return paginated results (`limit`/`offset` or cursor).
- [ ] No N+1 query loops are observed in database logs.
- [ ] Returned JSON payloads include only fields needed by the consuming client.
- [ ] No unusual CPU or memory spikes occur under continuous local traffic.
