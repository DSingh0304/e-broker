output "api_url" {
  description = "API Gateway URL (from SAM stack)"
  value       = "see SAM outputs"
}

output "rds_endpoint" {
  description = "RDS Proxy endpoint"
  value       = module.rds.proxy_endpoint
}
