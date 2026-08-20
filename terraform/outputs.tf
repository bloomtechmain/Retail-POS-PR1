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
