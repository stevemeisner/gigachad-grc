# GigaChad GRC Platform - Terraform Deployment

This directory contains Terraform configurations to deploy the GigaChad GRC platform to AWS.

## Architecture

The deployment creates:
- **VPC** with public and private subnets across multiple AZs
- **Application Load Balancer** with optional SSL/TLS
- **ECS Fargate** cluster running microservices
- **RDS PostgreSQL** database with automatic backups
- **S3** bucket for file storage (policies, evidence, etc.)
- **Security Groups** with least-privilege access

> **This AWS path is an unmaintained alternative and has never been applied
> against the current codebase.** The supported production deployment is the
> single VM running `docker-compose.prod.yml` behind an nginx gateway,
> documented step by step in
> [../docs/DEPLOYMENT-RUNBOOK.md](../docs/DEPLOYMENT-RUNBOOK.md).
>
> The Terraform has been brought in line with Firebase authentication:
> `firebase_project_id`, `allowed_email_domains`, `auth_auto_provision` and
> `auth_default_org_id` are declared in `variables.tf` and injected into all
> six backend task definitions. `AUTH_MODE` is deliberately absent \u2014 its only
> valid production value is unset. Treat this configuration as a starting
> point to review, not a tested deployment.


## Prerequisites

1. **AWS Account** with appropriate permissions
2. **Terraform** >= 1.5.0 installed
3. **AWS CLI** configured with credentials
4. **Docker images** pushed to container registry (ECR or Docker Hub)
5. **SSL Certificate** in AWS Certificate Manager (for HTTPS)
6. **Firebase project** with the Google sign-in provider enabled (hosted by Google; nothing to run yourself) - see the note above about wiring it into this configuration

## Quick Start

### 1. Configure Variables

```bash
# Copy the example configuration
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vi terraform.tfvars
```

**Required variables to change:**
- `aws_region` - Your AWS region
- `ssl_certificate_arn` - ARN of your SSL certificate
- `database_password` - Strong database password
- `container_registry` - Your container registry URL
- `allowed_cidr_blocks` - IP ranges allowed to access the app
- `firebase_project_id` - your Firebase project id (services refuse to boot without it)
- `allowed_email_domains` - the company domain permitted to sign in

### 2. Initialize Terraform

```bash
terraform init
```

### 3. Review the Plan

```bash
terraform plan
```

Review the resources that will be created. Expected resources: ~50-70 resources.

### 4. Deploy

```bash
terraform apply
```

Type `yes` when prompted. Deployment takes approximately 15-20 minutes.

### 5. Post-Deployment

After successful deployment:

```bash
# Get the load balancer URL
terraform output application_url

# Get all outputs
terraform output
```

See [Post-Deployment Steps](#post-deployment-steps) below.

## Deployment Sizes

There are no `environments/small|medium|large` directories - this
configuration is a single root module (`main.tf`, `variables.tf`,
`outputs.tf`, `modules/`). Pick a size by setting variables in
`terraform.tfvars`:

### Small (Development/Testing)
**Cost**: ~$200-300/month

```hcl
availability_zones        = ["us-east-1a"]   # single AZ
single_nat_gateway        = true
rds_instance_class        = "db.t3.medium"
rds_multi_az              = false
ecs_service_desired_count = 1
```

### Medium (Production - Standard)
**Cost**: ~$500-800/month

```hcl
rds_instance_class        = "db.t3.large"
rds_multi_az              = true
ecs_service_desired_count = 2
```

### Large (Production - High Traffic)
**Cost**: ~$1500-2500/month

```hcl
rds_instance_class        = "db.r6g.xlarge"
rds_multi_az              = true
ecs_service_desired_count = 4
```

Then `terraform apply` from this directory.

## Post-Deployment Steps

### 1. DNS Configuration

Point your domain to the load balancer:

```bash
# Get the load balancer DNS
terraform output load_balancer_dns

# Create a CNAME record:
# grc.yourdomain.com -> [load-balancer-dns]
```

### 2. Database Migrations

Apply the Prisma schema to the RDS instance:

```bash
# Get database connection details
terraform output database_endpoint

# From a machine that can reach the database (an ECS task via
# `aws ecs execute-command`, a bastion, or a VPN), with DATABASE_URL set:
cd services/controls
npx prisma migrate deploy --schema=../shared/prisma/schema.prisma
```

### 3. Create Initial Organization

```bash
# Access the database
psql -h [database-endpoint] -U grc_admin -d gigachad_grc
```

```sql
-- updated_at has no database default (Prisma sets it in application code),
-- so a hand-written INSERT must supply it.
INSERT INTO organizations (id, name, slug, settings, updated_at)
VALUES (
  gen_random_uuid(),
  'Your Organization',
  'your-org',
  '{}'::jsonb,
  NOW()
);
```

### 4. Configure Firebase Authentication

Sign-in is Firebase Authentication with the Google provider; there is no
identity server to deploy. Create the Firebase project, enable the Google
provider, add the production host to the authorized domains, and register a
Web app (see [../deploy/README.md](../deploy/README.md) for the full
walkthrough).

The backend auth variables are already wired into the six task definitions.
What Terraform cannot do for you is the frontend: `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN` and `VITE_FIREBASE_PROJECT_ID` are compiled into
the browser bundle at `docker build` time, so they must be passed as build
arguments when the frontend image is built and pushed, not injected by the
task definition. The web API key is a public client identifier, not a secret.

### 5. Create the First Administrator

Nothing creates it for you. Signing in with Google proves identity; access
is granted only by a `users` row. Insert it against the organization created
above - see the runbook
([../docs/DEPLOYMENT-RUNBOOK.md](../docs/DEPLOYMENT-RUNBOOK.md)) for the
exact statement, including the `external_id` placeholder that is replaced on
first sign-in.

### 6. Test the Deployment

```bash
# The ALB health-check path for every service target group is /health
curl https://your-domain.com/health

# Application health (controls service)
curl https://your-domain.com/api/system/health
```

## Monitoring and Logging

### CloudWatch Logs

All container logs are sent to CloudWatch:

```bash
# View logs for a specific service
aws logs tail /ecs/gigachad-grc-production-controls --follow
```

### Metrics

Key metrics to monitor:
- **ECS Service**: CPU/Memory utilization
- **RDS**: CPU, connections, storage
- **ALB**: Request count, target response time

## Backup and Disaster Recovery

### Automated Backups

- **RDS**: Daily automated backups (7-day retention by default)
- **S3**: Versioning enabled for all objects

### Manual Backup

```bash
# Create RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier gigachad-grc-production \
  --db-snapshot-identifier gigachad-grc-backup-$(date +%Y%m%d)

# Backup S3 bucket
aws s3 sync s3://gigachad-grc-production-files/ ./backup/
```

### Disaster Recovery

```bash
# Restore from RDS snapshot
terraform import module.rds.aws_db_instance.this gigachad-grc-production

# Restore S3 objects
aws s3 sync ./backup/ s3://gigachad-grc-production-files/
```

## Scaling

### Manual Scaling

```bash
# Update desired count in terraform.tfvars
ecs_service_desired_count = 4

# Apply changes
terraform apply
```

### Auto-Scaling (Large deployment only)

Auto-scaling is configured based on:
- CPU utilization > 70%
- Memory utilization > 80%
- ALB request count

## Security Best Practices

1. **Use AWS Secrets Manager** for sensitive values
2. **Enable VPC Flow Logs** for network monitoring
3. **Restrict `allowed_cidr_blocks`** to your organization's IPs
4. **Enable MFA** on AWS account
5. **Use IAM roles** instead of access keys
6. **Enable AWS GuardDuty** for threat detection
7. **Regular security audits** with AWS Config

## Cost Optimization

### Development/Testing
- Use `single_nat_gateway = true`
- Set `rds_multi_az = false`
- Use `db.t3.medium` instance class
- Reduce `ecs_service_desired_count` to 1

### Production
- Enable RDS Reserved Instances for ~40% savings
- Use Savings Plans for ECS Fargate
- Implement S3 lifecycle policies
- Schedule non-critical resources to stop overnight

## Troubleshooting

### ECS Tasks Fail to Start

```bash
# Check task logs
aws ecs describe-tasks --cluster gigachad-grc-production --tasks [task-id]

# Check service events
aws ecs describe-services --cluster gigachad-grc-production --services controls
```

### Database Connection Issues

```bash
# Verify security group rules
aws ec2 describe-security-groups --group-ids [rds-sg-id]

# Test connectivity from ECS task
aws ecs execute-command --cluster gigachad-grc-production \
  --task [task-id] \
  --container controls \
  --interactive \
  --command "/bin/sh"
```

### High Costs

```bash
# Analyze costs by service
aws ce get-cost-and-usage --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE

# Check for idle resources
terraform state list | xargs -I {} terraform state show {}
```

## Cleanup

To destroy all resources:

```bash
# WARNING: This will delete everything including the database!
terraform destroy
```

## Support

For issues or questions:
- **Documentation**: docs/
- **GitHub Issues**: https://github.com/your-org/gigachad-grc/issues
- **Email**: support@your-domain.com

## License

Copyright © 2024 Your Company. All rights reserved.
