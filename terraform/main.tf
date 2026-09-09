# GigaChad GRC Platform - AWS Infrastructure
#
# UNMAINTAINED ALTERNATIVE DEPLOYMENT PATH.
# The supported production deployment is a single VM running docker-compose.prod.yml
# behind the nginx gateway, documented in docs/DEPLOYMENT-RUNBOOK.md.
# This Terraform has never been applied against the current codebase; treat it as a
# starting point that needs verification, not as a working deployment.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Uncomment to use S3 backend for state management
  # backend "s3" {
  #   bucket         = "your-terraform-state-bucket"
  #   key            = "gigachad-grc/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "GigaChad-GRC"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Generate random suffix for unique resource names
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# VPC and Networking
module "vpc" {
  source = "./modules/vpc"

  name_prefix         = local.name_prefix
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  enable_nat_gateway  = var.enable_nat_gateway
  single_nat_gateway  = var.single_nat_gateway

  tags = local.common_tags
}

# Security Groups
module "security_groups" {
  source = "./modules/security-groups"

  name_prefix = local.name_prefix
  vpc_id      = module.vpc.vpc_id

  allowed_cidr_blocks = var.allowed_cidr_blocks

  tags = local.common_tags
}

# Application Load Balancer
module "alb" {
  source = "./modules/alb"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids
  security_group_ids = [module.security_groups.alb_security_group_id]

  certificate_arn    = var.ssl_certificate_arn
  enable_https       = var.enable_https

  tags = local.common_tags
}

# RDS PostgreSQL Database
module "rds" {
  source = "./modules/rds"

  name_prefix            = local.name_prefix
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  security_group_ids     = [module.security_groups.rds_security_group_id]

  engine_version         = var.rds_engine_version
  instance_class         = var.rds_instance_class
  allocated_storage      = var.rds_allocated_storage
  max_allocated_storage  = var.rds_max_allocated_storage

  database_name          = var.database_name
  master_username        = var.database_username
  master_password        = var.database_password

  backup_retention_period = var.rds_backup_retention_period
  multi_az               = var.rds_multi_az

  tags = local.common_tags
}

# S3 Bucket for File Storage
module "s3" {
  source = "./modules/s3"

  name_prefix    = local.name_prefix
  random_suffix  = random_id.suffix.hex

  enable_versioning = var.s3_enable_versioning
  lifecycle_rules   = var.s3_lifecycle_rules

  tags = local.common_tags
}

# ECS Cluster and Services
module "ecs" {
  source = "./modules/ecs"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  alb_target_group_arn = module.alb.target_group_arn
  security_group_ids   = [module.security_groups.ecs_security_group_id]

  # Database configuration
  database_host     = module.rds.endpoint
  database_port     = module.rds.port
  database_name     = var.database_name
  database_username = var.database_username
  database_password = var.database_password

  # S3 configuration
  s3_bucket_name = module.s3.bucket_name
  s3_bucket_arn  = module.s3.bucket_arn

  # Container images
  container_registry = var.container_registry
  image_tag          = var.image_tag

  # Service sizing
  service_desired_count = var.ecs_service_desired_count
  task_cpu             = var.ecs_task_cpu
  task_memory          = var.ecs_task_memory

  # Firebase Authentication configuration
  # AUTH_MODE is intentionally not passed: its only valid production value is unset,
  # and FirebaseAuthGuard throws at boot when AUTH_MODE=demo and NODE_ENV=production.
  firebase_project_id   = var.firebase_project_id
  allowed_email_domains = var.allowed_email_domains
  auth_auto_provision   = var.auth_auto_provision
  auth_default_org_id   = var.auth_default_org_id

  tags = local.common_tags
}
