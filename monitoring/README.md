# GigaChad GRC - Monitoring Stack

This directory contains the configuration for the Prometheus and Grafana monitoring stack.

## Overview

The monitoring stack provides real-time visibility into the health and performance of all GigaChad GRC services.

## Components

### Prometheus

- **URL**: http://localhost:9090
- **Configuration**: `prometheus.yml`
- **Purpose**: Metrics collection and storage

**Scrape Targets** (`prometheus.yml`, local stack):
- Prometheus self-monitoring (`localhost:9090`)
- Controls Service (`controls:3001/metrics`) - the only API service that
  registers `PrometheusModule`, so it is the only one exposing Prometheus
  metrics today

Targets for the other five services (frameworks 3002, policies 3004,
tprm 3005, trust 3006, audit 3007), a `postgres_exporter` sidecar, MinIO and
Traefik are present in `prometheus.yml` but commented out, each with the
reason it cannot be scraped yet. Every one of those services exposes
`GET /health` (JSON), which Prometheus cannot parse - a health endpoint is
not a metrics endpoint.

### Grafana

- **URL**: http://localhost:3003
- **Default Credentials**: admin/admin
- **Purpose**: Metrics visualization and dashboards

**Pre-configured Dashboards:**
- **GRC Platform Overview**: Service health, request rates, error rates, memory usage
- Database connection monitoring
- Response time percentiles (p95)

## Quick Start

1. Start the monitoring stack with Docker Compose:

```bash
docker-compose up -d prometheus grafana
```

2. Access Grafana at http://localhost:3003

3. Prometheus is automatically configured as the default data source

## Adding Custom Metrics

Services use `@willsoto/nestjs-prometheus`, which registers the `/metrics`
endpoint for you. No service sets a global route prefix, so the path is
`/metrics` (not `/api/metrics`).

1. Register the module once per service, in its `app.module.ts`:

```typescript
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    // ...
    PrometheusModule.register(),
  ],
})
export class AppModule {}
```

2. Declare each metric as a provider in the owning feature module
   (see `services/controls/src/collectors/collectors.module.ts`):

```typescript
import { makeCounterProvider } from '@willsoto/nestjs-prometheus';

@Module({
  providers: [
    makeCounterProvider({
      name: 'collectors_runs_total',
      help: 'Total number of collector runs grouped by status',
      labelNames: ['status'],
    }),
  ],
})
export class CollectorsModule {}
```

3. Inject and increment it (see
   `services/controls/src/collectors/collectors.service.ts`):

```typescript
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';

constructor(
  @InjectMetric('collectors_runs_total')
  private readonly collectorsRunsCounter: Counter<string>,
) {}

this.collectorsRunsCounter.inc({ status: 'success' });
```

4. Uncomment that service's job in `prometheus.yml`.

## Alert Rules

To add alerting rules, create files in `monitoring/alerts/` and reference them in `prometheus.yml`:

```yaml
rule_files:
  - "alerts/*.yml"
```

Example alert rule (`alerts/service-alerts.yml`):

```yaml
groups:
  - name: service-alerts
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is above 5% for more than 5 minutes"
```

## Grafana Dashboard Structure

```
monitoring/grafana/provisioning/
├── datasources/
│   └── prometheus.yml          # Auto-configure Prometheus datasource
└── dashboards/
    ├── dashboards.yml          # Dashboard provisioning config
    └── json/
        └── grc-overview.json   # Platform overview dashboard
```

## Production Considerations

1. **Persistent Storage**: Ensure `prometheus_data` and `grafana_data` volumes are backed up
2. **Resource Limits**: Add memory/CPU limits in docker-compose for production
3. **Security**: Change default Grafana admin password
4. **Retention**: Configure Prometheus retention period based on storage capacity
5. **High Availability**: Consider Prometheus + Thanos for long-term storage

## Traefik Integration

The monitoring services are accessible via Traefik:

- Prometheus: http://prometheus.localhost
- Grafana: http://grafana.localhost

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GRAFANA_ADMIN_USER` | Grafana admin username | admin |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin password | admin |

## Troubleshooting

### Prometheus not scraping targets

1. Check the service is exposing a `/metrics` endpoint (only `controls` does
   today - see "Adding Custom Metrics" above); `/health` returns JSON and
   will always show the target as down
2. Verify network connectivity between containers
3. Check Prometheus targets page: http://localhost:9090/targets

### Grafana not showing data

1. Verify Prometheus datasource is configured correctly
2. Check time range in Grafana matches data availability
3. Ensure Prometheus is collecting metrics

### High memory usage

1. Reduce scrape interval
2. Decrease retention period
3. Add recording rules for expensive queries

