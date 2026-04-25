# Konesans+ — Analyse des Cas d'Utilisation (Use Cases)

## 1. Analyse de l'Innovation

**Est-ce une idée novatrice ?**

Oui, le projet **Konesans+** présente une innovation forte, particulièrement dans son contexte d'application (Haïti).

*   **Adaptation Contextuelle (Le "Product-Market Fit")** : Alors que les plateformes mondiales (Kahoot, Quizlet) sont génériques, Konesans+ attaque un besoin spécifique : le programme scolaire haïtien (7e AF, Philo, NS4, etc.). C'est une barrière à l'entrée défensive contre les concurrents internationaux.
*   **Modèle de Motivation (Gamification + Récompense)** : L'innovation sociale réside dans l'intégration de récompenses tangibles ("Primes", "Étudiant Phare") directement liées à la performance académique. Dans un contexte économique difficile, transformer le savoir en opportunité économique immédiate est un levier d'engagement extrêmement puissant.
*   **Démocratisation via IA** : L'utilisation de l'IA pour générer du contenu localisé (et potentiellement en Créole) permet de passer à l'échelle sans avoir besoin d'une armée d'enseignants pour rédiger chaque question manuellement au démarrage.

**Verdict** : Ce n'est pas seulement une "app de quiz", c'est un **écosystème de mérite**. L'innovation n'est pas technologique (les quiz existent déjà), elle est **sociale et opérationnelle** (adapter la EdTech à la réalité et aux leviers de motivation haïtiens).

---

## 2. Acteurs du Système

| Acteur | Rôle |
| :--- | :--- |
| **Étudiant** | Utilisateur principal. Cherche à tester ses connaissances, progresser et gagner des récompenses. |
| **Administrateur** | Gère la plateforme, le contenu pédagogique, la validation des gagnants et la sécurité. |
| **Système (IA/Back-end)** | Acteur automate qui génère des questions, corrige les quiz, calcule les scores et détecte la fraude. |
| **Partenaire/Sponsor** (Futur) | Finance les primes et peut consulter des statistiques anonymisées. |

---

## 3. Diagramme Global des Cas d'Utilisation

```mermaid
usecaseDiagram
    actor "Étudiant" as Student
    actor "Administrateur" as Admin
    actor "Système IA" as IA

    package "Konesans+ Core" {
        usecase "S'inscrire / Se connecter" as UC1
        usecase "Passer un Quiz (Chronométré)" as UC2
        usecase "Consulter le Classement (Leaderboard)" as UC3
        usecase "Revoir ses erreurs (Correction)" as UC4
        usecase "Recevoir une récompense (Étudiant Phare)" as UC5
    }

    package "Back-Office & IA" {
        usecase "Gérer la Banque de Questions" as UC_Admin1
        usecase "Valider les Gagnants (Anti-Triche)" as UC_Admin2
        usecase "Générer des questions auto" as UC_AI1
        usecase "Expliquer une réponse" as UC_AI2
    }

    Student --> UC1
    Student --> UC2
    Student --> UC3
    Student --> UC4
    Student --> UC5

    Admin --> UC_Admin1
    Admin --> UC_Admin2
    
    IA --> UC_AI1
    IA --> UC_AI2
    UC2 ..> UC_AI1 : include
    UC4 ..> UC_AI2 : include
```

---

## 4. Dail des Cas d'Utilisation (Par Module)

### Module 1 : Authentification & Profil (Onboarding)
**Objectif** : Garantir l'unicité des comptes pour un classement équitable.

*   **UC-01 : Création de compte sécurisée**
    *   *Acteur* : Étudiant
    *   *Flux* : Saisie Email/Tel -> Validation OTP -> Création mot de passe.
    *   *Règle métier* : Un seul compte par numéro de téléphone.
*   **UC-02 : Configuration du Profil Scolaire**
    *   *Acteur* : Étudiant
    *   *Données* : Niveau (ex: 9e AF), École (facultatif), Ville.
    *   *Impact* : Filtre automatiquement les quiz visibles.

### Module 2 : Moteur de Quiz & Apprentissage
**Objectif** : Évaluer et faire progresser l'étudiant.

*   **UC-03 : Démarrer une session de Quiz**
    *   *Acteur* : Étudiant
    *   *Flux* : Choisir Matière -> Le système assemble 20 questions aléatoires (Facile/Moyen/Dur) -> Lancement Timer.
*   **UC-04 : Répondre aux questions**
    *   *Acteur* : Étudiant
    *   *Interface* : QCM, Vrai/Faux. Impossible de revenir en arrière (règle anti-triche optionnelle).
*   **UC-05 : Obtenir Correction et Explication (IA)**
    *   *Acteur* : Étudiant + Système IA
    *   *Innovation* : Après le quiz, l'IA explique *pourquoi* la réponse était fausse (Tutorat instantané).

### Module 3 : Gamification & "Étudiant Phare"
**Objectif** : Retenir l'utilisateur et récompenser l'excellence.

*   **UC-06 : Consulter le Classement Hebdomadaire**
    *   *Acteur* : Étudiant
    *   *Filtres* : Global, Par Niveau, Par Ville.
*   **UC-07 : Calculer le "Score de Performance"**
    *   *Acteur* : Système
    *   *Formule* : `(Bonnes Réponses * Coeff Difficulté) - (Pénalité Temps)`.
*   **UC-08 : Notification "Étudiant Phare"**
    *   *Acteur* : Système -> Étudiant
    *   *Déclencheur* : Fin de la semaine (ex: Dimanche soir).

### Module 4 : Administration & Contenu
**Objectif** : Pilotage et intégrité.

*   **UC-09 : Importation Massive de Questions**
    *   *Acteur* : Admin
    *   *Source* : Fichiers Excel/CSV ou génération IA validée par humain.
*   **UC-10 : Modération Anti-Triche**
    *   *Acteur* : Admin
    *   *Alertes* : Scores impossibles (ex: 100% en 30 secondes), multiples comptes IP identique.
*   **UC-11 : Gestion des Récompenses**
    *   *Acteur* : Admin
    *   *Actions* : Marquer une prime comme "Envoyée", contacter l'étudiant.

### Module 5 : Fonctionnalités IA (La "Secret Sauce")
**Objectif** : Scalabilité et accessibilité.

*   **UC-12 : Génération de Questions (Draft)**
    *   *Prompt* : "Génère 50 questions de Math niveau 9e AF sur les équations du 1er degré".
    *   *Validation* : L'admin valide avant publication.
*   **UC-13 : Support Créole (Traduction)**
    *   *Action* : Traduire l'interface ou les explications en Créole Haïtien pour plus d'inclusivité.

---

## 5. Priorisation pour le MVP (Minimum Viable Product)

Pour la première version ("Launchpad"), concentrez-vous uniquement sur :
1.  **UC-01 & UC-02** (Inscription simple)
2.  **UC-03 & UC-04** (Quiz simple QCM)
3.  **UC-06** (Classement basique)
4.  **UC-09** (Admin : Ajout questions)

*Les récompenses et l'IA avancée viendront en V2 une fois la traction prouvée.*
