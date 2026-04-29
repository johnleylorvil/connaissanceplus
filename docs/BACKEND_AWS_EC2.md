# Backend AWS EC2 Deployment

This is the current production deployment path for the backend.

Related files:

- GitHub Actions workflow: `.github/workflows/deploy-backend.yml`
- EC2 Docker Compose file: `deploy/ec2/docker-compose.yml`

## Deployment Model

1. GitHub Actions builds the backend Docker image from `backend/`.
2. GitHub Actions pushes the image to ECR.
3. GitHub Actions connects to the production EC2 host through SSH.
4. The EC2 host logs Docker into ECR, pulls the new image, and restarts the backend with Docker Compose.

## One-Time EC2 Setup

The production EC2 host must already have:

- Docker installed and running
- Docker Compose installed
- AWS CLI installed
- an IAM role with ECR pull access
- a reverse proxy already configured for `api.connaissanceplus.net`
- a deployment directory, usually `/opt/konesans-backend`

Inside `/opt/konesans-backend`, create:

- `.env` for backend runtime variables and secrets
- `uploads/`
- `hls_output/`

The workflow uploads `docker-compose.yml` into that same directory and rewrites `.deploy.env` on each deploy with the new image tag.

## GitHub Secrets

- `AWS_DEPLOY_ROLE_ARN`
- `EC2_HOST`
- `EC2_SSH_USER`
- `EC2_SSH_PRIVATE_KEY`

## GitHub Variables

- `AWS_REGION`
- `ECR_REPOSITORY`
- `EC2_DEPLOY_DIR`

Recommended production value:

- `EC2_DEPLOY_DIR=/opt/konesans-backend`

## Runtime Environment Source Of Truth

Backend runtime configuration is no longer injected by GitHub Actions.

The source of truth is the production `.env` file on the EC2 host:

- `/opt/konesans-backend/.env`

That file should include the same production values already validated during the manual EC2 cutover, including:

- `NODE_ENV=production`
- `PORT=3000`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- Supabase database settings
- JWT and admin secrets
- SMTP settings
- optional Redis, S3, LiveKit, and Google OAuth settings when those features are enabled

Keep:

- `DB_SYNCHRONIZE=false`
- `DB_MIGRATIONS_RUN=false`

unless you are intentionally doing a one-time schema bootstrap.

## Manual Verification After A Deploy

Run these checks after the workflow finishes:

1. `https://api.connaissanceplus.net/health`
2. frontend login
3. one protected backend route
4. `docker compose --env-file .deploy.env -f docker-compose.yml ps` on the EC2 host

## Rollback

If a deploy fails after the new image is pulled:

1. SSH into the EC2 host
2. set `BACKEND_IMAGE` in `.deploy.env` back to the previous ECR image tag
3. run `docker compose --env-file .deploy.env -f docker-compose.yml up -d`