# Backend API

NestJS REST API for Spelling Kids. It authenticates parent requests with Clerk, manages child profiles and learning sessions, persists learning data through Prisma, and proxies speech operations to the private FastAPI service.

## Stack

- NestJS and TypeScript
- PostgreSQL with Prisma ORM
- Clerk authentication
- Internal FastAPI speech service

## Run with Docker Compose

From the repository root, copy `backend/.env.example` to `backend/.env` and configure `CLERK_SECRET_KEY` and `SPEECH_API_KEY`. Also create `speech-ai/.env` from its example and set the matching speech key. Then run:

```bash
docker compose up --build
```

Compose starts PostgreSQL and speech AI, applies Prisma migrations, and starts the API on `http://localhost:3000/api`. PostgreSQL connection and internal speech URL are supplied by Compose. Generated speech audio is stored in a persistent volume.

## Run locally

Requires Node.js 22+ and PostgreSQL. From this directory:

```bash
npm ci
```

Create `.env` from `.env.example`, set `DATABASE_URL`, `CLERK_SECRET_KEY`, and `SPEECH_API_KEY`, then run:

```bash
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
```

The API listens on port `3000` and uses the `/api` prefix. Run the Python speech service separately when speech endpoints are needed.

## Useful commands

```bash
npm run build
npm test
npm run test:e2e
npm run db:seed
```

## Environment

| Variable                 | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string                                    |
| `CLERK_SECRET_KEY`       | Server-side Clerk credential                                    |
| `PORT`                   | API port; defaults to `3000`                                    |
| `SPEECH_AI_URL`          | Private speech-service URL; defaults to `http://127.0.0.1:8001` |
| `SPEECH_API_KEY`         | Shared backend-to-speech key                                    |
| `SPEECH_AUDIO_CACHE_DIR` | Generated audio cache directory                                 |

Do not expose the speech service or put server secrets in the mobile app.
