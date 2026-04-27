# Backend AWS ECS Deployment

This backend is prepared to run on AWS ECS Fargate behind an Application Load Balancer.

Related deployment artifacts:

- ECS task template: `deploy/aws/backend-ecs-task-definition.template.json`
- Secrets inventory: `docs/BACKEND_AWS_SECRETS.md`

## Container

- Docker build context: `backend/`
- Dockerfile: `backend/Dockerfile`
- Container port: `3000`
- Health endpoint: `/health`
- Start command: `node dist/main`

## Required AWS Resources

- ECR repository for the backend image
- ECS cluster and service
- Application Load Balancer
- Secrets Manager or ECS secrets injection
- ElastiCache Redis
- S3 bucket for sponsor uploads
- S3 bucket for HLS media output

## Required Environment Variables

### Core runtime

- `NODE_ENV=production`
- `PORT=3000`
- `FRONTEND_URL=https://app.example.com`
- `CORS_ORIGINS=https://app.example.com,https://admin.example.com`

### Auth

- `JWT_SECRET`
- `JWT_EXPIRES_IN=7d`
- `ADMIN_SETUP_KEY`

### Supabase Postgres

- `DB_TYPE=postgres`
- `DB_HOST`
- `DB_PORT`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SSL=true`
- `DB_SSL_REJECT_UNAUTHORIZED=false`
- `DB_SYNCHRONIZE=false`
- `DB_MIGRATIONS_RUN=true`

For ECS on IPv4-only egress, prefer the Supabase session pooler connection details instead of the direct database host. Use the exact host, port, database, and username shown by Supabase for the session pooler.

If the target Postgres database is empty and you do not yet have an initial create-schema migration, do a one-time bootstrap with `DB_SYNCHRONIZE=true` and `DB_MIGRATIONS_RUN=false`. After the schema exists, switch back to `DB_SYNCHRONIZE=false`.

### Redis

- `REDIS_HOST`
- `REDIS_PORT=6379`

If Redis is not deployed yet, omit `REDIS_HOST` from ECS instead of setting it to an empty string so the backend keeps its local fallback.

### Sponsor uploads

- `AWS_REGION`
- `SPONSOR_UPLOADS_S3_BUCKET`
- `SPONSOR_UPLOADS_PUBLIC_BASE_URL`

### LiveKit arena

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `HLS_BASE_URL`
- `HLS_OUTPUT_DIR=/output`
- `LIVEKIT_EGRESS_S3_BUCKET`
- `LIVEKIT_EGRESS_S3_REGION`
- `LIVEKIT_EGRESS_S3_ACCESS_KEY`
- `LIVEKIT_EGRESS_S3_SECRET_KEY`
- `LIVEKIT_EGRESS_S3_ENDPOINT` (optional)
- `LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE=false`

If LiveKit or HLS egress is not ready yet, omit `LIVEKIT_URL`, `HLS_BASE_URL`, and any unused `LIVEKIT_EGRESS_S3_*` values instead of injecting empty strings.

### Google OAuth

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### AWS Chime SDK

- `CHIME_MEDIA_REGION`

## ECS Notes

- Start with a single ECS task.
- Keep the load balancer health check on `/health`.
- Expose only the load balancer publicly.
- Keep Redis private in the VPC.
- Keep Supabase credentials in Secrets Manager.

## IAM Permissions

The ECS task role should have access to:

- S3 read/write for sponsor uploads bucket
- S3 read/write for HLS media bucket
- Chime meeting actions used by the duel backend
- Secrets Manager read access for injected secrets
- CloudWatch Logs write access

## Build And Push

Build locally from the backend directory, then push to ECR.

1. Build the image.
2. Tag it with your ECR repository URI.
3. Push it to ECR.

## First Deployment Checklist

- Confirm `/health` returns 200 through the ALB.
- Confirm the backend can connect to Supabase.
- Confirm sponsor upload writes to S3.
- Confirm Redis resolves from ECS.
- Confirm Google OAuth redirect URLs use production domains.
- Confirm only one backend task is running initially.