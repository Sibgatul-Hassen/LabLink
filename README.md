# LabLink

**A Shared Lab Equipment Booking, Consumables & Breakdown-Reporting Platform**

A CSE 3422 Software Engineering Lab course project at United International University.

---

## Overview

LabLink is a multi-role web platform for managing shared laboratory equipment. It enables:

- **Students** to book equipment and report breakdowns
- **Lab assistants** to manage consumables and approve bookings
- **Lab managers** to set rules, view analytics, and manage the lab
- **The system** to prevent double-booking, auto-release ghost reservations, and track equipment breakdowns

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
   git clone https://github.com/yourusername/lablink.git
   cd lablink
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
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - Health check: http://localhost:5000/health
   - API docs: http://localhost:5000/api-docs (once implemented)

---

## Project Structure

```
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

| Milestone | Date    | Target             | Status         |
| --------- | ------- | ------------------ | -------------- |
| 30%       | Week 5  | CRUD + Auth + RBAC | 🔄 In Progress |
| 70%       | Week 11 | Business Logic     | ⏳ Not Started |
| 100%      | Week 16 | Full Platform      | ⏳ Not Started |

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

- **[Setup Guide](./LabLink_Tech_Stack_and_Monorepo_Setup.md)** — Detailed environment setup
- **[Implementation Guide](./LabLink_Complete_Implementation_Guide.md)** — Step-by-step development roadmap
- **[Project Proposal](./LabLink_CSE3422_Proposal.md)** — Project requirements and design

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

- **npm modules conflicts:** Delete `node_modules` and `package-lock.json`, then `npm install`
- **TypeScript errors:** Run `npx tsc --noEmit` to check types

### Git Issues

- **Merge conflicts:** Use `git status` to see conflicts, resolve them, then commit
- **Detached HEAD:** Run `git checkout develop` to return to main branch

---

## License

This project is created for educational purposes as part of CSE 3422 course.

---

## Contact

For questions or issues, reach out to the course instructor: Abrar Mahmud

---

**Last Updated:** [31/07/2026]  
**Repository:** https://github.com/Sibgatul-Hassen/lablink
