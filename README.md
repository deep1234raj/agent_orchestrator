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
- [What I&#39;d build next](#what-id-build-next)

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

1. Talk to [@BotFather](https://t.me/BotFather), create a bot, copy the token.
2. In the web UI, open **Agents** → open the agent you want as the Telegram entry point (e.g., the Researcher) → expand the **Channel** section → set kind to `telegram`, paste the bot token, optionally set a webhook secret, and **Save**.
3. Start an [ngrok](https://ngrok.com/) tunnel: `ngrok http 8000`.
4. Register the webhook URL with Telegram:
   ```bash
   curl -F "url=https://<your-ngrok>.ngrok-free.app/webhooks/telegram/<AGENT_ID>" \
        -F "secret_token=<your-webhook-secret>" \
        https://api.telegram.org/bot<TOKEN>/setWebhook
   ```
   The agent's edit page shows the exact webhook URL to use — copy it from the **Webhook URL** panel.
5. In the web UI, create a routing rule via **Channels** → **New Channel** — pick the channel agent and use external_id `*` to accept any chat (or a specific `chat_id` to restrict).
6. Message your bot. Every active workflow that contains the channel agent fires simultaneously; the Critic delivers the final brief back to Telegram via that agent's own bot token.

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

| Layer                       | Choice                                                                | Why this, not the alternative                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent runtime**     | LangGraph                                                             | Graph-based with conditional edges and cycles — maps 1:1 to a visual workflow builder. CrewAI is role-based and harder to visualize as a graph. AutoGen is conversation-centric, awkward for structured flows. LangGraph also has the strongest checkpointing story. |
| **Backend**           | Python + FastAPI                                                      | LangGraph is Python-native. FastAPI gives async, WebSockets, OpenAPI docs out of the box.                                                                                                                                                                             |
| **Frontend**          | Next.js (App Router) + TypeScript                                     | Server components for the dashboard, client components for the interactive builder. Familiar to any reviewer.                                                                                                                                                         |
| **UI kit**            | Tailwind + shadcn/ui                                                  | Production-grade components without the bloat of a full framework.                                                                                                                                                                                                    |
| **Graph editor**      | React Flow (xyflow)                                                   | Industry standard. Building this from scratch is a time sink with no upside.                                                                                                                                                                                          |
| **Persistence**       | Postgres + SQLAlchemy + Alembic                                       | One database for everything — config, history, message bus. No Redis until proven necessary.                                                                                                                                                                         |
| **Real-time**         | WebSockets (FastAPI)                                                  | Native, simple, no extra service.                                                                                                                                                                                                                                     |
| **Messaging channel** | Telegram                                                              | Zero friction: bot in 60s via BotFather, ngrok for local webhooks. WhatsApp requires Meta Business approval. Slack works but is more setup.                                                                                                                           |
| **LLM**               | Anthropic Claude (default) + OpenAI (configurable per agent) + Ollama | Per-agent model choice is a hard requirement; defaulting to Claude shows the platform working with itself.                                                                                                                                                            |
| **Packaging**         | Docker Compose                                                        | Single command, runs anywhere Docker runs.                                                                                                                                                                                                                            |

---

## Project structure

```
aaop/
├── api/                      # FastAPI backend
│   ├── app/
│   │   ├── main.py                 # App factory + lifespan (worker, scheduler, seeder)
│   │   ├── config.py               # Pydantic-settings env loader
│   │   ├── errors.py               # Domain exceptions + HTTP handlers
│   │   ├── worker.py               # In-process run dispatcher + scheduler tick
│   │   ├── logging_config.py       # structlog setup
│   │   ├── routes/                 # REST endpoints (agents, workflows, runs, tools, channels)
│   │   ├── ws/gateway.py           # WebSocket per-run event stream
│   │   ├── webhooks/telegram.py    # Inbound Telegram messages → runs
│   │   ├── runtime/                # LangGraph compiler + executor + nodes
│   │   │   ├── compiler.py         # Workflow JSON → StateGraph
│   │   │   ├── executor.py         # Run lifecycle + guardrail enforcement
│   │   │   ├── events.py           # Persist + broadcast event bus
│   │   │   ├── llm.py              # Provider abstraction (Anthropic; OpenAI seam)
│   │   │   ├── memory.py           # Memory strategies (none / windowed / summary)
│   │   │   ├── pricing.py          # $/token table
│   │   │   ├── state.py            # RunState passed between nodes
│   │   │   ├── nodes/              # agent_node, condition, terminal
│   │   │   └── templates/          # Pre-built workflows (JSON, seeded on boot)
│   │   ├── tools/                  # Tool registry + implementations
│   │   │   ├── registry.py         # @tool decorator + lookup
│   │   │   └── *.py                # web_search, http_get, calculator, get_time, send_message
│   │   ├── channels/               # Channel adapters
│   │   │   ├── base.py             # Channel protocol
│   │   │   └── telegram.py         # Bot API adapter
│   │   ├── services/conversation.py # Cross-run conversation preamble
│   │   ├── models/                 # SQLAlchemy 2.0 ORM
│   │   ├── schemas/                # Pydantic request/response
│   │   └── db/                     # Engine, session, UUID v7, seeder
│   ├── alembic/                    # Migrations
│   └── pyproject.toml
│
├── web/                            # Next.js 16 + TypeScript + Tailwind
│   ├── app/
│   │   ├── layout.tsx              # Fonts, providers, sidebar shell
│   │   ├── page.tsx                # Dashboard (live runs, stats, quick actions)
│   │   ├── error.tsx, not-found.tsx
│   │   ├── agents/                 # Agents CRUD (list + edit)
│   │   └── channels/               # Channels CRUD (list + create + edit + delete)
│   ├── components/
│   │   ├── ui/                     # Hand-styled primitives (Button, Dialog, …)
│   │   ├── sidebar.tsx, page-header.tsx, empty-state.tsx
│   │   └── query-provider.tsx, toaster.tsx
│   ├── lib/
│   │   ├── api/                    # Typed fetch client + per-entity functions
│   │   └── utils.ts                # cn() helper
│   └── package.json
│
├── infra/docker-compose.yml
├── docs/architecture.md            # Deep architecture document
├── .env.example
├── CLAUDE.md                       # Operating manual for AI-assisted dev
└── README.md
```

---

## Implementation status

This is a checkpoint snapshot. Tracks what's built, what's stubbed, and what's planned — useful for reviewers and for AI-assisted continuation.

**Done end-to-end**

- Postgres schema (7 tables) + Alembic migration + UUID v7 PKs
- LangGraph runtime: compiler, executor, agent node with tool-calling loop, condition node, terminal node
- Memory strategies (none / windowed / summary)
- Event system: persists to DB → broadcasts to in-process pub/sub → WebSocket fans out
- Worker with `SELECT … FOR UPDATE SKIP LOCKED` claim pattern + orphan sweep on startup
- Scheduler tick (croniter) for cron-triggered workflows
- Cost tracking (per call → per agent → per run rollup)
- Guardrails (max_iterations, max_cost_usd) enforced between graph steps
- Cooperative cancellation via `POST /runs/{id}/cancel`
- REST API: agents, workflows, runs, tools, channels (full CRUD where applicable)
- WebSocket gateway at `/ws/runs/{id}`
- Telegram webhook with per-agent bot credentials, fan-out to all containing workflows, per-agent reply delivery
- `POST /webhooks/telegram/{agent_id}` — agent-bound webhook route
- Agent channel credentials (`channel_kind`, `channel_config`) — one agent = one bot
- Skills system: 5 built-in skills (`research`, `writing`, `analysis`, `math`, `translation`) + custom skill support via `api/skills/*.md`; progressive disclosure via `load_skill` tool
- Interaction rules (3 categories): operational tool constraints, communication protocols, domain/SOP rules — all compiled into system prompt at runtime
- `GET /agents/{id}/channels` and `GET /agents/{id}/schedules` sub-resource endpoints
- `GET /skills` and `GET /skills/{slug}` skill registry API
- 5 working tools: web_search (Tavily), http_get, calculator, get_time, send_message
- 2 seed templates (Research & Brief, Daily Standup Summarizer) — idempotent
- Web: foundation (Tailwind, fonts, providers, layout, sidebar, error/404)
- Web: Agents page (list, create, edit, delete) with Channel, Skills, and Interaction Rules sections
- Web: Agent edit page — webhook URL panel, Channel Routing Rules panel, Schedules panel
- Web: Workflow builder — React Flow canvas with drag-to-reposition, Save Layout, Trigger Run dialog, recent-runs table; condition edges color-coded (green = true, red = false)
- Web: Runs view — list page (status, duration, cost, tokens) + live monitoring dashboard (WebSocket event feed, active-node highlight in React Flow, cost/token counter)
- Web: Channels page — list, create (agent-only picker), edit, delete with confirmation
- Web: Dashboard — live active-runs section (5s polling), system health counts, all-time stats (total runs, cost, success rate), quick-action buttons
- Docker Compose with health checks; one-command boot
  **Stubbed (interface in place, body deferred)**
- OpenAI LLM provider — `get_provider("openai")` raises clearly; Anthropic works
- Slack / WhatsApp channels — registered in the enum, not implemented
  **Not built yet (planned next)**
- Pytest suite (smoke tests exist but aren't running in CI)

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

1. Telegram POSTs to `POST /webhooks/telegram/{agent_id}`.
2. Webhook handler verifies the agent's `webhook_secret` (if configured).
3. Finds all active workflows whose graph contains that agent.
4. Creates one Run per matching workflow (fan-out), each storing `triggering_agent_id`.
5. Each workflow executes (e.g., Researcher → Writer → Critic → loop or done).
6. Each run delivers its final reply via the triggering agent's own bot token — no shared global token.
7. The conversation is visible in the UI's Runs view; multiple simultaneous runs appear as separate entries.

---

## Configuration

Every agent supports:

- **Identity** — name, role, system prompt
- **Model** — provider + model id + temperature + max tokens
- **Tools** — pick from registered tools (web search, http_get, calculator, …)
- **Memory** — none / summary / windowed (last N turns)
- **Guardrails** — max iterations per run, max cost per run
- **Channel** — make this agent a bot entry point (`channel_kind` + bot credentials)
- **Skills** — select named skills the agent can load on demand
- **Interaction Rules** — behavioural constraints compiled into the system prompt at runtime

All of these are editable from the UI. None require a redeploy.

---

## Agent Capabilities

### Channel Agents

An agent can own a specific bot identity by configuring `channel_kind` (e.g., `telegram`) and credentials (`bot_token`, optional `webhook_secret`). One agent = one bot.

When a Telegram message arrives at `POST /webhooks/telegram/{agent_id}`, the system:
1. Verifies the agent exists and owns a Telegram bot.
2. Finds **all active workflows** whose graph contains that agent as a node.
3. Creates one `Run` per matching workflow (fan-out), storing `triggering_agent_id` in each run's input.
4. On completion, delivers the final reply back to Telegram using **that agent's own bot credentials** (not a global token).

This means a single incoming message can simultaneously trigger multiple workflows, and each delivers its own reply through the same bot.

### Skills (Progressive Disclosure)

Skills are modular capability packages stored as `api/skills/{slug}.md` files:

```
---
name: Research
slug: research
description: Deep investigation using web search and HTTP sources.
---

When researching a topic, follow this procedure: ...
```

When an agent has skills configured:
- The system prompt gains an `[Available Skills]` block listing slug + description.
- A `load_skill` tool is auto-injected; the agent calls `load_skill("research")` when it needs the full procedure.
- Full instructions are only loaded when used — keeping context lean.

To add a custom skill: create `api/skills/{new_slug}.md` and restart the API. The registry auto-discovers all `.md` files in that directory.

### Interaction Rules

Three categories of behavioural constraints compiled into the system prompt at runtime:

| Category | Fields | Enforcement |
|---|---|---|
| **Operational** | `allowed_tools`, `denied_tools`, `no_pii` | AgentNode filters tool list before LLM call |
| **Protocols** | `require_human_approval`, `authorized_delegators`, `proactive_disclosure` | Injected as system-prompt instructions |
| **Domain / SOPs** | `output_format`, `tone`, `response_language`, `forbidden_topics`, `domain_rules` | Injected as system-prompt bullet points |

All three categories are configurable from the agent edit form.

---

## Extending the platform

### Add a new tool

1. Create `api/app/tools/my_tool.py` with a function decorated `@tool` (LangChain-compatible signature).
2. Register it in `api/app/tools/__init__.py`.
3. It appears in the agent configuration dropdown automatically.

### Add a custom skill

1. Create `api/skills/{slug}.md` with YAML frontmatter (`name`, `slug`, `description`) and a Markdown instructions body.
2. Restart the API. The skills registry auto-discovers all `.md` files in `api/skills/`.
3. The skill appears in the Skills section of the agent edit form.

### Add a new messaging channel

1. Implement the `Channel` protocol in `api/app/channels/` (methods: `receive`, `send`, `verify_webhook`).
2. Add a webhook route under `api/app/webhooks/` following the `POST /webhooks/{kind}/{agent_id}` pattern.
3. Add the new `ChannelKind` enum value and the channel option to the agent config UI.

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
