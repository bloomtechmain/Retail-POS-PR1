resource "aws_db_subnet_group" "main" {
  name       = "retail-pos-db-subnet-group"
  subnet_ids = [aws_subnet.public.id, aws_subnet.public_b.id]

  tags = {
    Name = "retail-pos-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "retail-pos-rds-sg"
  description = "Allow Postgres access to the retail-pos RDS instance"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Postgres from inside the VPC (EC2 instance)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "retail-pos-rds-sg"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "retail-pos-db"
  engine         = "postgres"
  engine_version = "16.13"
  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_type      = "gp2"

  db_name  = "retail_pos"
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # No longer publicly reachable — only from the EC2 instance's security
  # group, inside the VPC. Was temporarily open to var.my_ip for initial
  # setup; that's done now (see AWS_DEPLOYMENT.md §8).
  publicly_accessible = false

  backup_retention_period   = 1
  final_snapshot_identifier = "retail-pos-db-final"
  skip_final_snapshot       = false
  deletion_protection       = true

  tags = {
    Name = "retail-pos-db"
  }
}
