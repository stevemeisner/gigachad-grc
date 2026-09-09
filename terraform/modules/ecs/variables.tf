variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where ECS services will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs for ECS tasks"
  type        = list(string)
}

variable "alb_target_group_arns" {
  description = "Map of service names to ALB target group ARNs"
  type = map(string)
  default = {
    controls   = ""
    frameworks = ""
    policies   = ""
    tprm       = ""
    trust      = ""
    audit      = ""
    frontend   = ""
  }
}

variable "database_host" {
  description = "PostgreSQL database hostname"
  type        = string
}

variable "database_port" {
  description = "PostgreSQL database port"
  type        = number
  default     = 5432
}

variable "database_name" {
  description = "PostgreSQL database name"
  type        = string
}

variable "database_username" {
  description = "PostgreSQL database username"
  type        = string
  sensitive   = true
}

variable "database_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "s3_bucket_name" {
  description = "S3 bucket name for file storage"
  type        = string
}

variable "s3_bucket_arn" {
  description = "S3 bucket ARN for IAM permissions"
  type        = string
}

variable "container_registry" {
  description = "Container registry URL (e.g., ECR repository URL)"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "service_desired_count" {
  description = "Desired number of tasks for each service"
  type        = number
  default     = 2
}

variable "task_cpu" {
  description = "CPU units for ECS tasks (256 = 0.25 vCPU, 512 = 0.5 vCPU, 1024 = 1 vCPU, 2048 = 2 vCPU)"
  type        = string
  default     = "512"
}

variable "task_memory" {
  description = "Memory for ECS tasks in MB (512, 1024, 2048, 4096, etc.)"
  type        = string
  default     = "1024"
}

# Firebase Authentication configuration
# NOTE: AUTH_MODE is deliberately absent. Its only valid production value is unset --
# FirebaseAuthGuard throws at boot when AUTH_MODE=demo and NODE_ENV=production.
variable "firebase_project_id" {
  description = "Firebase project ID used to verify ID tokens (required; services refuse to boot without it)"
  type        = string
}

variable "allowed_email_domains" {
  description = "Comma-separated list of email domains allowed to sign in (empty disables the domain check)"
  type        = string
  default     = ""
}

variable "auth_auto_provision" {
  description = "Automatically create a user record on first successful sign-in"
  type        = bool
  default     = false
}

variable "auth_default_org_id" {
  description = "Organization ID assigned to auto-provisioned users (empty to disable)"
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-west-2"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "autoscaling_min_capacity" {
  description = "Minimum number of tasks for auto scaling"
  type        = number
  default     = 1
}

variable "autoscaling_max_capacity" {
  description = "Maximum number of tasks for auto scaling"
  type        = number
  default     = 10
}
