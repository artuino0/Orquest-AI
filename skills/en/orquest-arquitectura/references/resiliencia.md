# Resilience and Fault Tolerance in Distributed Systems

This reference defines mandatory strategies to prevent cascading failures and ensure services survive partial outages of downstream dependencies.

---

## 1. Core Resilience Patterns

### A. Mandatory Timeouts
**Non-negotiable rule**: No network call (HTTP, database, Redis, message queue) may execute without an explicit timeout configured.
- Unbounded calls hold sockets and worker threads open indefinitely when downstream services freeze, leading to caller resource exhaustion (*thread pool starvation*).
- Configure aggressive timeouts for fast reads (e.g., 500 ms) and moderate timeouts for background operations (e.g., 3 to 5 s).

### B. Exponential Backoff with Jitter
Immediate retries compound downstream overload and trigger thundering herd problems (*retry storms*).

- **Full Jitter Backoff Formula**:
  $$\text{delay} = \text{random}(0, \min(T_{\max}, T_{\text{base}} \times 2^{\text{attempt}}))$$
- Adding jitter spreads retry spikes evenly across time, smoothing recovery load.

### C. Circuit Breakers
Monitors dependency error rates.
- **Closed State**: Normal operation. If error rates exceed a threshold (e.g., 50% errors in 20 seconds), trip to Open.
- **Open State**: Fails immediately (*fail-fast*) without network traffic for a cooldown window (e.g., 30 seconds), protecting the struggling dependency and returning a fallback response.
- **Half-Open State**: After cooldown, allows a limited number of test requests through. If successful, resets to Closed; if failing, trips back to Open.

### D. Bulkheads
Isolates critical resource pools (connection pools, worker threads, memory buffers) so that non-critical slow operations (e.g., PDF generation) cannot exhaust resources needed for critical paths (e.g., authentication and checkout).

---

## 2. Resilience Checklist

- [ ] All outbound network calls have explicit timeouts configured.
- [ ] Retries apply only to confirmed transient faults (HTTP 502, 503, 504, network drops) and NEVER to 4xx errors.
- [ ] Retries use exponential backoff with full jitter randomization.
- [ ] Circuit breakers protect calls to critical third-party dependencies.
- [ ] Fallbacks (cached data, graceful degradation, default answers) are implemented when downstream services fail.
