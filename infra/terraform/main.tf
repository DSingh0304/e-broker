# E-Broker Terraform — ap-south-1, 3-tier VPC + RDS + S3 + Cognito + SQS + ECR
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.region
}

module "vpc" {
  source  = "./modules/vpc"
  region  = var.region
  project = var.project
}

resource "aws_security_group" "lambda" {
  name   = "${var.project}-lambda"
  vpc_id = module.vpc.vpc_id
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name   = "${var.project}-rds"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }
}

resource "aws_secretsmanager_secret" "db" {
  name = "${var.project}/db"
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({ username = "ebroker", password = var.db_password })
}

resource "aws_iam_role" "rds_proxy" {
  name = "${var.project}-rds-proxy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

module "rds" {
  source             = "./modules/rds"
  project            = var.project
  db_password        = var.db_password
  db_subnet_group    = module.vpc.db_subnet_group
  sg_rds_id          = aws_security_group.rds.id
  proxy_role_arn     = aws_iam_role.rds_proxy.arn
  private_subnet_ids = module.vpc.private_subnets
  db_secret_arn      = aws_secretsmanager_secret.db.arn
}

module "s3" {
  source  = "./modules/s3"
  region  = var.region
  project = var.project
}

module "cognito" {
  source  = "./modules/cognito"
  project = var.project
}

module "sqs" {
  source  = "./modules/sqs"
  project = var.project
}

module "ecr" {
  source  = "./modules/ecr"
  project = var.project
}
