# Arena Live Local Setup

Cette application Arena a besoin de deux couches distinctes pour le live local :

- LiveKit SFU pour la scène temps réel modérateur + compétiteurs.
- LiveKit Egress pour produire le flux HLS consommé par la page spectateur.

## Fichiers à créer

1. Copier [.env.example](../.env.example) vers `.env` à la racine du repo.
2. Copier [backend/.env.example](../backend/.env.example) vers `backend/.env`.

Les variables `LIVEKIT_API_KEY` et `LIVEKIT_API_SECRET` doivent être identiques dans les deux fichiers.

## Valeurs locales minimales

### Racine `.env`

```env
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=konesans_plus
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
```

### `backend/.env`

```env
PORT=3000
JWT_SECRET=change-me-local-jwt-secret
JWT_EXPIRES_IN=7d
ADMIN_SETUP_KEY=change-me-local-admin-setup-key
DB_TYPE=sqlite
DB_SQLITE_PATH=konesans.sqlite
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
HLS_BASE_URL=http://localhost:3000/hls
HLS_OUTPUT_DIR=/output
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Comment obtenir de vraies valeurs locales

### JWT_SECRET

Utiliser une chaîne longue aléatoire, par exemple :

```powershell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

### ADMIN_SETUP_KEY

Utiliser une valeur distincte de `JWT_SECRET`, par exemple :

```powershell
[guid]::NewGuid().ToString('N')
```

### LIVEKIT_API_KEY et LIVEKIT_API_SECRET

Pour du local, LiveKit self-hosted n'impose pas une paire fournie par un tiers. Tu peux générer tes propres valeurs. Le point important est la cohérence :

- `docker-compose.yml` lit les valeurs depuis la racine `.env`
- le backend NestJS lit les valeurs depuis `backend/.env`
- les deux doivent être identiques

Exemple PowerShell :

```powershell
[guid]::NewGuid().ToString('N')
```

Tu peux réutiliser cette commande pour la clé et le secret.

## Démarrage local

1. Lancer Docker Desktop.
2. Depuis la racine du projet, démarrer les services :

```powershell
docker compose up -d postgres redis livekit livekit-egress
```

Important : le service `livekit` doit partager Redis avec `livekit-egress`.
Dans [docker-compose.yml](c:/Users/johnley/Documents/Johnley_space/edu/app_edu/docker-compose.yml), le conteneur LiveKit doit démarrer avec `--redis-host redis:6379`.

3. Vérifier que les services tournent :

```powershell
docker compose ps
```

4. Démarrer le backend :

```powershell
cd backend
npm install
npm run start:dev
```

5. Démarrer le frontend dans un autre terminal :

```powershell
cd frontend
npm install
npm run dev
```

## Vérifications attendues

- Le modérateur ne doit plus voir `Serveur LiveKit inaccessible`.
- Quand tu lances `DIFFUSION HLS`, le bouton ne doit plus renvoyer d'erreur Egress.
- Le flux HLS ne sera réellement généré qu'une fois qu'un modérateur ou compétiteur a rejoint la scène RTC et publie son média.
- Des fichiers `.m3u8` et `.ts` doivent apparaître dans `backend/hls_output/<matchId>/`.
- La page spectateur doit charger `http://localhost:3000/hls/<matchId>/index.m3u8`.

## Dépannage rapide

## Production hybride recommandée

Pour la production, l'architecture la plus simple n'est plus de servir toute la vidéo spectateur en HLS depuis la plateforme.

- La scène privée reste sur LiveKit RTC pour le modérateur et les deux compétiteurs.
- La vidéo publique spectateur peut maintenant être configurée par compétition avec un lien YouTube Live dans l'admin Arena.
- La page spectateur Konesans+ continue d'afficher le score, le round courant, le timer et le classement, mais la vidéo embarquée vient de YouTube.
- Le modérateur peut ouvrir ou fermer la diffusion publique depuis la scène Arena une fois le live YouTube prêt.

En pratique sur AWS :

- garder le backend NestJS sur EC2 comme aujourd'hui
- garder LiveKit pour la scène privée seulement
- utiliser `ARENA_YOUTUBE_RTMP_URL` dans l'environnement backend pour pointer LiveKit Egress vers l'ingest YouTube de la chaîne
- créer l'événement YouTube Live, récupérer l'URL de visionnage, la coller dans l'admin Arena, puis passer le stream public en `live`

### `docker compose` n'est pas reconnu

Installer ou relancer Docker Desktop, puis rouvrir le terminal.

### `Serveur LiveKit inaccessible`

- vérifier que le conteneur `konesans_livekit` tourne
- vérifier `LIVEKIT_URL=ws://localhost:7880` dans `backend/.env`

### `Diffusion HLS indisponible`

- vérifier que le conteneur `konesans_egress` tourne
- vérifier que `konesans_egress` et `konesans_livekit` partagent bien le même réseau Docker
- vérifier que `konesans_livekit` démarre avec `--redis-host redis:6379`
- vérifier que `backend/.env` contient `HLS_OUTPUT_DIR=/output`
- vérifier que `backend/hls_output` reçoit bien les segments
- si `broadcast/start` répond mais que le playlist reste `404`, vérifier qu'un participant RTC est réellement connecté à la room et publie caméra ou micro