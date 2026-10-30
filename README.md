# Spelling Kids

Spelling Kids is a family-focused spelling practice app. Children work through word categories and spelling exercises, listen to spoken prompts, and build progress over time. Parents sign in and manage child profiles.

## Services

- **Mobile app:** Expo, React Native, and Expo Router. See [spelling-kids/README.md](spelling-kids/README.md).
- **Backend API:** NestJS, Prisma, and PostgreSQL. See [backend/README.md](backend/README.md).
- **Speech AI:** FastAPI service for speech-to-text and text-to-speech. See [speech-ai/README.md](speech-ai/README.md).

The mobile app talks to the authenticated NestJS API. The API uses PostgreSQL and privately forwards speech requests to the Python service.

## Requirements

- Docker Desktop with Docker Compose
- Clerk development credentials
- A computer and device/emulator on a network that can reach the API when testing the mobile app

## Start the services

Create local environment files from the examples:

```bash
cp backend/.env.example backend/.env
cp speech-ai/.env.example speech-ai/.env
cp spelling-kids/.env.example spelling-kids/.env
```

Set `CLERK_SECRET_KEY` in `backend/.env` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `spelling-kids/.env`. Set the same random `SPEECH_API_KEY` in both `backend/.env` and `speech-ai/.env`. Set `EXPO_PUBLIC_API_URL` in the mobile environment to an address reachable from the device running the app; do not use a container-only hostname there.

Start PostgreSQL, the API, and speech service:

```bash
docker compose up --build
```

The API is available at `http://localhost:3000/api`. The API container applies database migrations on startup. To run the seed script after the first start:

```bash
docker compose exec backend npm run db:seed
```

The speech service is internal to the Compose network. Its first inference downloads model files and can take several minutes; model data persists in a named volume.

## Start the Expo development server in Docker

Expo is an optional development service. Start it with:

```bash
docker compose --profile mobile up --build
```

The Metro server uses port `8081`. For physical devices, configure the Expo host/network so both the device and Metro can reach one another; the API URL in the app must use the computer's LAN address. Running Expo directly on the development machine is also supported; see [spelling-kids/README.md](spelling-kids/README.md).

## Configuration and data

The Compose database credentials are development defaults and must be replaced before deployment. PostgreSQL data, downloaded speech models, and generated speech audio use named Docker volumes. Do not commit `.env` files or use the included defaults for a public deployment.
"# Spelling-Kids" 
