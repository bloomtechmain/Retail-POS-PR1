terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket         = "retail-pos-tfstate-010724907215"
    key            = "retail-pos/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "retail-pos-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = "us-east-2"
}
