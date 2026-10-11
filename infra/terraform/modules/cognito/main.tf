# Cognito module - admin user pool, TOTP MFA enforced
resource "aws_cognito_user_pool" "admins" {
  name = "${var.project}-admins"

  mfa_configuration = "ON"
  software_token_mfa_configuration {
    enabled = true
  }

  schema {
    name                = "role"
    attribute_data_type = "String"
    mutable             = true
  }
}

resource "aws_cognito_user_pool_client" "admin_client" {
  name         = "${var.project}-admin-client"
  user_pool_id = aws_cognito_user_pool.admins.id
  explicit_auth_flows = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
}
