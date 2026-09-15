locals {
  # Cloudflare's published edge IP ranges (https://www.cloudflare.com/ips/).
  # Ports 47821/47822 are restricted to these instead of 0.0.0.0/0 because
  # both app domains are proxied through Cloudflare — direct internet traffic
  # to these ports would just bypass Cloudflare's TLS termination.
  cloudflare_ipv4 = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ]
  cloudflare_ipv6 = [
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ]
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_key_pair" "main" {
  key_name   = "retail-pos-key"
  public_key = file(pathexpand("~/.ssh/retail-pos-aws.pub"))

  lifecycle {
    # AWS never returns a key pair's public key material on read, so a freshly
    # imported key pair always looks like it differs from config here — which
    # would otherwise force a pointless destroy+recreate of the real key pair.
    ignore_changes = [public_key]
  }
}

resource "aws_security_group" "ec2" {
  name        = "retail-pos-ec2-sg"
  description = "Allow SSH from my IP and web traffic from anywhere"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "SSH from my IP"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip]
  }

  ingress {
    description      = "Cloudflare"
    from_port        = 47821
    to_port          = 47821
    protocol         = "tcp"
    cidr_blocks      = local.cloudflare_ipv4
    ipv6_cidr_blocks = local.cloudflare_ipv6
  }

  ingress {
    description = "HTTPS (kept standard for when a domain + cert are added)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description      = "Cloudflare"
    from_port        = 47822
    to_port          = 47822
    protocol         = "tcp"
    cidr_blocks      = local.cloudflare_ipv4
    ipv6_cidr_blocks = local.cloudflare_ipv6
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "retail-pos-ec2-sg"
  }
}

resource "aws_instance" "main" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  key_name               = aws_key_pair.main.key_name
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm.name

  lifecycle {
    # This box is a stateful "pet", not disposable — a newer AMI becoming
    # "most recent" or a user_data edit (meant for freshly provisioned
    # instances, see AWS_DEPLOYMENT.md §12) must never silently trigger a
    # destroy+recreate of the live production instance. EC2 also rejects
    # user_data modification on a running instance outright.
    ignore_changes = [ami, user_data]
  }

  user_data = <<-EOF
    #!/bin/bash
    dnf update -y
    dnf install -y git nginx docker
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    dnf install -y nodejs
    npm install -g pm2

    # Docker Compose v2 plugin (not in AL2023's dnf repos yet)
    mkdir -p /usr/libexec/docker/cli-plugins
    curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
      -o /usr/libexec/docker/cli-plugins/docker-compose
    chmod +x /usr/libexec/docker/cli-plugins/docker-compose
    usermod -aG docker ec2-user

    systemctl enable --now docker
    systemctl enable nginx
    systemctl start nginx
  EOF

  tags = {
    Name = "retail-pos-server"
  }
}

resource "aws_eip" "main" {
  instance = aws_instance.main.id
  domain   = "vpc"

  tags = {
    Name = "retail-pos-eip"
  }
}
