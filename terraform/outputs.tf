output "db_endpoint" {
  description = "The RDS Postgres connection endpoint (host:port)"
  value       = aws_db_instance.main.endpoint
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "server_ip" {
  description = "Fixed public IP of the EC2 instance — SSH here, point DNS/frontend API URLs here"
  value       = aws_eip.main.public_ip
}

output "instance_id" {
  description = "EC2 instance ID — needed as the AWS_EC2_INSTANCE_ID GitHub secret for the deploy workflow"
  value       = aws_instance.main.id
}

output "github_actions_role_arn" {
  description = "IAM role ARN GitHub Actions assumes via OIDC — needed as the AWS_ROLE_ARN GitHub secret"
  value       = aws_iam_role.github_actions_deploy.arn
}
