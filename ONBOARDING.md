# LabLink Team Onboarding

Welcome to the LabLink project! This guide will help you get set up and ready to contribute.

## Prerequisites

Before starting, make sure you have:
- [Git](https://git-scm.com/downloads) installed
- [Node.js 18+](https://nodejs.org/) installed
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed (for local development)
- A GitHub account
- An invitation to the LabLink repository

## Step 1: Clone the Repository

1. Open your terminal/command prompt
2. Navigate to where you want to store the project:
```bash
   cd ~/Development  # or your preferred location
```
3. Clone the repository:
```bash
   git clone https://github.com/Sibgatul-Hassen/LabLink.git
   cd LabLink
```

## Step 2: Switch to Develop Branch

```bash
git checkout develop
git pull origin develop
```

## Step 3: Verify Your Setup

### Test Docker
```bash
docker --version
docker-compose --version
```

### Test Node.js
```bash
node --version
npm --version
```

## Step 4: Run the Application Locally

1. Copy environment files:
```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
```

2. Start the application:
```bash
   docker compose up
```

3. Open your browser and visit:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000
   - Health check: http://localhost:5000/health

## Step 5: Create Your First Feature Branch

```bash
git checkout develop
git pull
git checkout -b feature/your-feature-name
```

Replace `your-feature-name` with your actual feature (e.g., `feature/equipment-crud`).

## Step 6: Make Changes and Commit

1. Make your code changes
2. Commit them:
```bash
   git add .
   git commit -m "feat: your feature description"
```
3. Push to GitHub:
```bash
   git push -u origin feature/your-feature-name
```

## Step 7: Create a Pull Request

1. Go to https://github.com/Sibgatul-Hassen/LabLink
2. Click "Pull requests" tab
3. Click "New pull request"
4. Select:
   - Base: `develop`
   - Compare: `feature/your-feature-name`
5. Fill in the PR template
6. Click "Create pull request"

## Step 8: Code Review

1. Wait for a team member to review your PR
2. Address any feedback by making commits to your branch
3. Once approved, a maintainer will merge your PR
4. Your feature branch is automatically deleted

## Important Guidelines

### Branch Naming
- Features: `feature/description` (e.g., `feature/booking-logic`)
- Bug fixes: `bugfix/description` (e.g., `bugfix/conflict-detection`)
- Chores: `chore/description` (e.g., `chore/setup-ci`)

### Commit Messages
- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code restructuring
- `test:` — Add/update tests
- `docs:` — Documentation
- `chore:` — Build, dependencies

### Before Pushing Code
```bash
# Lint your code
npm run lint

# Type-check
npx tsc --noEmit

# Run tests
npm test

# Build to verify
npm run build
```

## Troubleshooting

### Docker container won't start
```bash
docker-compose down
docker system prune
docker compose up
```

### Port 3000 or 5000 already in use
- Edit `docker-compose.yml` and change port mappings
- Or close applications using those ports

### Database errors
```bash
docker compose logs postgres  # See database logs
docker compose restart postgres  # Restart database
```

### Node modules issues
```bash
rm -rf node_modules package-lock.json
npm install
```

## Questions?

- Check the [README.md](./README.md) for project overview
- Ask the team in GitHub Issues or Discussions

## First Assignment

Once you've completed this onboarding:
1. Create a branch: `feature/onboarding-complete`
2. Make a small change (e.g., add your name to CONTRIBUTORS.md)
3. Commit and push
4. Create a PR to practice the workflow
5. Merge after approval

Welcome aboard! 🚀