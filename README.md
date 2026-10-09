# LabLink

LabLink manages laboratory components, department quotas, class sessions, requisitions, borrowing, purchasing, returns, and stock at United International University. It has a React frontend, Express API, and PostgreSQL database through Prisma.

## Run locally with Docker

1. Copy backend/.env.example to backend/.env and frontend/.env.example to frontend/.env.
2. Run docker compose up -d --build.
3. Run docker compose exec backend npx prisma migrate deploy.
4. Run docker compose exec backend npm run db:seed.
5. Open http://localhost:5173. The API health check is at http://localhost:5000/health.

The seeded demo accounts use Password123!. The seed script lists their email addresses in backend/prisma/seed.ts. Docker Compose supplies container database and API URLs. For local Node development, use the copied .env files and a reachable PostgreSQL 16 instance.

## Current application

- JWT login for seven roles, department scoped API access, dashboard, and component CRUD.
- Departments, users, stock, quotas, courses, sections, labs, routine slots, experiments, and dated class sessions.
- Class requisition drafts, instructor live orders, five-tier allocation (own quota, approved substitute, spare stock, interdepartment borrow, purchase), issue, return, and cancellation.
- Borrow approval and handover; three-level purchase approval and receipt; stock movements and analytics.
- Scheduled class drafts, low-stock notifications, seven types of rule-based suggestions with evidence and review, damage maintenance, and configurable penalty assessment and settlement. A configured total outstanding-penalty threshold blocks personal requisitions until the balance is cleared.

The development frontend runs on port 5173 and the API on 5000. There is no Swagger endpoint, QR scanner, equipment booking feature, Redis service, or AI model in this repository.

## Docker Compose on a server

1. Copy `.env.production.example` to `.env.production` on the server. Replace the database password in both `LABLINK_DB_PASSWORD` and `DATABASE_URL` with the same value, and set a long random `JWT_SECRET`. URL-encode any reserved characters in the password inside `DATABASE_URL`. Keep this file private and outside Git.
2. Run `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`. Compose starts PostgreSQL, applies migrations, then starts the API and web server after health checks pass.
3. For a fresh production database, create the first administrator using `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm -e ADMIN_EMAIL -e ADMIN_FULL_NAME -e ADMIN_PASSWORD backend node dist/prisma/bootstrap-admin.js`. Set those three variables in the invoking shell first. The script requires a password of at least 12 characters and refuses to run once an active system administrator exists. Create other users in the Users screen. Do not run the demo seed on a production database.
4. Open `http://SERVER:8080` (or the configured `LABLINK_HTTP_PORT`). The web container serves the built frontend and forwards `/api` to the backend on the internal Compose network. For a public deployment, put the server behind an HTTPS reverse proxy and restrict direct HTTP access at the host firewall.

No source directories are mounted in the production stack. PostgreSQL uses a named volume and has no host port. Before an update, run `docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres pg_dump -U lablink -d lablink -Fc > lablink-backup.dump` on the server and store the dump securely. Deploy updates with the same `up -d --build` command; the migration container runs before the API is replaced.

## Checks

Backend: from backend, run npm ci, npx prisma generate, npm run lint, npm test -- --runInBand, and npm run build. Integration tests require the PostgreSQL database and applied migrations.

Frontend: from frontend, run npm ci, npm run lint, npm test, npm run build, and npm run test:browser. The browser test builds with a same-origin API, starts a mock API, and drives Chrome or Edge through login, penalty configuration, damage repair, suggestion review, issue, return, and the student penalty block. It skips when neither browser is installed.

GitHub Actions runs backend tests against PostgreSQL, then builds the API and frontend. The workflow's status must be checked on a pull request; this document does not claim a green run.

## Remaining work

- Verify the complete issue, return, substitute, damage, penalty, and suggestion flows in a running browser against a fresh migrated database.
- Run the production Compose stack on the chosen server and verify HTTPS, database migrations, first-admin login, and backups. Docker is not available in this workspace, so this deployment has not yet been executed here.
- Confirm branch protection rules in the target GitHub repository.

QR scanning and equipment booking were confirmed out of scope.

The database schema migration for substitute allocation must be applied before using that feature. Keep credentials out of Git; only .env.example files belong in commits.

## GitHub Pages

The public frontend is deployed from `main` by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml). After enabling
GitHub Pages with **GitHub Actions** as the source, the site is available at:

`https://sibgatul-hassen.github.io/LabLink/`

The Pages deployment is a static frontend. Login and protected API features
require a separately hosted backend. Set the repository variable
`VITE_API_URL` under **Settings → Secrets and variables → Actions → Variables**
to the public API URL before deploying. If it is unset, the public landing
page still builds and is usable, but API requests cannot succeed.

## License and attribution

LabLink is **All Rights Reserved**. The source code, design, documentation,
assets, and other original material in this repository may not be copied,
rehosted, modified, redistributed, or used to create the same or a derivative
project in another GitHub repository without prior written permission from the
copyright holder.

Any approved reuse must visibly credit the LabLink project and link to this
repository:
https://github.com/Sibgatul-Hassen/LabLink

See [`LICENSE`](LICENSE) for the complete terms. Contributions submitted to
this repository remain subject to these terms unless a separate written
agreement says otherwise.

## Original project documentation

The following project overview and planning documentation from the original
README is preserved below so that the repository retains its complete project
history and context.

# LabLink

**A Shared Lab Equipment Booking, Consumables & Breakdown-Reporting Platform**

A CSE 3422 Software Engineering Lab course project at United International
University.

---

## Overview

LabLink is a multi-role web platform for managing shared laboratory equipment.
It enables:

- **Students** to book equipment and report breakdowns
- **Lab assistants** to manage consumables and approve bookings
- **Lab managers** to set rules, view analytics, and manage the lab
- **The system** to prevent double-booking, auto-release ghost reservations,
  and track equipment breakdowns

---

## Tech Stack

### Frontend

- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- Zustand + TanStack Query (state management)
- Vitest + Playwright (testing)

### Backend

- Node.js + Express + TypeScript
- Prisma (ORM)
- PostgreSQL (database)
- Redis (caching)
- Jest (testing)

### Infrastructure

- Docker + Docker Compose
- GitHub Actions (CI/CD)
- PostgreSQL 16
- Redis 7

---

## Quick Start

### Prerequisites

- Git
- Docker & Docker Compose
- Node.js 18+ (for local development without Docker)

### Setup

1. **Clone the repository**

```bash
git clone https://github.com/Sibgatul-Hassen/LabLink.git
cd LabLink
```

2. **Copy environment files**

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. **Start with Docker Compose**

```bash
docker compose up
```

4. **Initialize database** (in another terminal)

```bash
cd backend
npx prisma migrate dev --name init
```

5. **Visit the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000
   - Health check: http://localhost:5000/health
   - API docs: http://localhost:5000/api-docs (once implemented)

---

## Project Structure

```text
lablink/
├── backend/          # Node.js + Express API
│   ├── src/
│   ├── prisma/       # Database schema
│   ├── tests/
│   └── Dockerfile
├── frontend/         # React + TypeScript UI
│   ├── src/
│   ├── public/
│   ├── tests/
│   └── Dockerfile
├── docker-compose.yml # Multi-container orchestration
└── .github/
    └── workflows/     # CI/CD pipelines
```

## Team Information

**Course:** CSE 3422 — Software Engineering Lab
**Instructor:** Abrar Mahmud
**Institution:** United International University
**Semester:** Spring 2026

**Team Members:**

- [Pabel Sikder]: Backend Lead + Database
- [Saiful Islam]: Authentication + RBAC
- [Sibgatul Hassen]: Equipment & Consumables
- [Azmain Elahi]: Booking & Breakdown Logic
- [Sibgatul Hassen]: Frontend + Testing

---

## Development Workflow

### Branching Strategy

- `main` — production branch (protected)
- `develop` — integration branch (protected)
- Feature branches: `feature/*, bugfix/*, chore/*`

### Creating a Feature

1. Check out develop: `git checkout develop && git pull`
2. Create feature branch: `git checkout -b feature/your-feature-name`
3. Make changes and commit: `git commit -m "feat: your feature description"`
4. Push: `git push -u origin feature/your-feature-name`
5. Create Pull Request on GitHub
6. Wait for review and CI/CD to pass
7. Merge to develop

### Running Tests

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

### Linting & Type Checking

```bash
# Backend
cd backend && npm run lint && npx tsc --noEmit

# Frontend
cd frontend && npm run lint && npx tsc --noEmit
```

---

## Features

### Core (Milestone 30% — Week 5)

- [x] Equipment CRUD
- [x] Consumable CRUD
- [x] User authentication
- [x] Role-based access control

### Phase 1 (Milestone 70% — Week 11)

- [x] Booking with conflict detection
- [x] Check-in/check-out workflow
- [x] Breakdown reporting
- [x] Consumable tracking & low-stock alerts
- [x] Approval queue

### Phase 2 (Milestone 100% — Week 16)

- [x] Analytics dashboard
- [x] QR code scanning
- [x] Smart recommendations (AI)
- [x] Full test coverage
- [x] Deployment

---

## Milestones

| Milestone | Date | Target | Status |
| --- | --- | --- | --- |
| 30% | Week 5 | CRUD + Auth + RBAC | In Progress |
| 70% | Week 11 | Business Logic | Not Started |
| 100% | Week 16 | Full Platform | Not Started |

---

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow ESLint rules (configured in package.json)
- Format with Prettier before committing

### Commit Messages

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code restructuring
- `test:` — Add/update tests
- `docs:` — Documentation
- `chore:` — Build, dependencies, CI/CD

Example: `git commit -m "feat: add booking conflict detection"`

### Pull Request Process

1. Create PR from feature branch to develop
2. Fill in PR template with description and testing details
3. Request review from at least one team member
4. Ensure CI/CD passes (GitHub Actions)
5. Address any review feedback
6. Squash and merge to develop

---

## Documentation

- **[Setup Guide](./LabLink_Tech_Stack_and_Monorepo_Setup.md)** — Detailed
  environment setup
- **[Implementation Guide](./LabLink_Complete_Implementation_Guide.md)** —
  Step-by-step development roadmap
- **[Project Proposal](./LabLink_CSE3422_Proposal.md)** — Project requirements
  and design

---

## API Documentation

Once the backend is running, view the Swagger documentation at:

- http://localhost:5000/api-docs

---

## Troubleshooting

### Docker Issues

- **Port already in use:** Edit docker-compose.yml port mapping
- **Database connection failed:** Ensure PostgreSQL container is healthy

```bash
docker compose ps  # Check container status
```

### Node Issues

- **npm modules conflicts:** Delete `node_modules` and `package-lock.json`,
  then `npm install`
- **TypeScript errors:** Run `npx tsc --noEmit` to check types

### Git Issues

- **Merge conflicts:** Use `git status` to see conflicts, resolve them, then
  commit
- **Detached HEAD:** Run `git checkout develop` to return to main branch

---

## Historical license notice

This project is created for educational purposes as part of the CSE 3422
course. The current license and attribution requirements are defined in the
[`License and attribution`](#license-and-attribution) section above and in
[`LICENSE`](LICENSE).

---

## Contact

For questions or issues, reach out to the course instructor: Abrar Mahmud

---

**Historical last updated:** 31/07/2026
**Repository:** https://github.com/Sibgatul-Hassen/LabLink
