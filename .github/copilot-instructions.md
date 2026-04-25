# Konesans+ — Project Instructions

## About
**Konesans+** is an innovative online quiz and competition platform for Haitian students.
**Mission**: Gamify academic excellence by allowing students (7e AF to Philo) to compete in subject-based quizzes, climb national leaderboards, and earn real-world rewards ("Primes", "Étudiant Phare").
**Key Value**: Localized content (Haitian curriculum), competitive incentives, and accessible technology.

## Architecture
- **Monorepo Structure**:
  - `frontend/` — React + TypeScript (Vite). Mobile-first responsive design.
  - `backend/` — Node.js + NestJS. REST API architecture.
  - `database/` — PostgreSQL. Managed via Docker and TypeORM/Prisma.
- **Infrastructure**: Docker Compose for local development.

## Code Style
- **TypeScript**: Strict mode enabled everywhere.
- **Backend API**: Follow RESTful conventions. Use DTOs for validation (class-validator).
- **Frontend**: Functional components, Hooks. Use Tailwind CSS for styling (recommended for mobile-first).
- **Naming**: camelCase for variables/functions, PascalCase for classes/components.

## Build and Test

```bash
# Backend
cd backend
npm run start:dev   # Start NestJS server (Watch mode)
npm run test        # Run unit tests
npm run test:e2e    # Run end-to-end tests

# Frontend
cd frontend
npm run dev         # Start Vite dev server
npm run build       # Build for production

# Infrastructure
docker-compose up -d  # Start PostgreSQL database
```

## Conventions
- **Language**: Codebase in English. User-facing content in French (and Creole eventually).
- **Error Handling**: Standardized API error responses (message, statusCode, timestamp).
- **Data Integrity**: Validate all inputs at the controller level.
- **Git**: Use Conventional Commits (e.g., `feat: add user login`, `fix: score calculation`).
