# GitHub To AWS Pipeline

This project should use one GitHub repository, not three.

Why:

- `frontend/` already contains both the public portal and the admin portal.
- The admin/public split is hostname-based, not repo-based.
- `backend/` is already isolated and deploys independently through its own workflow.

## Recommended Repo Model

- One private GitHub repository for the whole monorepo
- One backend deployment workflow
- One frontend deployment workflow

## What Happens After GitHub Is Connected

### Frontend workflow

The workflow in `.github/workflows/deploy-frontend.yml`:

- runs when files inside `frontend/` change on `main`
- builds the Vite app
- uploads the built files to S3
- invalidates CloudFront

This deploys the same frontend build for both:

- `connaissanceplus.net`
- `admin.connaissanceplus.net`

The app decides which portal to show from the hostname.

### Backend workflow

The workflow in `.github/workflows/deploy-backend.yml`:

- runs when files inside `backend/` change on `main`
- builds the backend Docker image
- pushes the image to ECR
- uploads the production Docker Compose file to the EC2 host
- connects to the EC2 host through SSH
- logs Docker into ECR from the EC2 host
- pulls the new image and restarts the backend container with Docker Compose

## GitHub Secrets To Create

- `AWS_DEPLOY_ROLE_ARN`
- `EC2_HOST`
- `EC2_SSH_USER`
- `EC2_SSH_PRIVATE_KEY`

`AWS_DEPLOY_ROLE_ARN` is the IAM role that GitHub Actions will assume through OIDC.

`EC2_SSH_PRIVATE_KEY` should be the private key matching the public key trusted by the production EC2 instance.

## GitHub Repository Variables To Create

### Shared

- `AWS_REGION`

### Frontend

- `VITE_API_BASE_URL`
- `VITE_ENABLE_GOOGLE_AUTH`
- `VITE_PUBLIC_APP_ORIGIN`
- `VITE_ADMIN_APP_ORIGIN`
- `FRONTEND_S3_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`

Recommended production values for this project:

- `VITE_API_BASE_URL=https://api.connaissanceplus.net`
- `VITE_ENABLE_GOOGLE_AUTH=false`
- `VITE_PUBLIC_APP_ORIGIN=https://connaissanceplus.net`
- `VITE_ADMIN_APP_ORIGIN=https://admin.connaissanceplus.net`

Keep `VITE_ENABLE_GOOGLE_AUTH=false` until the backend has valid `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets in production. Once Google OAuth is configured end to end, switch it to `true` and redeploy the frontend.

### Backend

- `ECR_REPOSITORY`
- `EC2_DEPLOY_DIR`

Recommended production values for this project:

- `EC2_DEPLOY_DIR=/opt/konesans-backend`

The backend runtime variables are no longer injected by GitHub Actions. Keep the production backend `.env` file directly on the EC2 host inside `EC2_DEPLOY_DIR`, for example `/opt/konesans-backend/.env`.

The production EC2 host must already have:

- Docker installed
- Docker Compose installed
- AWS CLI installed
- an IAM role or other AWS credentials that allow `ecr:GetAuthorizationToken` and image pull access to the backend ECR repository
- the backend runtime `.env` file at `/opt/konesans-backend/.env`
- Caddy or Nginx already proxying `api.connaissanceplus.net` to `127.0.0.1:3000`

## Local Git Setup

If this local folder is not yet connected to GitHub:

1. Initialize Git in the project root.
2. Add your GitHub repository as `origin`.
3. Add files and create the first commit.
4. Push `main` to GitHub.

## Deployment Order

1. Connect the local folder to GitHub.
2. Push the repo for the first time.
3. Create GitHub Actions secrets and variables.
4. Create AWS resources used by the workflows.
5. Push backend changes to deploy the API.
6. Push frontend changes to deploy the website.

For the EC2 backend path, the first deployment is still manual: prepare the EC2 instance, create `/opt/konesans-backend/.env`, and confirm Docker Compose can start the backend once. After that, pushes to `main` can reuse the GitHub Actions workflow for updates.

## Important Practical Rule

Do not split this repo into three GitHub repositories now.

If you do that now, you will have to duplicate frontend logic, duplicate deployment logic, and keep shared changes synchronized across repositories. The current codebase is not structured for that split.