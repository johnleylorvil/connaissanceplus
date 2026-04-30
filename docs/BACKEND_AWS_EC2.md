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
- `livekit-egress.yaml` (uploaded automatically by the workflow)

The workflow uploads `docker-compose.yml` and `livekit-egress.yaml` into that same directory and rewrites `.deploy.env` on each deploy with the new image tag.

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

For a full Arena live test on EC2, also include:

- `REDIS_HOST=redis`
- `REDIS_PORT=6379`
- `LIVEKIT_API_KEY=...`
- `LIVEKIT_API_SECRET=...`
- `LIVEKIT_URL=wss://live.connaissanceplus.net`
- `ARENA_YOUTUBE_RTMP_URL=rtmp://a.rtmp.youtube.com/live2/<your-stream-key>`

For Google sign-in, also include:

- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `GOOGLE_CALLBACK_URL=https://api.connaissanceplus.net/api/auth/google/callback`

Recommended related values for Arena spectator support:

- `HLS_BASE_URL=https://api.connaissanceplus.net/hls`
- `HLS_OUTPUT_DIR=/output`

Recommended runtime block for `/opt/konesans-backend/.env`:

```env
NODE_ENV=production
PORT=3000
DB_SYNCHRONIZE=false
DB_MIGRATIONS_RUN=false

REDIS_HOST=redis
REDIS_PORT=6379

LIVEKIT_API_KEY=replace-me
LIVEKIT_API_SECRET=replace-me
LIVEKIT_URL=wss://live.connaissanceplus.net
ARENA_YOUTUBE_RTMP_URL=rtmp://a.rtmp.youtube.com/live2/replace-with-your-stream-key

GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
GOOGLE_CALLBACK_URL=https://api.connaissanceplus.net/api/auth/google/callback

HLS_BASE_URL=https://api.connaissanceplus.net/hls
HLS_OUTPUT_DIR=/output
```

## Google Sign-In Setup

To enable Google sign-in in production, configure Google Cloud before enabling the frontend button.

1. Open Google Cloud Console.
2. Create or select a project for Konesans+.
3. Go to `APIs & Services` > `OAuth consent screen`.
4. Configure the app as `External` unless you intentionally restrict login to a Workspace.
5. Fill the app name, support email, and developer contact email.
6. Add the scopes `email`, `profile`, and `openid` if Google asks for them.
7. Add these authorized domains:
   - `connaissanceplus.net`
8. Go to `Credentials` > `Create Credentials` > `OAuth client ID`.
9. Choose `Web application`.
10. Add these Authorized JavaScript origins:
	- `https://connaissanceplus.net`
	- `https://admin.connaissanceplus.net` only if you later expose Google login there
11. Add this Authorized redirect URI:
	- `https://api.connaissanceplus.net/api/auth/google/callback`
12. Save the client and copy the generated Client ID and Client Secret into `/opt/konesans-backend/.env`.

After the backend `.env` is updated:

1. redeploy the backend
2. set the frontend build variable `VITE_ENABLE_GOOGLE_AUTH=true`
3. redeploy the frontend

Expected production flow:

1. user clicks `Se connecter avec Google` or `S'inscrire avec Google`
2. frontend sends the browser to `https://api.connaissanceplus.net/api/auth/google`
3. Google redirects back to `https://api.connaissanceplus.net/api/auth/google/callback`
4. backend creates or links the user and redirects to `/oauth/callback?token=...` on the frontend
5. frontend stores the token and, if needed, sends the student to complete profile

## Arena Live Ports And DNS

For a complete Arena live test in production, the EC2 host also needs the LiveKit ports reachable from the internet.

Recommended setup:

1. create `live.connaissanceplus.net` in Route 53 pointing to the same EC2 public IP
2. open these security group rules to the instance:
	- `TCP 7880` for LiveKit signaling
	- `TCP 7881` for fallback transport
	- `UDP 50100-50200` for WebRTC media
3. if you terminate TLS in front of LiveKit, ensure `LIVEKIT_URL` matches the public `wss://` URL seen by browsers

If you do not expose these ports correctly, the moderator and competitors will fail before the YouTube spectator layer even starts.

## Arena Egress CPU Requirement

LiveKit Egress can start and still log a CPU capability warning. For the public YouTube push path, pay attention to this message in the `livekit-egress` logs.

If you see a log similar to `not enough cpu for some egress types` with `minimumCpu: 4`, interpret it as follows:

1. the container is running
2. Redis connectivity is probably fine
3. but room-composite egress for spectator/public streaming may fail later under load or when starting the YouTube output

Recommended guidance for a reliable Arena public-stream test:

1. use an EC2 instance with at least 4 vCPU available to the Docker host
2. re-check `docker compose ... logs --tail=100 livekit-egress`
3. only then test the public YouTube opening flow from the moderator page

## Arena Live Deploy Verification

After a deploy intended for full Arena testing, verify these services on EC2:

1. `docker compose --env-file .deploy.env -f docker-compose.yml ps`
2. `docker compose --env-file .deploy.env -f docker-compose.yml logs --tail=100 backend`
3. `docker compose --env-file .deploy.env -f docker-compose.yml logs --tail=100 livekit`
4. `docker compose --env-file .deploy.env -f docker-compose.yml logs --tail=100 livekit-egress`

Then validate behavior in this order:

1. moderator can open the Arena private scene
2. two competitors can join the private scene
3. admin can save a public YouTube link for the competition
4. moderator can switch the public stream to `live`
5. spectator page embeds YouTube and still shows score/timer/leaderboard from Konesans+

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