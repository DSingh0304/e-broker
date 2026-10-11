# ECR module - Lambda container image registries
resource "aws_ecr_repository" "api" {
  for_each = toset(["public", "admin", "internal"])
  name                 = "${var.project}-${each.value}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}
