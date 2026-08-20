# Deploying Retail-POS-PR1 to AWS with Terraform

This document explains **what this project is**, **what it needs to run**, and **how to deploy it to AWS using Terraform**, for someone with no prior AWS or Terraform experience. It is a guide to read and follow step by step — it does not assume you've deployed anything before.

---

## 1. What this project actually is

This repo (`apps/`) is a multi-tenant retail Point-of-Sale platform made of **five separate deployable pieces** that talk to each other over HTTP:

| App | Path | What it is | Port (local dev) |
|---|---|---|---|
| POS backend | `apps/pos/backend` | Node/Express API — the core POS (products, sales, inventory, tenants, users) | 5000 |
| POS frontend | `apps/pos/frontend` | React app (Vite) — the actual POS UI used by shop staff, also packaged into the offline Electron desktop app | 5173 |
| Admin dashboard backend | `apps/admin-dashboard/backend` | Node/Express API — staff/agent accounts, customer provisioning, feature customization, subscription billing | 5001 |
| Admin dashboard frontend | `apps/admin-dashboard/frontend` | React app (Vite) — the internal ops tool your agents/admins use | 5191 |
| License server | `apps/license-server` | Node/Express API + SQLite — issues and verifies Ed25519-signed license keys for **offline** (Electron) customers | 3001 |
| Website | `apps/website` | React app (Vite) — public self-serve signup site for **online** customers | 5190 |

**Database**: one shared PostgreSQL database is used by both `pos/backend` and `admin-dashboard/backend` (different tables, same physical DB — see `project_admin_dashboard` notes: `pos/backend` owns `tenants`/`users`/every tenant schema, `admin-dashboard/backend` owns `staff`/`platform_customers`). `license-server` uses its own separate SQLite file — it does not touch Postgres at all.

**Multi-tenancy**: `pos/backend` uses schema-per-tenant — every signed-up business gets its own Postgres schema (`tenant_1`, `tenant_2`, ...) inside the same database, switched per-request based on the logged-in user's JWT.

Because these are independent Node processes talking over plain HTTP with env-var-configured URLs, **none of this requires containers or anything exotic to deploy** — it's exactly the kind of workload a single EC2 instance (or a couple) running under `nginx` + a process manager was built for.

---

## 2. What Terraform's job is here

Terraform will provision the **infrastructure** (the empty AWS resources): the server, the database, the network rules, the storage. It will **not** install Node, pull your code, or start your app — that's a second, separate step (either manual SSH commands, a startup script, or a simple deploy script). Keeping these two concerns separate is normal and makes debugging much easier when something breaks.

What Terraform will create for this project:

1. **VPC + subnets + security groups** — the network "walls": which ports are open, from where.
2. **RDS PostgreSQL instance** — the managed database for `pos/backend` + `admin-dashboard/backend`.
3. **One EC2 instance** — runs all three backend Node processes (`pos-backend`, `admin-backend`, `license-server`) side by side via a process manager, plus `nginx` in front.
4. **An Elastic IP** — a fixed public IP for that EC2 instance (so it doesn't change on reboot).
5. **S3 buckets + CloudFront distributions** — static hosting for the three frontends (`pos-frontend`, `admin-dashboard-frontend`, `website`).
6. **IAM role** for the EC2 instance (permissions it needs, e.g. to read secrets).
7. *(Optional, later)* **Route 53** for a real domain name, **ACM** for free HTTPS certificates.

---

## 3. Prerequisites (do these once, outside Terraform)

1. **Create an AWS account** (aws.amazon.com) and set up billing.
2. **Create an IAM user for yourself** (don't use the root account day-to-day) with programmatic access, and note its Access Key ID / Secret Access Key.
3. **Install the AWS CLI**, then run `aws configure` and paste in those keys + your preferred region (e.g. `ap-south-1` or `us-east-1`).
4. **Install Terraform** (`terraform -v` to confirm).
5. **Generate an SSH key pair** you'll use to log into the EC2 instance (`ssh-keygen`), or plan to use AWS Systems Manager Session Manager instead (no SSH key needed, slightly more setup).
6. **Buy/point a domain** (optional at first — you can deploy with just the raw EC2 IP / CloudFront URLs and add a domain later).

---

## 4. Environment variables each service needs

Terraform will end up injecting these into the EC2 instance (via SSM Parameter Store / Secrets Manager, **not** hardcoded into `.tf` files). This is the exact list, taken from each app's `.env.example`:

**`apps/pos/backend/.env`**
```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:password@<rds-endpoint>:5432/retail_pos
JWT_SECRET=<long random secret>
JWT_EXPIRES_IN=8h
INTERNAL_API_KEY=<long random secret — must match admin-backend's copy>
```

**`apps/admin-dashboard/backend/.env`**
```
NODE_ENV=production
PORT=5001
DATABASE_URL=postgresql://user:password@<rds-endpoint>:5432/retail_pos   # same DB as pos/backend
JWT_SECRET=<a different long random secret>
POS_BACKEND_URL=https://api.yourdomain.com          (or http://localhost:5000 if same box)
INTERNAL_API_KEY=<must match pos/backend's copy exactly>
LICENSE_SERVER_URL=https://license.yourdomain.com   (or http://localhost:3001 if same box)
LICENSE_SERVER_ADMIN_USERNAME=admin
LICENSE_SERVER_ADMIN_PASSWORD=<strong password>
```

**`apps/license-server/.env`**
```
NODE_ENV=production
PORT=3001
ED25519_PRIVATE_KEY=<generate via: npm run setup, in apps/license-server>
ED25519_PUBLIC_KEY=<same — also gets embedded in electron/license.js for the desktop app>
DB_PATH=/data/licenses.db     # put this on a persistent EBS-backed path, not /tmp
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong password>
JWT_SECRET=<another long random secret>
```

Frontends (`pos/frontend`, `admin-dashboard/frontend`, `website`) are **build-time** configured — their API URLs get baked into the static build via Vite env vars (`VITE_API_URL`) before `npm run build`, not injected at runtime like the backends.

---

## 5. The EC2 + nginx layout

One instance (e.g. `t3.small`, 2GB RAM — enough for all 3 Node processes at this scale) runs:

```
Internet (443) → nginx → routes by path/subdomain:
                          /api/*          → localhost:5000  (pos-backend)
                          /admin-api/*    → localhost:5001  (admin-backend)
                          /license-api/*  → localhost:3001  (license-server)
```

`nginx` also terminates HTTPS (via a free Let's Encrypt cert, or an AWS ACM cert if you put a Load Balancer in front instead — not required at this scale). The three Node processes are kept alive with **pm2** (`pm2 start`, auto-restarts on crash, auto-starts on reboot).

The three **frontends** don't need to live on this EC2 box at all — S3 + CloudFront is simpler and cheaper for static files. (You *could* have nginx serve them directly from the same box instead, if you'd rather keep everything in one place while learning — that's a valid simpler-but-less-scalable choice too.)

---

## 6. Terraform project structure

A reasonable layout for this project:

```
terraform/
├── main.tf          # provider config, calls to modules/resources
├── variables.tf      # inputs: region, db password, instance size, etc.
├── outputs.tf        # e.g. the EC2 public IP, RDS endpoint, CloudFront URLs
├── vpc.tf             # VPC, subnets, security groups
├── rds.tf             # the Postgres database
├── ec2.tf             # the instance, Elastic IP, IAM role
├── s3-cloudfront.tf   # the three static frontend buckets/distributions
├── terraform.tfvars   # your actual values (gitignored — never commit secrets!)
└── user-data.sh       # startup script: installs Node/nginx/pm2 on first boot
```

Terraform's **state file** (`terraform.tfstate`) should **not** stay on your laptop once this is "real" — configure an S3 backend + DynamoDB lock table for it early, so state isn't lost if your machine dies and so it's safe if more than one person ever runs `terraform apply`.

---

## 7. Step-by-step build order (this is the actual plan)

Don't write all the `.tf` files at once. Build and verify in this order:

1. **VPC + security groups only.** Apply, confirm it exists in the AWS Console.
2. **RDS Postgres.** Apply, then connect to it manually with `psql` from your laptop (temporarily allow your IP in its security group) to confirm it's reachable. This is the same schema your `apps/pos/backend/database/schema.sql` / migrations already know how to build — nothing AWS-specific about the schema itself.
3. **EC2 instance** with a `user-data.sh` startup script that installs Node, nginx, pm2, and git. SSH in, manually `git clone` your repo, fill in `.env` files by hand, `npm run install:all`, `npm run build:all`, `pm2 start` each backend. Get this fully working **manually** before trying to automate it.
4. **nginx config** on that box routing the three paths, confirm each backend is reachable over HTTPS from your browser.
5. **S3 + CloudFront** for one frontend first (`pos/frontend`) — build it locally with `VITE_API_URL` pointing at your EC2's public URL, upload the `dist/` folder, confirm it loads and can log in against the real backend.
6. Repeat step 5 for `admin-dashboard/frontend` and `website`.
7. **Only after everything works end-to-end**, go back and automate the manual parts: turn the SSH deploy steps into a script, add a domain (Route 53) and real HTTPS cert (ACM/Let's Encrypt), consider CI/CD (GitHub Actions) to auto-deploy on push.

---

## 8. Things to get right early (mistakes that bite later)

- **Never commit `.tfvars` or `.env` files** with real secrets — `.gitignore` them. Terraform secrets should come from `terraform.tfvars` (gitignored) or better, AWS Secrets Manager referenced by Terraform, not typed directly into `.tf` files.
- **RDS should not be publicly reachable** in the long run — only from the EC2 instance's security group. Only open it to your laptop's IP temporarily, for setup, then remove that rule.
- **`INTERNAL_API_KEY` must match exactly** between `pos/backend` and `admin-dashboard/backend` — this is what lets admin-backend call `pos/backend`'s protected tenant-provisioning/feature-update endpoints. Generate it once, use it in both `.env` files.
- **`license-server`'s SQLite file needs to live on a persistent EBS volume path**, not the instance's ephemeral/temp storage, or you lose all issued licenses on instance replacement.
- **Each backend needs its own `JWT_SECRET`** — they're deliberately separate per the existing code (POS tenant-user tokens vs admin-dashboard staff tokens are not interchangeable).
- **Take an RDS snapshot before any risky change** — this is your real customer data once live.

---

## 9. What NOT to do

- Don't containerize/move to Fargate right now just because it's "more standard" — it adds Docker, ECR, and ECS complexity for zero benefit at your current scale. Revisit later if you need per-service auto-scaling.
- Don't try to write all the Terraform in one sitting before testing anything — build and verify one resource type at a time (§7).
- Don't skip the "get it working manually over SSH first" step — if you can't get the app running by hand on the box, a startup script automating the same steps won't magically work either, and you'll be debugging Terraform and app-deploy problems at the same time.

---

## 10. Reference — how this maps to your existing Railway setup

The repo already has Railway-specific config (`railway.json`, `nixpacks.toml`, and `.env.example` comments mentioning Railway). AWS replaces that platform-managed deploy target with infrastructure you provision yourself — the **application code and env-var contract are unchanged**; only *how the process gets started and how the database is provisioned* changes. Nothing in `apps/` needs to change to move from Railway to AWS.

---

## 11. Current deployment status (as of the first real deploy)

What's actually live right now, on a single EC2 instance (`3.147.252.26`) + one RDS Postgres database:

| Piece | Status | URL |
|---|---|---|
| `pos-backend` | Live (PM2) | proxied via nginx at `/api/*` |
| `admin-backend` | Live (PM2) | proxied via nginx at `:8080/api/*` |
| `license-server` | Live (PM2) | **not** exposed publicly — only reachable from `admin-backend` via `localhost:3001` |
| `apps/pos/frontend` | Live | `http://3.147.252.26` |
| `apps/admin-dashboard/frontend` | Live | `http://3.147.252.26:8080` |
| `apps/website` | Not deployed | out of scope per current decision — no public self-serve signup |
| RDS Postgres | Live | holds real tenant/staff data, not test data |

Access to the EC2 instance is via **AWS Systems Manager (SSM) Session Manager** (`aws ssm start-session --target <instance-id>`), not plain SSH — this was switched to mid-deployment specifically to stop breaking every time the local ISP's dynamic IP changed and the security group's `my_ip` rule went stale. The SSH key pair (`terraform/ec2.tf`'s `aws_key_pair`) and port 22 rule are still in place as a fallback, but SSM is the primary path now.

---

## 12. Checklist before trusting this with real paying customers

The above is a genuine working deployment, but a few things were deliberately deferred to get something running quickly. None of these block internal testing — all of them matter before real customer data/payments flow through it.

- [ ] **HTTPS.** Everything currently runs on plain `http://` — login credentials, session tokens, and all customer data travel unencrypted between browser and server. This is the single biggest real risk right now. Needs a domain name first (Let's Encrypt/ACM can't issue a trusted cert for a bare IP address); once you have one, point it at `3.147.252.26`, add an nginx TLS block (or put an Application Load Balancer + ACM cert in front), and redirect all HTTP to HTTPS.
- [ ] **A real domain name**, replacing the raw IP everywhere (nginx `server_name`, both frontends' API URLs). Needed for HTTPS above, and to stop depending on an IP that AWS could theoretically reassign if the instance were ever replaced (the Elastic IP protects against this today, but a domain is still the right long-term fix).
- [ ] **RDS automated backups** — confirm the actual retention window in the RDS console (Configuration tab → "Backup retention period"); don't assume it matches whatever Terraform's defaults left it at.
- [ ] **`terraform/rds.tf`: `skip_final_snapshot = true`.** Set for easy teardown during initial setup. Flip to `false` (and consider `deletion_protection = true`) before this holds real customer data, so a `terraform destroy` or accidental deletion can't wipe the database with no safety net.
- [ ] **Rotate `terraform.tfvars` secrets** if this repo/laptop was ever shared or the file's history is uncertain — it holds the RDS master password in plaintext (correctly gitignored, but still worth a fresh rotation before go-live as good hygiene).
- [ ] **Decide on `license-server`'s public exposure.** Currently deliberately unreachable from the internet (only `admin-backend` calls it, over `localhost`). Fine as-is unless you want to manage offline licenses directly from a browser — if so, it needs its own nginx location/port and should probably sit behind HTTPS + a strong admin password before that happens.
- [ ] **Cost monitoring.** Nothing here is free-tier-guaranteed forever (RDS `db.t3.micro`/EC2 `t3.small` have free-tier windows that expire). Set a AWS Budget alert so a runaway process or forgotten resource doesn't surprise you on the bill.
- [ ] **`npm audit`** flagged several vulnerabilities across services during install (moderate/high, none investigated in depth here). Worth a proper look before this is customer-facing, even if none turn out to be exploitable in this app's actual usage.
