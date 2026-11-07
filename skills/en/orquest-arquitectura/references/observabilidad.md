# Observability, Telemetry, and Defining SLOs

This reference defines standards for structuring system visibility: logs, metrics, distributed traces, and service level objectives.

---

## 1. The Three Pillars of Observability

### A. Structured JSON Logs
Never emit unformatted plaintext lines (`console.log("Error: " + err)`). All logs must be valid JSON objects with standard fields:

```json
{
  "timestamp": "2026-11-06T19:15:30.125Z",
  "level": "error",
  "message": "Payment processing failed due to upstream gateway timeout",
  "service": "billing-service",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "user_id": "usr_98124",
  "order_id": "ord_5521",
  "error": {
    "type": "GatewayTimeoutError",
    "code": "UPSTREAM_TIMEOUT",
    "retry_count": 3
  }
}
```

### B. Performance Metrics (RED and USE Methods)
- **RED Method (For Request-Driven Services / APIs)**:
  - **R (Rate)**: Requests per second received (RPS).
  - **E (Errors)**: Number or ratio of failed requests (HTTP 5xx or exceptions).
  - **D (Duration)**: Latency histogram (p50, p95, p99 percentiles).
- **USE Method (For Infrastructure Resources)**:
  - **U (Utilization)**: Percentage of resource busy time (CPU, RAM, disk).
  - **S (Saturation)**: Queued work waiting to be processed (backlog/queue depth).
  - **E (Errors)**: Physical error counts or device failures.

### C. Distributed Tracing (OpenTelemetry)
- Propagate **W3C Trace Context** headers (`traceparent`, `tracestate`) across HTTP requests and message queues.
- A single `trace_id` enables tracking a user request across 5 microservices down to the final database execution.

---

## 2. Practical SLI and SLO Definitions

- **SLI (Service Level Indicator)**: The quantitative real-time measurement of service behavior.
  - *Example*: Percentage of successful requests (non-5xx) to `/checkout` over 30 days.
- **SLO (Service Level Objective)**: The target reliability agreed upon with the business that the SLI must meet.
  - *Example*: 99.9% of `/checkout` requests must succeed in under 300 ms over a rolling 30-day window.
- **Error Budget**: `100% - SLO`. For a 99.9% SLO, the error budget is 0.1%. When the error budget is exhausted by outages, feature releases freeze to prioritize stability.

---

## 3. Observability Checklist

- [ ] Logs emit structured JSON objects to `stdout`.
- [ ] Distributed `trace_id` and `correlation_id` propagate across all service boundaries.
- [ ] RED metrics (Rate, Errors, Duration) configured for all critical endpoints.
- [ ] Proactive alerts configured around Error Budget Burn Rates.
