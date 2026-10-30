FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/spelling_kids?schema=public
RUN npm run prisma:generate && npm run build

RUN mkdir -p /app/.cache/speech && chown -R node:node /app
USER node

EXPOSE 3000

CMD ["sh", "-c", "npm run prisma:deploy && npm run start:prod"]
