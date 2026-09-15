# Remote state: S3 (state storage, versioned) + DynamoDB (apply locking).
# Bootstrap note: these are created under local state first, then main.tf's
# backend block is added and `terraform init -migrate-state` moves the state
# file (including these resources' own entries) into the bucket it describes.
# That self-referential pattern is normal and supported.

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "tfstate" {
  bucket = "retail-pos-tfstate-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "retail-pos-tfstate"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tfstate_lock" {
  name         = "retail-pos-tfstate-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name = "retail-pos-tfstate-lock"
  }
}
