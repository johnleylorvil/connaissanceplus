# Classement public et podium

La page `/classement`, le podium de l'accueil et le classement de l'espace élève
utilisent l'API publique `GET /api/leaderboard/weekly` (sans authentification).
Le podium affiche les trois premières lignes reçues. Aucun nombre minimal de
victoires ni score minimal n'est imposé : un participant sans victoire peut donc
apparaître si son rang est suffisant.

L'API fournit aussi `avatarUrl`, la photo de profil actuelle (ou `null`). Les
cartes du podium la mettent en avant au-dessus du nom. Sans photo, ou si l'image
ne peut pas être chargée, elles conservent leur présentation sans portrait.

Le lien « Voir le classement complet » utilise la navigation React Router,
comme le retour à l'accueil, pour garder la même version de l'application lors
des allers-retours. Le déploiement publie aussi le HTML sans cache navigateur ;
invalider CloudFront seul ne supprime pas les anciennes pages déjà en cache local.

Le test navigateur `frontend/e2e/podium-navigation.spec.ts` vérifie les photos
après plusieurs allers-retours et après précédent/suivant, ainsi que l'affichage
sans photo en cas d'image introuvable. Lancer dans `frontend` : `npm run test:e2e`.
Sous Windows, le test utilise Chrome installé ; ailleurs, installer Chromium
avec `npx playwright install chromium` avant de lancer le test.

## Résultats pris en compte

L'API retient la première liste non vide, dans cet ordre :

1. Duels QCM terminés de la semaine courante, avec deux joueurs.
2. Quiz terminés de la semaine courante.
3. Duels QCM terminés de la semaine précédente.
4. Quiz terminés de la semaine précédente.
5. Duels QCM terminés de tout l'historique.
6. Quiz terminés de tout l'historique.

Les listes ne sont pas additionnées. Les duels oraux, les compétitions Arena,
les duels en attente/annulés et les quiz inachevés ne sont pas pris en compte.
Le filtre facultatif `classId` s'applique à chaque recherche.
Le calcul actuel des semaines utilise le lundi à 00 h avec un décalage fixe UTC−5.

## Ordre du classement

Pour les duels : victoires décroissantes, puis bonnes réponses cumulées
décroissantes, temps cumulé des victoires croissant, défaites croissantes et
dernière victoire la plus récente. Il s'agit d'un nombre de bonnes réponses,
pas d'un pourcentage de précision. Aucun dernier départage n'est défini si tous
ces critères sont identiques.

Pour le recours aux quiz : nombre de quiz terminés décroissant, puis bonnes
réponses cumulées décroissantes, puis dernière mise à jour la plus récente.
Le contrat existant expose ce nombre de quiz dans `winCount` et `duelCount` :
les libellés « victoires » et « duels » ne distinguent donc pas encore ce recours.

## Incident PostgreSQL corrigé

Le tri utilisait `ORDER BY winCount` alors que le champ calculé était déclaré
`AS "winCount"`. PostgreSQL cherchait `wincount` et levait une erreur, ce qui
interrompait également les recours aux autres résultats. SQLite ne révélait pas
cette incompatibilité. Les deux requêtes protègent maintenant leurs alias avec
`qb.escape(...)`.

Les tests `backend/src/mvp/weekly-leaderboard.spec.ts` exécutent les requêtes
TypeORM dans PostgreSQL via PGlite, en mémoire, sans base externe. Lancer dans
`backend` : `npm test -- --runInBand weekly-leaderboard.spec.ts`.

Après déploiement du backend, vérifier que l'API publique renvoie HTTP 200 et un
tableau JSON, puis ouvrir `/classement` sans connexion. Le frontend doit aussi
être déployé pour charger le classement dès l'accueil de l'espace élève.
