# Konesans+

Plateforme de concours et quiz en ligne pour l'excellence académique en Haïti.

## Prérequis

- Node.js (v18+)
- Docker & Docker Compose
- npm ou yarn

## Installation

### 1. Base de données
Lancer PostgreSQL via Docker :
```bash
docker-compose up -d
```

### 2. Backend (NestJS)
```bash
# Initialiser le backend (si pas encore fait)
# npx @nestjs/cli new backend --package-manager npm
cd backend
npm install
npm run start:dev
```

### 3. Frontend (React + Vite)
```bash
# Initialiser le frontend (si pas encore fait)
# npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm run dev
```

## Structure
- `backend/` : API NestJS
- `frontend/` : Application React
- `docs/` : Documentation (Use Cases, Architecture)
- `.github/` : Instructions Copilot & CI/CD

## Arena Live en local

Pour la scène RTC + la diffusion spectateur HLS, suivre [docs/ARENA_LOCAL_LIVE.md](docs/ARENA_LOCAL_LIVE.md).

## MVP actuel (déjà codé)

- Création de niveaux et matières
- Inscription étudiant
- Ajout de questions QCM
- Génération de quiz aléatoire
- Soumission et scoring
- Leaderboard hebdomadaire (Top 10)
- Authentification JWT (admin + étudiant)
- Protection des routes par rôles

## Démarrage rapide MVP

1. Démarrer PostgreSQL :
```bash
docker-compose up -d
```

2. Démarrer le backend :
```bash
cd backend
npm run start:dev
```

3. Démarrer le frontend (autre terminal) :
```bash
cd frontend
npm run dev
```

4. Ouvrir l'application :
- Frontend : `http://localhost:5173`
- API : `http://localhost:3000/api`

## Flux réel (auth)

1. `Bootstrap admin` une seule fois avec la `setup key`
2. Login admin
3. Créer niveau, matière et questions
4. Inscrire un étudiant (ou login étudiant)
5. Démarrer quiz et soumettre
6. Vérifier le leaderboard

Variables dans `backend/.env` :
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ADMIN_SETUP_KEY`

## Duel Oral Live — AWS Chime SDK

Le mode **Duel Oral Live** utilise **Amazon Chime SDK Meetings** (WebRTC managé) pour la salle audio 1v1 + modérateur. Le backend génère des credentials — le frontend ne reçoit jamais de secrets AWS directs.

### Variables d'environnement AWS (backend)

Ajouter dans `backend/.env` :

```env
# AWS region where the Chime service is called
AWS_REGION=us-east-1

# Chime media region (can differ from AWS_REGION; us-east-1 or eu-central-1 recommended)
CHIME_MEDIA_REGION=us-east-1

# Static credentials (dev / CI only — prefer IAM role in production)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# In production: leave AWS_ACCESS_KEY_ID/SECRET unset and attach an IAM role to your server.
# The SDK will pick up the role credentials automatically.
```

### Permissions IAM minimales

```json
{
  "Effect": "Allow",
  "Action": [
    "chime:CreateMeeting",
    "chime:CreateAttendee",
    "chime:DeleteMeeting"
  ],
  "Resource": "*"
}
```

### Développement local avec AWS CLI profile

Si vous avez configuré `~/.aws/credentials` avec un profile, exportez-le avant de lancer le serveur :

```bash
export AWS_PROFILE=konesans-dev
npm run start:dev
```

### Flux rapide de test manuel

```
1. Admin POST /api/duels/oral  (créer un duel ORAL_LIVE avec playerOneId + playerTwoId)
2. Admin/Modérateur POST /api/duels/:id/oral/start
3. Compétiteur A ouvre /duel/:id → bouton "Rejoindre l'audio"
4. Compétiteur B idem
5. Modérateur attribue des points via PATCH /api/duels/:id/oral/score
6. Score s'actualise en temps réel via Socket.io /duels
7. Modérateur PATCH /api/duels/:id/oral/end → résultat persisté
```
