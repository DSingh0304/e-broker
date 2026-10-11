variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Project slug for resource names"
  type        = string
  default     = "ebroker"
}

variable "db_password" {
  description = "RDS master password (use SSM/Secrets Manager in prod)"
  type        = string
  sensitive   = true
}
