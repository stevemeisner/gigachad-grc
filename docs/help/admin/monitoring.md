# Monitoring & Metrics

Monitor the health and performance of your GigaChad GRC platform.

## Overview

The monitoring stack provides:
- Real-time service health
- Performance metrics
- Resource utilization
- Alert notifications
- Historical trends

## Accessing Monitoring

Monitoring is opt-in. `./scripts/start-demo.sh` starts only PostgreSQL and
MinIO, so nothing below is running on a demo machine until you bring the
monitoring stack up yourself:

```bash
docker compose -f deploy/monitoring/docker-compose.monitoring.yml up -d
```

That file defines prometheus, grafana, loki, promtail, cadvisor,
node-exporter and alertmanager.

### Prometheus

- **URL**: http://localhost:9090 (or your configured domain)
- **Purpose**: Query raw metrics, view targets, inspect firing alerts
- **Config**: `deploy/monitoring/prometheus.yml`, rules in
  `deploy/monitoring/alerts.yml`

### Grafana

- **URL**: http://localhost:3030
- **Login**: `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` (both default to
  `admin` — change them before exposing Grafana)

### Alertmanager

- **URL**: http://localhost:9093
- **Config**: `deploy/monitoring/alertmanager.yml`

### Loki

- **URL**: http://localhost:3100 — log aggregation, fed by promtail

> The all-in-Docker `docker-compose.yml` at the repository root also defines
> `prometheus` and `grafana`. In that layout Grafana is published on host port
> 3003 and is provisioned from `monitoring/`, not `deploy/monitoring/`.

## Pre-Built Dashboards

### GRC Platform Overview

One dashboard ships with the repository:
`monitoring/grafana/provisioning/dashboards/json/grc-overview.json`
("GigaChad GRC - Platform Overview"). It is auto-provisioned by the Grafana
service in the root `docker-compose.yml`. The standalone
`deploy/monitoring/` stack has no provisioning directory yet, so its Grafana
starts empty — import the JSON above by hand.

Its panels:

| Panel | Description |
|-------|-------------|
| **Controls Service Health** | `up` for the controls service |
| **Audit Service Health** | `up` for the audit service |
| **Total Request Rate** | Requests per second across services |
| **Error Rate** | Percentage of failed requests |
| **Request Rate by Service** | Requests per second broken out by service |
| **Response Time (p95)** | 95th percentile latency |
| **Memory Usage by Service** | Resident memory per service |
| **Database Connections** | Active DB connections |

There are no other dashboards; anything else has to be built in Grafana.

## Key Metrics

Only the **controls** service is instrumented. It registers
`PrometheusModule.register()` (`services/controls/src/app.module.ts`), which
serves the registry at `GET /metrics` — port 3001, no `/api` prefix — and
turns on prom-client's default metrics. The other five services expose
`GET /health` but no metrics endpoint.

### Application metrics (registered in code)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `collectors_runs_total` | counter | `status` | Collector runs by outcome |
| `scheduled_notifications_runs_total` | counter | `status` | Scheduled notification runs by outcome |
| `mcp_workflow_executions_total` | counter | `status` | MCP workflow executions by outcome |

### Runtime metrics (prom-client defaults)

| Metric | Description |
|--------|-------------|
| `process_cpu_seconds_total` | CPU time consumed |
| `process_resident_memory_bytes` | Resident memory |
| `nodejs_heap_size_used_bytes` | V8 heap in use |
| `nodejs_eventloop_lag_seconds` | Event-loop lag |

### Infrastructure metrics

From the exporters in `deploy/monitoring/docker-compose.monitoring.yml`:
node-exporter (host CPU, memory, disk), cAdvisor (per-container CPU and
memory) and MinIO's own `/minio/v2/metrics/cluster` endpoint.

> **Not instrumented.** There is no HTTP request interceptor and no Prisma
> metrics exporter, so `http_requests_total`,
> `http_request_duration_seconds` and `prisma_client_*` are **not** exported by
> any service. The bundled `grc-overview` dashboard queries them, so its
> request-rate, error-rate, latency and database-connection panels stay empty
> until that instrumentation is added. Traefik and the nginx gateway do not
> expose metrics either: no `metrics:` section in `gateway/traefik.yml` and no
> `stub_status` in `gateway/nginx.conf`.

## Alert Rules

### Pre-Configured Alerts

From `deploy/monitoring/alerts.yml`:

| Alert | Condition | For | Severity |
|-------|-----------|-----|----------|
| `ServiceDown` | `up == 0` | 1m | Critical |
| `HighErrorRate` | 5xx share of requests above threshold | 5m | Warning |
| `SlowResponseTime` | p95 latency above threshold | 5m | Warning |
| `ScheduledNotificationsFailing` | `increase(scheduled_notifications_runs_total{status="failure"}[30m]) > 0` | 30m | Warning |
| `CollectorsFailing` | `increase(collectors_runs_total{status="failure"}[30m]) > 0` | 30m | Warning |
| `MCPWorkflowsFailing` | `increase(mcp_workflow_executions_total{status="failure"}[30m]) > 0` | 30m | Warning |
| `PostgresDown` | `pg_up == 0` | 1m | Critical |
| `PostgresHighConnections` | Connection use near `max_connections` | 5m | Warning |
| `PostgresDeadlocks` | `rate(pg_stat_database_deadlocks[5m]) > 0` | 5m | Warning |
| `HighCPUUsage` | Host CPU sustained high | 10m | Warning |
| `HighMemoryUsage` | Host memory sustained high | 10m | Warning |
| `LowDiskSpace` | Filesystem nearly full | 5m | Warning |
| `CriticalDiskSpace` | Filesystem critically full | 1m | Critical |
| `ContainerKilled` | `time() - container_last_seen > 60` | 1m | Warning |
| `ContainerHighCPU` | Container CPU sustained high | 5m | Warning |

`HighErrorRate`, `SlowResponseTime` and the Postgres rules depend on metrics
nothing currently exports (see the note above) — they will never fire until
HTTP instrumentation and a postgres-exporter are wired in.

### Custom Alerts

Add rules to `deploy/monitoring/alerts.yml`; Prometheus loads it from
`/etc/prometheus/alerts.yml`:

```yaml
groups:
  - name: custom-alerts
    rules:
      - alert: CollectorRunsStalled
        expr: increase(collectors_runs_total[6h]) == 0
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "No collector runs in the last 6 hours"
```

## Using Grafana

### Navigating Dashboards

1. Click dashboard name to switch
2. Use time picker for date range
3. Click panels to drill down
4. Use variables for filtering

### Creating Dashboards

1. Click **+** → **Dashboard**
2. Add panels with visualizations
3. Configure queries
4. Save dashboard

### Sharing Dashboards

- Export as JSON
- Share via link
- Embed in other tools
- Schedule reports

## Query Examples

### PromQL Queries

Collector failures in the last hour:
```promql
increase(collectors_runs_total{status="failure"}[1h])
```

Share of successful scheduled notification runs:
```promql
sum(rate(scheduled_notifications_runs_total{status="success"}[1h]))
  / sum(rate(scheduled_notifications_runs_total[1h])) * 100
```

Resident memory in MB:
```promql
process_resident_memory_bytes / 1024 / 1024
```

Event-loop lag:
```promql
nodejs_eventloop_lag_seconds
```

Which scrape targets are up:
```promql
up
```

## Health Checks

### Service Health

Every service exposes an unauthenticated health endpoint from the shared
`HealthController` — `GET /health` (full check), `GET /health/live` (liveness)
and `GET /health/ready` (readiness: database plus heap/RSS limits). There is no
`/api/health`.

```bash
curl http://localhost:3001/health   # controls
curl http://localhost:3002/health   # frameworks
curl http://localhost:3004/health   # policies
curl http://localhost:3005/health   # tprm
curl http://localhost:3006/health   # trust
curl http://localhost:3007/health   # audit
```

Response shape:
```json
{
  "status": "ok",
  "info": { "database": { "status": "up" } },
  "details": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  }
}
```

`status` is `"ok"` or `"error"`; failing indicators move from `info` to
`error`. The controls service additionally serves the richer
`GET /api/system/health` and the admin-only `/api/system/*` checks described in
[System Health](system-health.md).

### Prometheus Targets

View all scrape targets:
1. Go to Prometheus UI
2. Click **Status** → **Targets**
3. See target status and errors

## Troubleshooting

### No Metrics Showing

1. Verify the controls service is running
2. Check the endpoint directly: `curl http://localhost:3001/metrics` — the path
   is `/metrics`, not `/api/metrics`
3. Verify the scrape job in `deploy/monitoring/prometheus.yml` points at
   `controls:3001` with `metrics_path: /metrics`
4. Confirm the metric is one that actually exists (see Key Metrics — HTTP and
   Prisma metrics are not exported)
5. Check network connectivity between the Prometheus and app containers

### Grafana Won't Load

1. Check Grafana container status
2. Verify datasource configured
3. Check credentials
4. Review Grafana logs

### Missing Data Points

1. Check scrape interval
2. Verify time range
3. Check for service restarts
4. Review retention settings

## Best Practices

### Production Setup

- Set `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` — both default to
  `admin`
- Never publish Prometheus (9090), Alertmanager (9093) or Loki (3100) beyond a
  private network; none of them authenticate
- Terminate TLS in front of Grafana; the container speaks plain HTTP
- Prometheus retention is set by `--storage.tsdb.retention.time` in
  `deploy/monitoring/docker-compose.monitoring.yml` (currently 30d)

### Alert Management

- Set meaningful thresholds
- Avoid alert fatigue
- Document alert responses
- Test alert delivery

### Data Retention

- Configure based on needs
- Monitor storage usage
- Archive historical data
- Plan for growth

## Related Topics

- [Organization Settings](organization.md)
- [Audit Logs](audit-logs.md)
- [Deployment Runbook](/docs/DEPLOYMENT-RUNBOOK.md)
- [System Health](system-health.md)

