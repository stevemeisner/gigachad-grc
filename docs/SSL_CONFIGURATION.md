# SSL/TLS Configuration Guide

This guide explains how to configure SSL/TLS for all GigaChad GRC services in production.

## Overview

In production, all connections should be encrypted:
- **Database connections** (PostgreSQL)
- **Object storage connections** (MinIO/S3)
- **Frontend** (HTTPS via Traefik)
- **API endpoints** (HTTPS via Traefik)

## Database SSL Configuration

### PostgreSQL Connection String

Add `?sslmode=require` to your DATABASE_URL:

```bash
# Development (no SSL)
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Production (with SSL)
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

### SSL Modes

| Mode | Description | Recommended |
|------|-------------|-------------|
| `disable` | No SSL | ❌ Never |
| `allow` | Try SSL, fall back to non-SSL | ❌ Insecure |
| `prefer` | Try SSL, fall back to non-SSL (default) | ⚠️ Dev only |
| `require` | Require SSL, don't verify cert | ✅ Internal network |
| `verify-ca` | Require SSL, verify CA | ✅ Production |
| `verify-full` | Require SSL, verify CA and hostname | ✅ External DB |

### Using Custom Certificates

If your PostgreSQL server uses a custom CA:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=verify-ca&sslrootcert=/path/to/ca.crt
```

### Prisma Configuration

The Prisma client automatically uses SSL settings from DATABASE_URL. No additional configuration needed.

## Object Storage SSL Configuration

### MinIO with SSL

1. Enable SSL in `.env.prod`:

```bash
MINIO_USE_SSL=true
```

2. If using a custom certificate, mount it in Docker:

```yaml
# docker-compose.prod.yml
minio:
  volumes:
    - ./certs/minio:/root/.minio/certs
```

3. Place certificates:
```
certs/minio/
├── public.crt    # Server certificate
├── private.key   # Private key
└── CAs/          # CA certificates (optional)
    └── ca.crt
```

### AWS S3

AWS S3 uses SSL by default. No additional configuration needed.

### Azure Blob Storage

Azure Blob Storage uses SSL by default. Ensure your connection string starts with `https://`.

## Traefik SSL Configuration

### Automatic SSL with Let's Encrypt

The production Docker Compose automatically configures SSL via Let's Encrypt:

```yaml
# docker-compose.prod.yml
traefik:
  command:
    - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
```

### Manual SSL Certificates

For custom certificates:

1. Create a dynamic configuration file:

```yaml
# traefik/dynamic/certs.yml
tls:
  certificates:
    - certFile: /certs/server.crt
      keyFile: /certs/server.key
```

2. Mount certificates in Docker:

```yaml
traefik:
  volumes:
    - ./certs:/certs:ro
    - ./traefik/dynamic:/etc/traefik/dynamic:ro
```

## Verification

### Check Database SSL

```bash
# Connect and verify SSL
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SHOW ssl;"

# Should return: on
```

### Check Traefik SSL

```bash
# Test SSL certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Or use curl
curl -vvv https://yourdomain.com 2>&1 | grep -A 5 "SSL connection"
```

### Check MinIO SSL

```bash
# Test MinIO endpoint
curl -vvv https://storage.yourdomain.com/minio/health/live
```

## Production Checklist

- [ ] DATABASE_URL includes `?sslmode=require` or stricter
- [ ] MINIO_USE_SSL=true
- [ ] Traefik has valid SSL certificates
- [ ] All internal service-to-service communication uses internal network
- [ ] Frontend served over HTTPS only
- [ ] HSTS headers enabled
- [ ] API endpoints only accessible via HTTPS

## Troubleshooting

### "SSL connection required" error

Your client is trying to connect without SSL. Ensure:
1. The connection string includes SSL parameters
2. The client library supports SSL
3. The server is configured to accept SSL connections

### "Certificate verify failed" error

1. Check if using self-signed certificate
2. Add CA certificate to trusted store
3. Use `sslmode=require` instead of `verify-full` for internal networks

### "Connection refused on port 443"

1. Verify Traefik is running and bound to port 443
2. Check firewall rules allow inbound 443
3. Verify DNS resolves to correct IP

## References

- [PostgreSQL SSL Support](https://www.postgresql.org/docs/current/libpq-ssl.html)
- [MinIO TLS Configuration](https://min.io/docs/minio/linux/operations/network-encryption.html)
- [Traefik HTTPS & TLS](https://doc.traefik.io/traefik/https/overview/)

