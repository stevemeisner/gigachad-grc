# GigaChad GRC Platform - Terraform Outputs

output "application_url" {
  description = "URL to access the GRC application"
  value       = var.enable_https ? "https://${module.alb.dns_name}" : "http://${module.alb.dns_name}"
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = module.alb.dns_name
}

output "database_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "s3_bucket_name" {
  description = "S3 bucket name for file storage"
  value       = module.s3.bucket_name
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "deployment_instructions" {
  description = "Post-deployment instructions"
  value       = <<-EOT
    GigaChad GRC Platform has been deployed successfully!

    Next steps:
    1. Point your domain to the load balancer: ${module.alb.dns_name}
    2. Access the application at: ${var.enable_https ? "https" : "http"}://${module.alb.dns_name}
    3. Set firebase_project_id and allowed_email_domains, and build the frontend image with the VITE_FIREBASE_* build args
    4. Apply the database schema (npm run db:push)
    5. Create the first organization and admin user - see docs/DEPLOYMENT-RUNBOOK.md

    For detailed post-deployment steps, see: docs/post-deployment.md
  EOT
}
