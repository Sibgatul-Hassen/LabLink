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
