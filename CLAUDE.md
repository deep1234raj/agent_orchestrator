# CLAUDE.md — Operating Manual for Development

This file encodes the **decisions already made**, the **scope guardrails**, and the **working style** for this project so each session starts with shared context. If you (Claude) ever find yourself uncertain about a decision documented here, **stop and ask before deviating**.

---

## 1. Project context

Build a local-first platform where users create AI agents, configure them, wire them into workflows, and let them collaborate.

**Priorities:**

- Working end-to-end product — **40%**
- Architecture and code quality — **30%**
- UI/UX and configurability — **20%**
- Documentation — **10%**

---

## 2. Decisions already made — do not relitigate

These are settled. If you think one of them is wrong, **flag it and ask** — do not silently switch.

| Area                  | Decision                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| Agent runtime         | **LangGraph**                                                                   |
| Backend               | **Python 3.14 + FastAPI**                                                       |
| Frontend              | **Next.js (App Router) + TypeScript**                                           |
| UI components         | **Tailwind + shadcn/ui**                                                        |
| Graph editor          | **React Flow (xyflow)**                                                         |
| Database              | **Postgres + SQLAlchemy + Alembic**                                             |
| Real-time             | **WebSockets via FastAPI** (no Redis pub/sub)                                   |
| Messaging channel     | **Telegram** (not WhatsApp, not Slack)                                          |
| Default LLM           | **Anthropic Claude** (model configurable per agent; OpenAI, Ollama as fallback) |
| Packaging             | **Docker Compose**                                                              |
| Package manager (web) | **pnpm**                                                                        |
| Package manager (api) | **uv** (or pip if uv unavailable)                                               |
| Python testing        | **pytest**                                                                      |
| JS testing            | **vitest**                                                                      |

---

## 3. Scope guardrails — what NOT to build

A common failure mode is sprawling scope. The following are explicitly **out of scope** for the submission unless I (the user) say otherwise:

- ❌ Authentication, login, user accounts, multi-tenancy
- ❌ Vector databases, RAG, embeddings (use summary-based memory only)
- ❌ Redis, Celery, RabbitMQ (in-process async worker is enough)
- ❌ Kubernetes, Helm, Terraform (Docker Compose only)
- ❌ A second messaging channel (Telegram only — others stub the interface but aren't implemented)
- ❌ Workflow versioning, audit logs, rollback
- ❌ Fancy custom-rolled UI components (use shadcn/ui)
- ❌ Custom auth on the agent runtime (single-user, local-only)

If you catch yourself drifting toward any of these, stop and ask.

---

## 4. Architecture invariants

These boundaries are load-bearing. Code reviewers will look at them. Respect them strictly.

- **UI never imports from runtime.** UI talks to the API only.
- **API never imports from UI.** No shared types that leak frontend concerns into the backend.
- **Runtime never reads HTTP.** It reads from the database and writes events back. The API is the only HTTP boundary.
- **Persistence is centralised.** All models live under `api/app/models/`. No ORM access from outside the data layer.
- **One source of truth for an agent.** The DB row. Compilers turn that row into a LangGraph node at execution time — they don't cache or duplicate config.
- **All inter-agent messages are persisted** before being broadcast. The DB is the bus; WebSockets are a read-through cache.

When in doubt about where code belongs: the API layer orchestrates, the runtime executes, the persistence layer remembers. Cross-layer logic is a smell.

---

## 5. Coding standards

### Python (api/)

- Python 3.14+
- Type hints everywhere. `from __future__ import annotations` at top of every module.
- Pydantic v2 for all request/response schemas.
- SQLAlchemy 2.0 style (`Mapped[...]`, `mapped_column`).
- Async-first: every route, every DB call, every tool — `async def`.
- Errors: raise `HTTPException` from routes, custom domain exceptions from the runtime.
- Logging: `structlog` with contextual binding (run_id, agent_id). No `print`.
- Imports sorted with `ruff`. Format with `ruff format`.

### TypeScript (web/)

- Strict TS — `"strict": true`, no `any` without a comment justifying it.
- Server components by default; `"use client"` only where interactivity demands it.
- API client is generated from the FastAPI OpenAPI spec (we'll use `openapi-typescript`). Never hand-write request types.
- shadcn/ui components live under `components/ui/`; app-specific composites under `components/`.
- No CSS files except `globals.css`. Tailwind everywhere else.

### General

- Small files. If a Python module exceeds ~250 lines or a React component exceeds ~150, split it.
- One concept per file. Don't bundle.
- Tests live next to code: `foo.py` → `test_foo.py` in `tests/` mirroring structure.
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).

---

## 6. Database conventions

- All tables have `id` (UUID v7), `created_at`, `updated_at`.
- Soft delete is not used. Hard delete with cascading FKs.
- JSON columns are typed via Pydantic schemas — never raw dicts on the boundary.
- Every migration is reversible. `alembic downgrade -1` must work.
- Seed data (workflow templates, default tools) lives in `api/app/db/seed.py`, idempotent.

Core tables (do not invent new ones without asking):

`agents` · `workflows` · `runs` · `messages` · `tool_calls` · `usage_events` · `channels` · `schedules`

---

## 7. Workflow when implementing a feature

Follow this order. It's deliberately model-first because schema changes ripple, and ripple-fixing late is expensive.

1. **Restate the feature** in one sentence in your reply before touching code. Confirm scope with me if it's non-trivial.
2. **Data model first.** If new columns or tables are needed, write the Alembic migration and the SQLAlchemy model.
3. **Pydantic schemas next.** Request, response, internal DTOs.
4. **API route.** Thin — delegates to a service function.
5. **Service / runtime logic.** This is where the real work lives.
6. **Tests.** Critical paths only — happy path + the one failure mode that actually matters.
7. **UI.** Generate the TS client (`pnpm openapi`), then build the screen.
8. **Manual smoke test.** Run the flow end-to-end before declaring done.

---

## 8. Testing philosophy

Don't aim for coverage numbers. Aim for **confidence on the demo path**.

Tests that MUST exist:

- `test_agents_crud` — create, read, update, delete an agent
- `test_workflow_compile` — workflow JSON → LangGraph compiles without error
- `test_workflow_execute_happy_path` — a 2-agent workflow runs end-to-end and persists messages
- `test_telegram_webhook_creates_run` — POST to webhook creates a run row and a response is queued
- `test_ws_event_fanout` — events written to the bus reach a connected WS client

Tests that should NOT exist yet:

- LLM output content assertions (flaky, low-value)
- Full visual regression on the React Flow canvas
- Load tests

---

## 9. Working style with me

- **Be concise.** Skip recap. If I asked for code, lead with code. Explanations go after, brief.
- **Surface tradeoffs.** When you choose between two approaches, note the other one in one line. Don't write essays.
- **Ask before large refactors.** Anything touching >3 files outside the current feature is a refactor — ask first.
- **Flag scope creep early.** If a request expands beyond what's in section 3, say so before implementing.
- **Don't apologize, don't preamble.** "Sure!", "Great question!", "I'll help with that" — skip.
- **One question at a time.** If you need to clarify, ask the most blocking question first; don't batch.
- **Bias to action.** When something is small and reversible, just do it. When something is large or load-bearing, ask first.

---

## 10. The demo

This is the canonical end-to-end flow the project is built around. Every feature should be evaluated against "does this make the demo better or more reliable?"

**Workflow: "Research & Brief"** — triggered from Telegram.

1. User messages the Telegram bot with a topic (e.g., "lithium battery recycling market").
2. **Researcher agent** uses web search to gather 3–5 sources.
3. **Writer agent** drafts a one-page brief from those sources.
4. **Critic agent** reviews. If it spots issues, sends feedback back to Writer (the feedback loop). Otherwise, approves.
5. Approved brief is sent back to the user via Telegram.
6. Throughout, the dashboard shows inter-agent messages, tool calls, and token cost in real time.

A second template ("Daily Standup Summarizer", schedule-triggered) demonstrates the schedule feature.

---

## 11. Commands you'll run a lot

```bash
# First-time setup: copy env template and fill in API keys
cp .env.example .env

# Bring up the whole stack
docker compose -f infra/docker-compose.yml up --build

# Backend dev (with hot reload, outside Docker)
cd api && uv run uvicorn app.main:app --reload

# Frontend dev
cd web && pnpm dev

# New migration
cd api && uv run alembic revision --autogenerate -m "add foo table"
cd api && uv run alembic upgrade head

# Regenerate TS API client from OpenAPI
# NOTE: API must be running at localhost:8000 first
cd web && pnpm openapi

# Tests — require a live Postgres at DATABASE_URL (set in .env or env var)
cd api && uv run pytest -x
# Run a single test file
cd api && uv run pytest tests/test_agents_crud.py -x
cd web && pnpm test

# Lint / format
cd api && uv run ruff check . && uv run ruff format .
cd web && pnpm lint && pnpm format
```

---

## 12. Module map

Key packages under `api/app/` and what each owns:

| Package                                             | Responsibility                                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `routes/`                                         | Thin HTTP handlers — validate, delegate to services, return responses. Includes `agent_schedules.py` for `/agents/{id}/schedules` CRUD and the lazy default-workflow creation helper.                   |
| `services/`                                       | Cross-cutting logic that doesn't belong in routes or runtime (e.g.`conversation.py` builds chat history preamble for Telegram runs)                                                                        |
| `runtime/`                                        | LangGraph execution:`compiler.py` (workflow JSON → graph), `executor.py` (run lifecycle), `events.py` (event bus), `nodes/` (AgentNode, condition, terminal), `memory.py`, `pricing.py`         |
| `channels/`                                       | External messaging adapters.`base.py` defines `Channel` protocol + `register_channel()`. `telegram.py` is the only concrete implementation. Missing config = channel skipped at startup, not a crash |
| `ws/`                                             | WebSocket gateway (`gateway.py`). One route: `/ws/runs/{run_id}`. Forwards events from `runtime.events` queues to connected clients. No replay on connect                                              |
| `models/`                                         | SQLAlchemy ORM models — the only place DB rows are defined                                                                                                                                                  |
| `schemas/`                                        | Pydantic request/response schemas — one file per resource mirrors `models/`                                                                                                                               |
| `tools/`                                          | Tool implementations +`registry.py`. Tools self-register on import; `import_all_tools()` is called at lifespan startup                                                                                   |
| `db/`                                             | `session.py` (async session factory + `session_scope` context manager), `seed.py` (idempotent template seeding), `uuid7.py`                                                                          |
| `worker.py`                                       | Two background coroutines:`run_loop` (polls for PENDING runs via `SELECT … FOR UPDATE SKIP LOCKED`, dispatches to executor) and `scheduler_loop` (fires scheduled runs via croniter)                  |
| `channels/telegram.py` + `webhooks/telegram.py` | Webhook receiver lives in `webhooks/`, outbound delivery lives in `channels/`                                                                                                                            |
| `skills.py`                                       | `/agents/{id}/skills` endpoint — exposes per-agent skill config                                                                                                                                           |

Frontend layout under `web/`:

| Path                     | Responsibility                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| `app/`                 | Next.js App Router pages (`agents/`, `workflows/[id]/`, `runs/`) |
| `components/`          | App-level composites (sidebar, canvas, run-status-badge, etc.)         |
| `components/ui/`       | shadcn/ui primitives — do not edit these directly                     |
| `lib/api/schema.ts`    | Auto-generated from OpenAPI —**never hand-edit**                |
| `lib/api/client.ts`    | `openapi-fetch` wrapper used by all data hooks                       |
| `lib/api/resources.ts` | TanStack Query hooks per resource                                      |
| `hooks/`               | Custom React hooks                                                     |

---

## 13. Things to remember

- The demo is the deliverable. Polish the demo path obsessively. Leave the rest at "good enough."
- The README is read before the code. The architecture diagram is read before the README. Both must be clear.
- Reviewers will try things you didn't anticipate. Empty states, error states, and "what happens if I click this with nothing selected" matter.
- If something is slow, async it. If something is broken, fix it before adding the next thing. No half-finished features in `main`.
- When you finish a chunk of work, suggest the next smallest reasonable step — don't propose a multi-day plan.

---

*Last updated at project kickoff. Update this file whenever a decision in section 2 or a guardrail in section 3 changes.*
