# Learning System

## Architecture

Expo Router sends authenticated requests to NestJS under `/api`. NestJS verifies the Clerk bearer token, verifies that the selected child is active and belongs to the caller, owns category/session logic, grades answers, and persists progress/rewards through Prisma. NestJS alone calls the private FastAPI service. PostgreSQL remains the source of truth; the existing parent/child/category/word/exercise/progress/attempt/reward tables are retained.

Apply the additive `20261018120000_learning_sessions` migration with the normal deployment migration command after taking a database backup. It adds resumable session state, optional attempt session/idempotency keys, and a unique reward source-attempt relation. It does not drop or rewrite existing rows.

## Routes

All listed routes require `Authorization: Bearer <Clerk token>`.

| Method and route | Contract |
| --- | --- |
| `GET /api/categories?childId=...` | Categories with published-word counts, mastery progress, accuracy, and review due |
| `GET /api/categories/:categoryId?childId=...` | One category and the same child-specific statistics |
| `GET /api/categories/:categoryId/progress?childId=...` | Alias for category statistics |
| `POST /api/learning/sessions` | `{childId, categoryId, retryMissedOnly?}`; resumes or creates a session, optionally limited to previously missed exercises |
| `GET /api/learning/sessions/:id/current` | Safe question payload; never includes spelling/example sentence answer keys |
| `POST /api/learning/sessions/:id/answer` | `{answer, idempotencyKey, durationMs?}`; server grades and persists atomically |
| `POST /api/learning/sessions/:id/next` | Returns the next question or `{complete:true}` |
| `POST /api/learning/sessions/:id/complete` | Explicitly completes the session |
| `POST /api/learning/sessions/:id/abandon` | Marks the session abandoned without deleting progress |
| `GET /api/learning/sessions/:id/summary` | Persisted session results and category-scoped progress |
| `GET /api/learning/children/:childId/summary` | Child-wide progress, category summaries, review count, XP, rewards |
| `GET /api/learning/sessions/:id/current/audio` | Returns an audio URL; generated assets are served through authenticated `GET /api/speech/audio/:cacheKey` |
| `POST /api/speech/tts` | JSON `{text, language?}`; streams Python's WAV response |
| `POST /api/speech/stt` | Multipart `audio` and optional `language`; forwards transcript JSON |

The Python contracts remain `POST /tts` (multipart, WAV bytes), `POST /stt` (multipart, transcript JSON), and `GET /health`. Python is never called from Expo.

## Progress policy

- A word is available/countable when it has at least one published exercise in its category.
- A word is mastered at `masteryLevel >= 3`. Completion percentage is mastered available words divided by available words.
- Every graded answer increments attempts; correct answers increment `correctCount` and award 10 XP. Incorrect answers award no XP.
- Correct answers raise mastery by one; incorrect answers lower it by one; mastery is clamped to 0-3.
- Review date is one day for levels 0-1, three days for level 2, and seven days for level 3. Accuracy is correct attempts divided by graded attempts.
- Attempts, progress, reward, and session advancement are written in a transaction. A unique child/idempotency key prevents a retry from grading or rewarding twice; a unique reward source-attempt relation is a second guard.

## Environment and local run

Copy `backend/.env.example` and `spelling-kids/.env.example` to local `.env` files and replace placeholders. Set Expo `EXPO_PUBLIC_API_URL` to the machine LAN address on port 3000 when testing from a physical Android device; `localhost` on the phone is the phone itself. Keep `SPEECH_AI_URL` and `SPEECH_API_KEY` only in the backend/Python environments. See `speech-ai/README.md` for the Python setup and supported model/runtime guidance.

Generate Prisma types with `npm run prisma:generate` from `backend`, apply reviewed migrations with `npm run prisma:deploy`, and seed repeatable starter content with `npm run db:seed`. The seed upserts one category, words, and all four published exercise types; it never deletes attempts or progress.

Run backend checks with `npm run build`, `npm test`, and `npm run lint` from `backend`. Run Expo checks with `npm exec -- tsc --noEmit` and `npm run lint` from `spelling-kids`.

## Limits

Audio is cached on local Nest disk; production must configure persistent/shared storage for multiple backend replicas. Speech inference and database migration were not run in this development environment. Rate limiting, durable distributed audio storage, and browser microphone recording remain future work.