# Offload Newcomer Guide

## What this project is

Offload is a full-stack TypeScript app for shared household planning. It turns free-form inputs (text, image, and voice) into structured **tasks** and **events**, assigns ownership between two carers, and tracks balance of household load.

## High-level architecture

- **Client (`client/`)**: React 19 + Vite + Wouter + tRPC React Query.
- **Server (`server/`)**: Express + tRPC backend exposing domain routers.
- **Data layer (`drizzle/`, `server/db.ts`)**: Drizzle ORM over MySQL.
- **Shared contracts (`shared/`)**: constants/error types shared across client/server.

Data flow is:

1. UI calls tRPC procedures.
2. Server validates input with Zod and runs business logic.
3. DB helpers in `server/db.ts` persist/query records.
4. Some flows call LLM/Whisper helpers in `server/ai.ts` + core SDK wrappers.

## Core concepts to understand first

1. **Token-based household access**
   - No full account signup is required for normal use.
   - A `shareToken` identifies a household; it is saved on devices.

2. **Onboarding seeds routing intelligence**
   - Household setup captures names, weekly rhythm, category defaults, and exceptions.
   - These become routing rules used to auto-assign extracted tasks.

3. **AI-assisted extraction and routing**
   - Input text/image/voice is converted into structured tasks/events.
   - Routing suggestions decide primary vs partner assignment and can be learned.

4. **Load scoring & balance signal**
   - Open tasks are weighted by urgency (high/medium/low) to produce per-member score.
   - Imbalance is only flagged under conditions that avoid noisy tiny-load cases.

## Important files and why they matter

- `server/_core/index.ts`: app bootstrap, middleware registration, tRPC mount, dev/prod serving.
- `server/routers.ts`: the main domain API surface (`household`, `onboarding`, `extract`, `routing`, `tasks`, `events`, `load`, `settings`, `calendar`).
- `server/db.ts`: all persistence helpers + load-score helper.
- `server/ai.ts`: extraction prompts/schemas and routing/rhythm parsing functions.
- `drizzle/schema.ts`: source of truth for DB tables and fields.
- `client/src/main.tsx`: React Query + tRPC client wiring.
- `client/src/App.tsx`: top-level providers + route table.
- `client/src/contexts/HouseholdContext.tsx`: localStorage-backed household/member identity model.
- `client/src/pages/Onboarding.tsx`: initial setup flow.
- `client/src/pages/Dashboard.tsx`: primary operating screen (tasks, load, calendar tab, quick add).

## Practical tips when making changes

- Prefer adding/changing server behavior through `server/routers.ts` and keep DB access in `server/db.ts`.
- When adding API fields, update:
  1. Zod input/output in router procedures,
  2. DB schema/helpers if persistence changes,
  3. client query usage and UI types.
- Keep task/event classification semantics consistent with prompts in `server/ai.ts`.
- For any feature needing migrations, update `drizzle/schema.ts` then generate migration SQL via Drizzle.

## Suggested learning path (first week)

1. Run app locally and walk through onboarding + dashboard flows end-to-end.
2. Trace one request from UI to DB (e.g., task create):
   - `client/src/components/InputBar.tsx` -> `trpc.tasks.create` -> `server/routers.ts` -> `server/db.ts`.
3. Read extraction/routing code in `server/ai.ts` to understand current AI contract.
4. Inspect `server/offload.test.ts` to see expected behavior patterns.
5. Review `todo.md` for implemented phases and product intent.

## Next areas to go deeper

- **Reliability**: add stronger integration tests around extraction + routing + calendar push.
- **Security**: review token-sharing model and consider hardening options (rotation/expiry/scoped links).
- **Observability**: add structured logging around AI calls and route latency.
- **UX iteration**: improve empty states and conflict-resolution in task/event reclassification.
