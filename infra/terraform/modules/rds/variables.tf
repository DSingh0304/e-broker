variable "project" {
  type    = string
  default = "ebroker"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "db_subnet_group" {
  type = string
}

variable "sg_rds_id" {
  type = string
}

variable "proxy_role_arn" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "db_secret_arn" {
  type = string
}
