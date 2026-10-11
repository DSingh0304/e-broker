# RDS module — PostgreSQL 16 (db.t4g.micro Single-AZ) + RDS Proxy
resource "aws_db_parameter_group" "ebroker" {
  name   = "${var.project}-pg16"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "ebroker" {
  identifier             = "${var.project}-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  db_name                = "ebroker"
  username               = "ebroker"
  password               = var.db_password
  parameter_group_name   = aws_db_parameter_group.ebroker.name
  db_subnet_group_name   = var.db_subnet_group
  vpc_security_group_ids = [var.sg_rds_id]
  storage_encrypted      = true
  skip_final_snapshot    = true # dev only
}

resource "aws_db_proxy" "ebroker" {
  name                   = "${var.project}-proxy"
  engine_family          = "POSTGRESQL"
  role_arn               = var.proxy_role_arn
  vpc_subnet_ids         = var.private_subnet_ids
  auth {
    auth_scheme = "SECRETS"
    secret_arn  = var.db_secret_arn
  }
}
