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
- updates the ECS task definition
- deploys the ECS service

## GitHub Secrets To Create

- `AWS_DEPLOY_ROLE_ARN`

This is the IAM role that GitHub Actions will assume through OIDC.

## GitHub Repository Variables To Create

### Shared

- `AWS_REGION`

### Frontend

- `VITE_API_BASE_URL`
- `VITE_PUBLIC_APP_ORIGIN`
- `VITE_ADMIN_APP_ORIGIN`
- `FRONTEND_S3_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`

Recommended production values for this project:

- `VITE_API_BASE_URL=https://api.connaissanceplus.net`
- `VITE_PUBLIC_APP_ORIGIN=https://connaissanceplus.net`
- `VITE_ADMIN_APP_ORIGIN=https://admin.connaissanceplus.net`

### Backend

- `ECR_REPOSITORY`
- `ECS_CLUSTER`
- `ECS_SERVICE`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `DB_HOST`
- `DB_NAME`
- `REDIS_HOST`
- `SPONSOR_UPLOADS_S3_BUCKET`
- `SPONSOR_UPLOADS_PUBLIC_BASE_URL`
- `LIVEKIT_URL`
- `HLS_BASE_URL`
- `LIVEKIT_EGRESS_S3_BUCKET`
- `LIVEKIT_EGRESS_S3_REGION`
- `LIVEKIT_EGRESS_S3_ENDPOINT`
- `LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE`

Recommended production values for this project:

- `FRONTEND_URL=https://connaissanceplus.net`
- `CORS_ORIGINS=https://connaissanceplus.net,https://admin.connaissanceplus.net`
- `SPONSOR_UPLOADS_PUBLIC_BASE_URL=https://assets.connaissanceplus.net`
- `HLS_BASE_URL=https://media.connaissanceplus.net`

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

## Important Practical Rule

Do not split this repo into three GitHub repositories now.

If you do that now, you will have to duplicate frontend logic, duplicate deployment logic, and keep shared changes synchronized across repositories. The current codebase is not structured for that split.