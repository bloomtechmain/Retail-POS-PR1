variable "db_username" {
  description = "Master username for the RDS Postgres instance"
  type        = string
  default     = "pos_admin"
}

variable "db_password" {
  description = "Master password for the RDS Postgres instance"
  type        = string
  sensitive   = true
}

variable "my_ip" {
  description = "Your current public IP (CIDR form, e.g. 1.2.3.4/32) — temporarily allowed to reach RDS directly for setup"
  type        = string
}
