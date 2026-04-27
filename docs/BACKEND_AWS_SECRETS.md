# Backend AWS Secrets And Variables

This file lists the exact values to inject into the ECS backend task.

## Plain Environment Variables

These can go in the ECS task definition `environment` section.

```env
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://connaissanceplus.net
CORS_ORIGINS=https://connaissanceplus.net,https://admin.connaissanceplus.net

JWT_EXPIRES_IN=7d

DB_TYPE=postgres
DB_HOST=db.your-supabase-host.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_SYNCHRONIZE=false
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
DB_MIGRATIONS_RUN=true

REDIS_HOST=your-elasticache-endpoint
REDIS_PORT=6379

AWS_REGION=us-east-1
CHIME_MEDIA_REGION=us-east-1

SPONSOR_UPLOADS_S3_BUCKET=konesans-assets-prod
SPONSOR_UPLOADS_PUBLIC_BASE_URL=https://assets.connaissanceplus.net

LIVEKIT_URL=wss://live.connaissanceplus.net
HLS_BASE_URL=https://media.connaissanceplus.net
HLS_OUTPUT_DIR=/output
LIVEKIT_EGRESS_S3_BUCKET=konesans-media-prod
LIVEKIT_EGRESS_S3_REGION=us-east-1
LIVEKIT_EGRESS_S3_ENDPOINT=
LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE=false
```

If Redis or LiveKit is not ready for the first deployment, leave the related GitHub variable unset and omit the ECS environment entry entirely. Do not inject empty strings for `REDIS_HOST`, `LIVEKIT_URL`, `HLS_BASE_URL`, or unused `LIVEKIT_EGRESS_S3_*` values.

If the backend runs on ECS without IPv6 egress, use the Supabase session pooler connection settings here rather than the direct connection values.

For a first deployment into an empty Supabase database, temporarily set `DB_SYNCHRONIZE=true` and `DB_MIGRATIONS_RUN=false` so TypeORM can create the schema. Once the schema exists, turn `DB_SYNCHRONIZE` back to `false`.

## Secret Environment Variables

These should go in ECS `secrets`, backed by AWS Secrets Manager or SSM Parameter Store.

When the ECS task definition references a secret with a bare `valueFrom` ARN, store that secret as a plain text value in Secrets Manager. Do not store `DB_USERNAME` or `DB_PASSWORD` as JSON key/value secrets unless you also update the ARN to target a specific JSON key.

### Minimum secrets for the first backend deployment

Create these first. They are the minimum set needed for the backend task definition we are using now.

```env
JWT_SECRET
ADMIN_SETUP_KEY
DB_USERNAME
DB_PASSWORD
```

### Optional secrets to add after the first deployment

Add these later when you are ready to enable the related features.

```env
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

LIVEKIT_API_KEY
LIVEKIT_API_SECRET

LIVEKIT_EGRESS_S3_ACCESS_KEY
LIVEKIT_EGRESS_S3_SECRET_KEY
```

```env
JWT_SECRET
ADMIN_SETUP_KEY

DB_USERNAME
DB_PASSWORD
```

## Recommended Secrets Manager Names

Use one path family so the service stays readable.

```text
/konesans/backend/JWT_SECRET
/konesans/backend/ADMIN_SETUP_KEY
/konesans/backend/DB_USERNAME
/konesans/backend/DB_PASSWORD
/konesans/backend/GOOGLE_CLIENT_ID
/konesans/backend/GOOGLE_CLIENT_SECRET
/konesans/backend/LIVEKIT_API_KEY
/konesans/backend/LIVEKIT_API_SECRET
/konesans/backend/LIVEKIT_EGRESS_S3_ACCESS_KEY
/konesans/backend/LIVEKIT_EGRESS_S3_SECRET_KEY
```

## IAM Expectations

The ECS task role should have:

- `secretsmanager:GetSecretValue` for the backend secrets
- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on the sponsor bucket if the app needs object cleanup later
- `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on the HLS media bucket
- Chime permissions already documented in the repo README for oral duel features
- CloudWatch Logs write permissions

## Deployment Notes

- Start with one ECS task only.
- Point the ALB health check to `/health`.
- Keep Redis private inside the VPC.
- Use the production frontend domains in `FRONTEND_URL` and `CORS_ORIGINS`.
- The backend can run without Redis, but arena viewer counts degrade when Redis is unavailable.
- ACM DNS validation stays pending until the registrar nameservers fully delegate `connaissanceplus.net` to Route 53.