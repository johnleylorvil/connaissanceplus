# Analyse complète du projet Konesans+

## 1. Vue d'ensemble

Konesans+ est une plateforme éducative orientée concours, quiz et excellence académique en Haïti. Le projet couvre plusieurs parcours: inscription et authentification des élèves, gestion admin des niveaux, matières et questions, quiz QCM, duels entre élèves, Arena live avec modération et diffusion, correspondance entre élèves, notifications et sponsors.

Le dépôt est organisé comme un monorepo simple:

- `frontend/`: application web React.
- `backend/`: API NestJS, persistance TypeORM, WebSockets et intégrations média.
- `docs/`: documentation projet et guides de déploiement/test.
- `deploy/`: artefacts de déploiement AWS/EC2.
- `docker-compose.yml`: services locaux PostgreSQL, Redis, LiveKit et LiveKit Egress.

Le README racine décrit le produit Konesans+ et le démarrage local. En revanche, `backend/README.md` et `frontend/README.md` contiennent encore beaucoup de texte issu des starters NestJS/Vite; ils ne reflètent donc pas entièrement l'état réel de l'application.

## 2. Frontend

### Stack technique

Le frontend se trouve dans `frontend/`. Il s'agit d'une application Vite + React 19 + TypeScript, avec:

- `react-router-dom` pour le routage.
- Tailwind CSS via `tailwindcss` et `@tailwindcss/vite`.
- `socket.io-client` pour les mises à jour temps réel.
- `hls.js` pour la lecture des flux HLS spectateur.
- `livekit-client` pour la scène RTC Arena.
- `amazon-chime-sdk-js` pour l'audio des duels oraux.

Les scripts principaux sont:

- `npm run dev` ou `npm start`: serveur Vite.
- `npm run build`: compilation TypeScript puis build Vite.
- `npm run lint`: ESLint.
- `npm run preview`: prévisualisation du build.

### Points d'entrée

- `frontend/src/main.tsx`: initialise React, `BrowserRouter` et le provider d'authentification.
- `frontend/src/App.tsx`: déclare les routes publiques et protégées, ainsi que la logique de garde par rôle.
- `frontend/src/api/client.ts`: centralise l'origine API, le préfixe `/api`, l'URL Socket.IO, Google OAuth et la fonction `apiCall`.

### Routage principal

Routes publiques:

- `/`: landing page publique, ou redirection login en mode portail admin.
- `/login`: connexion.
- `/register`: inscription élève.
- `/classement`: leaderboard public.
- `/privacy`: politique de confidentialité.
- `/terms`: conditions d'utilisation.
- `/oauth/callback`: retour OAuth Google.
- `/arena/spectator`: page spectateur Arena.
- `/arena/spectator/:id`: page spectateur pour une compétition.
- `/arena/watch/:id`: page publique de visionnage Arena.

Routes protégées étudiant:

- `/complete-profile`: complétion du profil étudiant.
- `/dashboard`: tableau de bord étudiant.
- `/quiz/:sessionId`: session de quiz.
- `/duel/:duelId`: duel, accessible aussi aux admins/modérateurs selon le rôle.

Routes partagées authentifiées:

- `/arena`: espace Arena.
- `/arena/live/:id`: page live Arena.

Routes admin/modérateur:

- `/admin`: tableau de bord admin.
- `/moderator`: redirection vers `/moderator/arena`.
- `/moderator/arena`: espace modération Arena, accessible aux admins et modérateurs.

### Authentification côté frontend

L'authentification est stockée dans `localStorage` sous la clé `konesans_auth`. Le composant `RequireRole` dans `frontend/src/App.tsx` gère:

- l'attente de restauration de session;
- la redirection vers `/login` si l'utilisateur n'est pas connecté;
- la complétion obligatoire du profil étudiant;
- le contrôle de rôle (`student`, `admin`, `moderator`);
- la redirection entre portail public et portail admin.

Les appels API utilisent un JWT envoyé dans l'en-tête:

```http
Authorization: Bearer <token>
```

### Clients API principaux

- `frontend/src/api/client.ts`: client générique pour `/api`.
- `frontend/src/arena/arenaApi.ts`: client Arena et admin Arena.
- `frontend/src/correspondence/correspondenceApi.ts`: client correspondance.
- Plusieurs pages admin appellent aussi directement certains endpoints Arena via `fetch`.

## 3. Backend

### Stack technique

Le backend se trouve dans `backend/`. Il s'agit d'une API NestJS 11 avec:

- TypeORM pour la persistance.
- `class-validator` et `class-transformer` pour la validation DTO.
- Passport/JWT pour l'authentification.
- Passport Google OAuth 2.0 pour l'auth Google.
- Socket.IO via `@nestjs/websockets` et `@nestjs/platform-socket.io`.
- Nodemailer pour les OTP email.
- AWS SDK Chime pour les duels oraux.
- AWS SDK S3 pour certains uploads optionnels.
- LiveKit SDK pour les tokens RTC et la diffusion Arena.
- Redis via `ioredis` pour le compteur de viewers Arena.

### Points d'entrée

- `backend/src/main.ts`: bootstrap Nest, CORS, `ValidationPipe` global, service statique `/uploads`.
- `backend/src/app.module.ts`: module racine, configuration, TypeORM, modules fonctionnels et fichiers statiques `/hls` et `/uploads`.
- `backend/src/database/typeorm.config.ts`: résolution de la configuration SQLite/PostgreSQL.
- `backend/src/database/entities.ts`: liste centralisée des entités TypeORM.

### Modules backend

`MvpModule`

- Authentification JWT et Google.
- Bootstrap du premier admin.
- Gestion des élèves, admins et modérateurs.
- Niveaux/classes, matières, questions.
- Quiz QCM et historique.
- Matchmaking de duels QCM.
- Duels oraux live avec AWS Chime.
- Notifications et broadcasts admin.

`ArenaModule`

- Création et gestion des compétitions Arena.
- Inscriptions, validation des participants, lancement de match.
- Rounds, scoring, pause/reprise, disqualification.
- Gestion des modérateurs.
- Live state, leaderboard, historique.
- Tokens LiveKit RTC.
- Diffusion HLS/YouTube et compteur de viewers.

`SponsorsModule`

- Liste publique des sponsors actifs.
- CRUD admin des sponsors.
- Upload de logos vers S3 si configuré, sinon disque local sous `/uploads`.

`CorrespondenceModule`

- Sessions de correspondance.
- Lettres brouillon/soumises.
- Assignations de lettres entre élèves.
- Threads et messages anonymisés.
- Votes optionnels.
- Signalements et modération admin.
- Fonction protégée par `FEATURE_CORRESPONDENCE_CONTEST=true`.

### Sécurité backend

Le backend utilise:

- `JwtAuthGuard` pour authentifier les requêtes JWT.
- `RolesGuard` avec le décorateur `@Roles(...)` pour les accès par rôle.
- Rôles applicatifs: `student`, `admin`, `moderator`.
- `ValidationPipe` global avec `whitelist`, `forbidNonWhitelisted` et `transform`.
- CORS configurable par `CORS_ORIGINS` ou `FRONTEND_URL`.

### Assets statiques

- `/uploads`: fichiers uploadés localement, notamment logos sponsors.
- `/hls`: segments HLS générés par LiveKit Egress dans `backend/hls_output`.

## 4. Architecture

### Flux général

Le frontend appelle le backend via HTTP REST sous le préfixe `/api`. L'origine API est dérivée de `VITE_API_BASE_URL` ou `VITE_API_BASE`, avec fallback local `http://localhost:3000`.

Les utilisateurs s'authentifient par login email/mot de passe ou Google OAuth. Le backend émet un JWT; le frontend le stocke localement et l'envoie sur les requêtes protégées.

La persistance est gérée par TypeORM. En local léger, SQLite est utilisé par défaut si `DB_TYPE` n'est pas défini. Pour PostgreSQL, le projet utilise les migrations et peut démarrer une base via Docker Compose.

### Temps réel

Le backend expose deux namespaces Socket.IO principaux:

- `/duels`
  - `duel:join`
  - `duel:leave`

- `/arena`
  - `arena:join`
  - `arena:participant-answer`

Ces sockets servent à synchroniser l'état des duels et des compétitions Arena: progression, score, round courant, événements admin/modérateur et mises à jour live.

### Média et diffusion

Le projet combine plusieurs technologies média:

- AWS Chime SDK Meetings: audio WebRTC pour les duels oraux.
- LiveKit: scène RTC Arena pour participants et modérateurs.
- LiveKit Egress: génération HLS pour les spectateurs.
- HLS: lecture publique côté frontend via `hls.js`.
- YouTube public stream: option de diffusion externe configurée sur les compétitions Arena.

### Services externes locaux

`docker-compose.yml` définit:

- `postgres`: PostgreSQL 15, base `konesans_plus` par défaut.
- `redis`: Redis 7 pour LiveKit et le compteur viewers.
- `livekit`: serveur LiveKit en mode dev.
- `livekit-egress`: génération HLS vers `backend/hls_output`.

### Configuration importante

Variables et fichiers notables:

- `.env`: configuration locale.
- `.env.example`: exemple minimal.
- `backend/src/database/typeorm.config.ts`: configuration DB.
- `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SQLITE_PATH`, `DB_SYNCHRONIZE`, `DB_MIGRATIONS_RUN`.
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_SETUP_KEY`.
- `FRONTEND_URL`, `CORS_ORIGINS`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS`.
- `AWS_REGION`, `CHIME_MEDIA_REGION`.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_EGRESS_S3_*`.
- `REDIS_HOST`, `REDIS_PORT`.
- `SPONSOR_UPLOADS_S3_BUCKET`, `SPONSOR_UPLOADS_PUBLIC_BASE_URL`.
- `FEATURE_CORRESPONDENCE_CONTEST`.
- `ARENA_MODE`, avec un comportement spécial pour `oral_v1`.

## 5. Routes API principales

### Base

- `GET /`: message applicatif.
- `GET /health`: endpoint de santé.

### Authentification et profil

- `POST /api/auth/bootstrap-admin`: crée le premier admin avec `ADMIN_SETUP_KEY`.
- `POST /api/auth/login`: login email/mot de passe.
- `GET /api/auth/google`: démarre OAuth Google.
- `GET /api/auth/google/callback`: callback OAuth, redirige vers le frontend avec token.
- `GET /api/auth/me`: profil courant.
- `PATCH /api/auth/profile`: mise à jour du profil.

### Notifications

- `GET /api/notifications`: notifications de l'utilisateur courant.
- `PATCH /api/notifications/:id/read`: marque une notification comme lue.
- `PATCH /api/notifications/read-all`: marque toutes les notifications comme lues.
- `DELETE /api/notifications/:id`: supprime une notification.

### Admin MVP

- `GET /api/admin/stats`: statistiques admin.
- `GET /api/admin/students`: liste des élèves.
- `POST /api/admin/broadcast`: envoi de notification broadcast.
- `GET /api/admin/broadcasts`: historique des broadcasts.
- `GET /api/admin/moderators`: liste des modérateurs.
- `POST /api/admin/moderators`: demande de création modérateur par OTP.
- `POST /api/admin/moderators/verify-otp`: vérifie l'OTP modérateur.
- `POST /api/admin/moderators/resend-otp`: renvoie l'OTP modérateur.

### Inscription étudiants

- `POST /api/students/register`: alias du flux de demande OTP étudiant.
- `POST /api/students/register/request-otp`: demande un OTP d'inscription.
- `POST /api/students/register/verify-otp`: vérifie l'OTP et crée le compte.
- `POST /api/students/register/resend-otp`: renvoie l'OTP.

### Académique et quiz

- `POST /api/classes` et `POST /api/levels`: création de niveau/classe, admin.
- `GET /api/classes` et `GET /api/levels`: liste des niveaux/classes.
- `POST /api/subjects`: création de matière, admin.
- `GET /api/subjects`: liste des matières, filtrable par `classId` ou `levelId`.
- `POST /api/questions`: création de question, admin.
- `GET /api/questions`: liste des questions, filtrable par classe et matière.
- `POST /api/quizzes/start`: démarre un quiz étudiant.
- `POST /api/quizzes/:sessionId/submit`: soumet les réponses du quiz.
- `GET /api/quizzes/history`: historique quiz de l'étudiant.
- `GET /api/leaderboard/weekly`: classement hebdomadaire public.

### Duels

- `POST /api/duels/matchmaking/join`: rejoint le matchmaking étudiant.
- `DELETE /api/duels/matchmaking/cancel`: annule l'attente matchmaking.
- `GET /api/duels/:duelId/state`: état d'un duel.
- `POST /api/duels/:duelId/answer`: réponse QCM dans un duel.
- `POST /api/duels/oral`: crée un duel oral, admin/modérateur.
- `POST /api/duels/:duelId/oral/start`: démarre le live oral.
- `POST /api/duels/:duelId/oral/join`: rejoint l'audio Chime.
- `PATCH /api/duels/:duelId/oral/score`: attribue des points.
- `PATCH /api/duels/:duelId/oral/end`: termine le duel oral.
- `GET /api/duels/:duelId/oral/state`: état public/protégé du duel oral.

### Arena

Compétitions:

- `POST /api/arena/competitions`: crée une compétition, admin.
- `GET /api/arena/competitions`: liste les compétitions, filtrable par statut.
- `GET /api/arena/competitions/:id`: détail d'une compétition.
- `PATCH /api/arena/competitions/:id/open`: ouvre les inscriptions.
- `POST /api/arena/competitions/register`: inscrit un étudiant.
- `PATCH /api/arena/competitions/registrations/review`: approuve ou rejette une inscription.
- `GET /api/arena/competitions/:id/registrations`: liste les inscriptions.

Live et scoring:

- `POST /api/arena/competitions/:id/launch`: lance une compétition.
- `POST /api/arena/competitions/:id/next-round`: démarre le round suivant.
- `PATCH /api/arena/rounds/:roundId/end`: termine un round.
- `PATCH /api/arena/rounds/:roundId/score`: score un round.
- `PATCH /api/arena/competitions/:id/complete`: clôture la compétition et définit le gagnant.
- `PATCH /api/arena/competitions/:id/pause`: met en pause.
- `PATCH /api/arena/competitions/:id/resume`: reprend.
- `PATCH /api/arena/competitions/:id/participants/:participantUserId/disqualify`: disqualifie un participant.
- `PATCH /api/arena/competitions/:id/adjust-score`: ajuste manuellement un score.

Etat public et historique:

- `GET /api/arena/competitions/:id/state`: état live public.
- `GET /api/arena/competitions/:id/leaderboard`: leaderboard live.
- `GET /api/arena/history`: historique public.
- `GET /api/arena/history/my`: historique personnel.
- `GET /api/arena/questions/:questionId`: accès question Arena, désactivé en `oral_v1`.
- `GET /api/arena/competitions/:id/chat/:participantId`: historique chat, désactivé en `oral_v1`.

Modération:

- `GET /api/arena/competitions/:id/admin-state`: état admin/modérateur.
- `GET /api/arena/moderatable`: compétitions modérables.
- `POST /api/arena/competitions/:id/claim-moderator`: revendique la modération.
- `POST /api/arena/competitions/:id/assign-moderator`: assigne un modérateur.
- `POST /api/arena/competitions/:id/release-moderator`: libère le modérateur.
- `GET /api/arena/admins`: liste des admins.
- `GET /api/arena/moderators`: liste des modérateurs.
- `GET /api/arena/moderator/my-matches`: matchs assignés au modérateur courant.
- `DELETE /api/arena/chat/messages/:messageId`: supprime un message chat.

RTC et broadcast:

- `POST /api/arena/competitions/:id/rtc-token`: token LiveKit pour compétiteur ou modérateur.
- `POST /api/arena/competitions/:id/broadcast/start`: démarre l'Egress HLS.
- `POST /api/arena/competitions/:id/broadcast/stop`: stoppe l'Egress HLS.
- `GET /api/arena/competitions/:id/broadcast`: état de diffusion public.
- `GET /api/arena/competitions/:id/public-stream`: configuration stream public.
- `PATCH /api/arena/competitions/:id/public-stream`: configure YouTube/stream public.
- `PATCH /api/arena/competitions/:id/public-stream/status`: met à jour le statut du stream.

Viewers:

- `POST /api/arena/competitions/:id/viewers/join`: crée un viewer anonyme.
- `POST /api/arena/competitions/:id/viewers/ping`: maintient le viewer actif.
- `GET /api/arena/competitions/:id/viewers/count`: compteur viewers actif.

### Correspondance

Routes utilisateur sous `/api/correspondence`:

- `GET /api/correspondence/sessions`: sessions ouvertes/publiées.
- `GET /api/correspondence/sessions/:id`: détail d'une session.
- `POST /api/correspondence/sessions/:id/letters`: crée une lettre brouillon.
- `PATCH /api/correspondence/letters/:id`: modifie une lettre brouillon.
- `POST /api/correspondence/letters/:id/submit`: soumet une lettre.
- `GET /api/correspondence/me/letters`: lettres de l'utilisateur.
- `GET /api/correspondence/me/inbox`: assignations reçues.
- `POST /api/correspondence/assignments/:id/open`: ouvre une assignation.
- `GET /api/correspondence/threads/:id`: détail d'un thread.
- `POST /api/correspondence/threads/:id/messages`: envoie un message.
- `POST /api/correspondence/sessions/:id/votes`: vote pour une lettre.
- `GET /api/correspondence/sessions/:id/results`: résultats.
- `POST /api/correspondence/reports`: crée un signalement.

Routes admin sous `/api/admin/correspondence`:

- `GET /api/admin/correspondence/sessions`: toutes les sessions.
- `POST /api/admin/correspondence/sessions`: crée une session.
- `PATCH /api/admin/correspondence/sessions/:id`: met à jour une session.
- `POST /api/admin/correspondence/jobs/assign`: lance l'assignation des lettres.
- `POST /api/admin/correspondence/jobs/results`: calcule les résultats.
- `GET /api/admin/correspondence/reports`: liste les signalements.
- `PATCH /api/admin/correspondence/reports/:id`: traite ou rejette un signalement.

### Sponsors

- `GET /api/public/sponsors`: sponsors actifs publics.
- `GET /api/admin/sponsors`: sponsors admin.
- `POST /api/admin/sponsors/logo-upload`: upload de logo.
- `POST /api/admin/sponsors`: création.
- `PATCH /api/admin/sponsors/:id`: mise à jour.
- `DELETE /api/admin/sponsors/:id`: suppression.

## 6. Structure de la base de données

### Configuration TypeORM

La configuration TypeORM est centralisée dans `backend/src/database/typeorm.config.ts`.

Comportement principal:

- `DB_TYPE=postgres`: PostgreSQL, migrations activées par défaut côté application si `DB_MIGRATIONS_RUN` n'est pas redéfini.
- `DB_TYPE=sqlite` ou absent: SQLite local, fichier `konesans.sqlite` par défaut, `synchronize=true` par défaut.
- Les migrations sont dans `backend/src/database/migrations`.
- La table des migrations est `typeorm_migrations`.

### Tables MVP

`levels`

- Représente les niveaux/classes académiques.
- Champs clés: `id`, `name`.
- Contrainte: `name` unique.

`subjects`

- Matières liées à un niveau.
- Champs clés: `id`, `name`, `levelId`.
- Relation: plusieurs matières appartiennent à un niveau.
- Contrainte: couple `name` + `classId` unique dans le code TypeORM, stocké via `levelId`.

`users`

- Comptes étudiants, admins et modérateurs.
- Champs clés: identité, email, mot de passe hashé, rôle, niveau, école, ville, département, section, préférences de contact, acceptation privacy, `googleId`.
- Relations: un utilisateur peut être rattaché à un niveau.
- Contrainte: email unique.

`account_verification_codes`

- OTP email pour inscription étudiant et création modérateur.
- Champs clés: email, purpose, code hashé, payload, tentatives, compteur d'envoi, expiration, blocage temporaire.
- Contrainte: couple email + purpose unique.

`questions`

- Banque de questions QCM.
- Champs clés: niveau, matière, prompt, options A-D, bonne option, difficulté, explication.
- Relations: question liée à un niveau et une matière.

`quiz_sessions`

- Session de quiz d'un utilisateur.
- Champs clés: utilisateur, niveau, matière, statut, score, timestamps.
- Relations: une session contient plusieurs `quiz_session_questions`.

`quiz_session_questions`

- Questions sélectionnées pour une session.
- Champs clés: session, question, position.
- Relations: appartient à une session et référence une question.

`answers`

- Réponses données dans une session de quiz.
- Champs clés: question de session, option sélectionnée, correction.

`duel_matches`

- Duel QCM ou oral entre deux joueurs.
- Champs clés: join code, compétition, sujet, niveau, joueurs, statut, nombre de questions, mode, modérateur, informations Chime, gagnant, timestamps.
- Contrainte: `joinCode` unique.

`duel_match_questions`

- Questions sélectionnées pour un duel.
- Champs clés: duel, question, position.

`duel_progresses`

- Progression et score d'un joueur dans un duel.
- Champs clés: duel, utilisateur, nombre de réponses, score, timestamps, temps total, dernière activité.
- Contrainte: couple `duelMatchId` + `userId` unique.

`duel_answers`

- Réponse d'un joueur à une question de duel.
- Champs clés: question de duel, utilisateur, option, correction, timestamp.
- Contrainte: couple `duelMatchQuestionId` + `userId` unique.

`notifications`

- Notifications utilisateur.
- Champs clés: utilisateur, titre, message, type, statut lu/non lu, date.

`admin_broadcasts`

- Messages diffusés par un admin.
- Champs clés: admin, titre, message, ciblage, niveau, département, ville, section, nombre de destinataires.

`duel_score_events`

- Historique des points attribués par un modérateur en duel oral.
- Champs clés: duel, bénéficiaire, modérateur, points, cible, raison, date.

### Tables Arena

`arena_competitions`

- Compétitions Arena live.
- Champs clés: nom, statut, nombre de questions, durée par question, date planifiée, admin créateur, gagnant, compétiteurs A/B, modérateur, round courant, timestamps, configuration broadcast HLS/YouTube, description.
- Relations: une compétition a des inscriptions et des rounds.

`arena_participant_registrations`

- Inscriptions de participants à une compétition.
- Champs clés: compétition, participant, statut, disqualification, raison, date d'inscription.
- Contrainte: couple `competitionId` + `participantUserId` unique.

`arena_rounds`

- Round d'une compétition, oral ou QCM.
- Champs clés: compétition, question optionnelle, mode, position, début, fin, heure de fin prévue.
- Relations: un round a plusieurs réponses.

`arena_participant_answers`

- Réponse ou verdict pour un participant sur un round.
- Champs clés: round, participant, utilisateur soumissionnaire, option, correction, points, date.
- Contrainte: couple `roundId` + `participantUserId` unique.

`arena_chat_messages`

- Messages de chat Arena.
- Champs clés: compétition, participant, utilisateur, message, nom d'expéditeur, date.

`arena_score_adjustments`

- Corrections manuelles de score.
- Champs clés: compétition, participant, admin, delta de points, raison, date.

### Table Sponsors

`sponsors`

- Sponsors affichés publiquement.
- Champs clés: nom, URL logo, URL site optionnelle, actif/inactif, ordre d'affichage, dates création/mise à jour.

### Tables Correspondance

`correspondence_sessions`

- Sessions de concours/correspondance.
- Champs clés: titre, thème, début, fin, délai de grâce, statut, règles JSON, admin créateur.
- Relations: une session a plusieurs lettres.

`correspondence_letters`

- Lettres écrites par les utilisateurs.
- Champs clés: session, auteur, contenu, metadata JSON, date création, date soumission, statut.
- Index: session + auteur, session + statut.

`correspondence_assignments`

- Assignation d'une lettre à un destinataire.
- Champs clés: session, lettre, destinataire, date assignation, livraison, ouverture.
- Contrainte: `letterId` unique.
- Index: session + destinataire.

`correspondence_threads`

- Conversation liée à une assignation.
- Champs clés: session, assignation, date création, dernier message, anonymat.
- Contrainte: `assignmentId` unique.

`correspondence_messages`

- Messages d'un thread.
- Champs clés: thread, expéditeur, contenu, date.
- Index: thread + date.

`correspondence_votes`

- Votes optionnels sur les lettres.
- Champs clés: session, votant, lettre, score, date.
- Contrainte: couple session + votant + lettre unique.

`correspondence_moderation_cases`

- Signalements et cas de modération.
- Champs clés: reporter, type de cible, cible, raison, détails, statut, admin traitant, date de traitement.
- Index: cible et statut.

### Relations clés

- Un niveau (`levels`) possède plusieurs matières (`subjects`) et plusieurs utilisateurs.
- Une question appartient à un niveau et une matière.
- Une session de quiz appartient à un utilisateur, un niveau et une matière, puis contient des questions et réponses.
- Un duel relie deux joueurs, éventuellement un modérateur, des questions, des progressions, des réponses et des événements de score.
- Une compétition Arena possède des inscriptions, des rounds, des réponses par round, des messages et des ajustements de score.
- Une session de correspondance possède des lettres; les lettres sont assignées à d'autres utilisateurs; les assignations ouvrent des threads et messages; les votes et signalements s'y rattachent.
- Les notifications et broadcasts sont liés aux utilisateurs et aux admins.

## 7. Migrations

Les migrations présentes couvrent notamment:

- renommage et nettoyage de schémas Arena hérités;
- ajout de `subjectId` et `levelId` sur les duels;
- ajout des champs département/section pour les étudiants;
- filtres d'audience des broadcasts admin;
- création et amélioration des OTP email;
- configuration de stream public YouTube pour Arena;
- expiration d'attente matchmaking;
- suivi de dernière activité sur progression duel;
- ajout complet du module correspondance.

La stratégie attendue est:

- PostgreSQL: utiliser les migrations TypeORM, avec `DB_MIGRATIONS_RUN=true` par défaut lorsque `DB_TYPE=postgres`.
- SQLite local: utiliser `synchronize=true` par défaut pour un travail léger, sauf réalignement volontaire par migrations.

## 8. Synthèse des responsabilités

Frontend:

- Présentation, routage, portail par rôle, stockage session, appels REST, WebSockets, lecture live.

Backend:

- Authentification, autorisation, validation, logique métier, persistance, notifications, sockets, orchestration média.

Base de données:

- Stockage relationnel des comptes, contenus pédagogiques, quiz, duels, Arena, sponsors et correspondance.

Services externes:

- PostgreSQL/SQLite pour la persistance.
- Redis pour LiveKit et viewers.
- LiveKit/Egress pour Arena RTC/HLS.
- AWS Chime pour duels oraux.
- SMTP pour OTP.
- S3 optionnel pour fichiers publics.

## 9. Points d'attention

- La correspondance est bien codée mais protégée par `FEATURE_CORRESPONDENCE_CONTEST`.
- Le mode Arena `oral_v1` désactive certains endpoints QCM/chat.
- Le dépôt contient un `backend/backend/package.json`, probablement un artefact résiduel ou imbriqué à vérifier avant nettoyage.
- Le README backend et le README frontend sont encore largement des documents starter.
- Le backend sert `/uploads` à deux endroits (`main.ts` et `AppModule`), ce qui fonctionne mais mérite une clarification future pour éviter la duplication conceptuelle.
- `frontend/public/favicon.svg` était déjà non suivi avant cette analyse et n'a pas été modifié dans le cadre de ce rapport.
