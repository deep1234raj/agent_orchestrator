# AI Agent Orchestration Platform

> Build, configure, and orchestrate collaborative AI agents that run on a real runtime, execute real tools, and talk to humans through Telegram.

<!-- Replace with a real GIF once recorded -->
<!-- ![demo](docs/demo.gif) -->

---

## Table of Contents

- [What this is](#what-this-is)
- [Quickstart](#quickstart)
- [Architecture](#architecture)
- [Technology choices](#technology-choices)
- [Project structure](#project-structure)
- [Key flows](#key-flows)
- [Configuration](#configuration)
- [Extending the platform](#extending-the-platform)
- [Testing](#testing)
- [What I'd build next](#what-id-build-next)

---

## What this is

A local-first platform where a user can:

1. **Create AI agents** through a web UI — name, role, system prompt, model, tools, memory, guardrails.
2. **Compose them into workflows** with a visual graph editor supporting conditions and feedback loops.
3. **Run those workflows** on a real agent runtime (LangGraph) that executes real tools (web search, HTTP, calculator, etc.).
4. **Talk to an agent from Telegram** and watch the multi-agent collaboration unfold live in the dashboard.
5. **Inspect every run** — inter-agent messages, tool calls, token usage, and cost — in real time and after the fact.

The whole system runs locally with one command. No cloud account required.

---

## Quickstart

```bash
# 1. Clone
git clone <repo-url> aaop && cd aaop

# 2. Configure
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TAVILY_API_KEY

# 3. Run
docker compose up --build
```

Once up:

- Web UI → http://localhost:3000
- API → http://localhost:8000 (docs at `/docs`)
- Postgres → localhost:5432

**Telegram setup** (one-time):

1. Talk to [@BotFather](https://t.me/BotFather), create a bot, copy the token into `.env` as `TELEGRAM_BOT_TOKEN`.
2. Choose any random string for `TELEGRAM_WEBHOOK_SECRET` and put it in `.env`.
3. Start an [ngrok](https://ngrok.com/) tunnel: `ngrok http 8000`.
4. Register the webhook with Telegram:
   ```bash
   curl -F "url=https://<your-ngrok>.ngrok-free.app/webhooks/telegram" \
        -F "secret_token=<your-secret>" \
        https://api.telegram.org/bot<TOKEN>/setWebhook
   ```
5. In the web UI, bind the bot to a workflow via **Channels** → **New** (use external_id `*` to accept any chat, or a specific chat_id).
6. Message your bot. The seeded "Research & Brief" workflow runs end-to-end and the Critic agent delivers the final brief back to Telegram.

**Pre-built workflows** (seeded automatically on first boot, idempotent):

- **Research & Brief** — Researcher → Writer → Critic with a feedback loop. Triggered from Telegram. The canonical demo flow.
- **Daily Standup Summarizer** — single agent on a cron schedule. Demonstrates scheduling.

Both are editable in the UI; seeding never overwrites changes you make.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  UI LAYER  (Next.js + React Flow + shadcn/ui)                   │
│  • Agent CRUD  • Workflow builder  • Live monitoring  • Runs    │
└───────────────┬──────────────────────────────┬──────────────────┘
                │ REST                         │ WebSocket
┌───────────────▼──────────────────────────────▼──────────────────┐
│  API LAYER  (FastAPI)                                            │
│  • CRUD endpoints  • WS gateway  • Telegram webhook              │
└───────────────┬──────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│  ORCHESTRATION LAYER  (LangGraph runtime)                        │
│  • Compiles workflow JSON → LangGraph                            │
│  • Executes nodes async  • Streams events to WS                  │
│  • Writes inter-agent messages to the bus                        │
└───────────────┬──────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│  PERSISTENCE LAYER  (Postgres)                                   │
│  agents · workflows · runs · messages · tool_calls · usage       │
└──────────────────────────────────────────────────────────────────┘
```

**Layer boundaries are strict.** UI never talks to the runtime directly; the runtime never reads from HTTP. Each layer has a single responsibility, which is what makes the system testable and extensible.

### Concurrency model

- The API process accepts requests and enqueues workflow runs.
- A separate async worker (in-process for the demo, easily extractable) executes runs.
- Each run streams events to a Postgres-backed message bus; the WS gateway fans those out to subscribed UI clients.
- Agents communicate **asynchronously** via the message bus — they never block on each other directly.

---

## Technology choices

| Layer | Choice | Why this, not the alternative |
|---|---|---|
| **Agent runtime** | LangGraph | Graph-based with conditional edges and cycles — maps 1:1 to a visual workflow builder. CrewAI is role-based and harder to visualize as a graph. AutoGen is conversation-centric, awkward for structured flows. LangGraph also has the strongest checkpointing story. |
| **Backend** | Python + FastAPI | LangGraph is Python-native. FastAPI gives async, WebSockets, OpenAPI docs out of the box. |
| **Frontend** | Next.js (App Router) + TypeScript | Server components for the dashboard, client components for the interactive builder. Familiar to any reviewer. |
| **UI kit** | Tailwind + shadcn/ui | Production-grade components without the bloat of a full framework. |
| **Graph editor** | React Flow (xyflow) | Industry standard. Building this from scratch is a time sink with no upside. |
| **Persistence** | Postgres + SQLAlchemy + Alembic | One database for everything — config, history, message bus. No Redis until proven necessary. |
| **Real-time** | WebSockets (FastAPI) | Native, simple, no extra service. |
| **Messaging channel** | Telegram | Zero friction: bot in 60s via BotFather, ngrok for local webhooks. WhatsApp requires Meta Business approval. Slack works but is more setup. |
| **LLM** | Anthropic Claude (default) + OpenAI (configurable per agent) + Ollama | Per-agent model choice is a hard requirement; defaulting to Claude shows the platform working with itself. |
| **Packaging** | Docker Compose | Single command, runs anywhere Docker runs. |

---

## Project structure

```
aaop/
├── api/                      # FastAPI backend
│   ├── app/
│   │   ├── main.py           # FastAPI entrypoint
│   │   ├── routes/           # REST endpoints (agents, workflows, runs)
│   │   ├── ws/               # WebSocket gateway
│   │   ├── webhooks/         # Telegram webhook
│   │   ├── runtime/          # LangGraph executor + compiler
│   │   ├── tools/            # Real tool implementations
│   │   ├── channels/         # Channel adapters (Telegram, …)
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   └── db/               # Engine, session, migrations
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
│
├── web/                      # Next.js frontend
│   ├── app/
│   │   ├── agents/           # Agent CRUD + playground
│   │   ├── workflows/        # Builder + list
│   │   ├── runs/             # Run history + live view
│   │   └── page.tsx          # Dashboard
│   ├── components/
│   ├── lib/                  # API client, WS hook
│   └── package.json
│
├── infra/
│   └── docker-compose.yml
│
├── docs/
│   ├── architecture.png
│   └── demo.gif
│
├── .env.example
├── CLAUDE.md                 # Operating manual for AI-assisted dev
└── README.md
```

---

## Key flows

### Creating and running a workflow

1. User creates agents in the UI → API persists them.
2. User drags agents onto the workflow canvas, wires edges (with optional conditions), saves → API stores workflow JSON.
3. User clicks **Run** (or a Telegram message arrives) → API creates a `run` row, enqueues it.
4. Runtime compiles the workflow JSON into a LangGraph, executes node-by-node.
5. Every agent step, tool call, and inter-agent message is written to Postgres *and* streamed to the WS gateway.
6. UI live-view subscribes to the WS topic for that run and renders events as they arrive.

### Telegram message → multi-agent response

1. Telegram POSTs to `/webhooks/telegram`.
2. Webhook handler looks up the workflow bound to that bot, creates a run with the message as initial input.
3. Workflow executes (e.g., Researcher → Writer → Critic → loop or done).
4. Final output is sent back to Telegram via the Bot API.
5. The conversation is also visible in the UI's Runs view.

---

## Configuration

Every agent supports:

- **Identity** — name, role, system prompt
- **Model** — provider + model id + temperature + max tokens
- **Tools** — pick from registered tools (web search, http_get, calculator, …)
- **Memory** — none / summary / windowed (last N turns)
- **Schedule** — optional cron expression for triggered runs
- **Guardrails** — max iterations per run, max cost per run, content filter on/off
- **Channels** — which external channels (Telegram, …) this agent listens on

All of these are editable from the UI. None require a redeploy.

---

## Extending the platform

### Add a new tool

1. Create `api/app/tools/my_tool.py` with a function decorated `@tool` (LangChain-compatible signature).
2. Register it in `api/app/tools/__init__.py`.
3. It appears in the agent configuration dropdown automatically.

### Add a new messaging channel

1. Implement the `Channel` protocol in `api/app/channels/` (methods: `receive`, `send`, `verify_webhook`).
2. Add a webhook route under `api/app/webhooks/`.
3. Add a channel option to the agent config UI.

### Add a new workflow template

1. Create a JSON file in `api/app/runtime/templates/`.
2. It's seeded on next startup and shows up in the "New from template" menu.

---

## Testing

```bash
# Backend
cd api && pytest

# Frontend
cd web && pnpm test
```

Coverage focuses on critical paths:

- Agent CRUD round-trip
- Workflow compile → execute → persist
- Telegram webhook → run creation → response delivery
- WS event fan-out

---

## What I'd build next

Scoped out deliberately to keep the demo crisp:

- **Auth & multi-tenancy** — single-user only today.
- **Vector memory / RAG** — current memory is summary-based; a pgvector-backed long-term memory is the natural next step.
- **Distributed runtime** — the async worker is in-process; extracting it behind a queue (Redis/SQS) is a one-day job once needed.
- **More channels** — WhatsApp (Meta Business approval willing) and Slack share the `Channel` interface.
- **Workflow versioning + rollback** — currently last-write-wins.
- **Eval harness** — automated regression tests on workflow outputs against golden answers.

---

## License

MIT
