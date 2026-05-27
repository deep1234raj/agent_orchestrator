# Architecture

This document expands on the layered diagram in the README. It exists to
make the architecture defensible in a code walkthrough: every decision
here can be traced back to a requirement in the brief or a constraint we
deliberately accepted.

---

## Table of contents

- [System overview](#system-overview)
- [Layer responsibilities](#layer-responsibilities)
- [Component map](#component-map)
- [Agent data model](#agent-data-model)
- [Skills — progressive disclosure](#skills--progressive-disclosure)
- [The compile step: workflow JSON → LangGraph](#the-compile-step-workflow-json--langgraph)
- [Data flow: UI-triggered run](#data-flow-ui-triggered-run)
- [Data flow: Telegram-triggered run](#data-flow-telegram-triggered-run)
- [Async communication & the message bus](#async-communication--the-message-bus)
- [The event model](#the-event-model)
- [Persistence & schema relationships](#persistence--schema-relationships)
- [Concurrency model](#concurrency-model)
- [Failure modes & recovery](#failure-modes--recovery)
- [Extensibility seams](#extensibility-seams)
- [Out-of-scope, by design](#out-of-scope-by-design)

---

## System overview

Four layers, top to bottom: **UI → API → Orchestration → Persistence**.

```
┌────────────────────────────────────────────────────────────────────┐
│  UI LAYER  (Next.js + React Flow + shadcn/ui)                      │
│  Dashboard · Agent CRUD · Workflow builder · Run viewer · Channels │
└──────────────┬───────────────────────────────────┬─────────────────┘
               │ REST (OpenAPI-generated client)   │ WebSocket
┌──────────────▼───────────────────────────────────▼─────────────────┐
│  API LAYER  (FastAPI)                                              │
│  Routers · WS gateway · Telegram webhook · Channel adapters        │
└──────────────┬─────────────────────────────────────────────────────┘
               │ async function calls (in-process)
┌──────────────▼─────────────────────────────────────────────────────┐
│  ORCHESTRATION LAYER  (LangGraph runtime)                          │
│  Compiler · Executor · Event emitter · Tool registry · Memory      │
└──────────────┬─────────────────────────────────────────────────────┘
               │ SQLAlchemy 2.0 async
┌──────────────▼─────────────────────────────────────────────────────┐
│  PERSISTENCE LAYER  (Postgres)                                     │
│  agents · workflows · runs · messages · tool_calls · usage_events  │
│  channels · schedules                                              │
└────────────────────────────────────────────────────────────────────┘
```

Each layer talks only to the one directly below. The UI never imports
runtime code; the runtime never reads HTTP. This is enforced by
directory boundaries and import linting.

---

## Layer responsibilities

### UI layer
- Render. Capture user intent. Display real-time state.
- Maintain no business logic beyond form validation and presentation.
- Every backend interaction goes through a typed client generated from
  the API's OpenAPI spec.
- Pages: Dashboard (live runs + stats), Agents, Workflows (React Flow canvas), Runs.

### API layer
- Translate HTTP and WebSocket traffic into orchestration calls.
- Validate inputs (Pydantic) and serialize outputs.
- Authenticate webhooks (Telegram secret header verification).
- Fan out WebSocket events to subscribers.
- Holds no agent logic of its own.

### Orchestration layer
- Compile workflow JSON into an executable LangGraph.
- Execute graphs, manage state, invoke tools, call LLMs.
- Emit events to the message bus on every meaningful step.
- Enforce guardrails (max iterations, max cost).

### Persistence layer
- Store everything: config, history, events.
- Provide async repositories per aggregate (`AgentRepo`, `WorkflowRepo`,
  `RunRepo`).
- Encapsulate transaction boundaries.

---

## Component map

```
api/app/
├── main.py                  FastAPI app factory, lifespan, middleware
├── routes/
│   ├── agents.py            CRUD + /agents/{id}/channels + /agents/{id}/schedules
│   ├── workflows.py         CRUD + run-trigger
│   ├── runs.py              list, get, cancel
│   ├── tools.py             list registered tools (UI dropdown)
│   └── channels.py          channel bindings CRUD (agent-bound)
├── skills.py                Skills registry (reads api/skills/*.md) + GET /skills routes
├── ws/
│   └── gateway.py           subscribe per-run, broadcast events
├── webhooks/
│   └── telegram.py          POST /webhooks/telegram/{agent_id} — fan-out to workflows
├── channels/
│   ├── base.py              Channel protocol + dispatch_send helper
│   └── telegram.py          send/receive impl using the Bot API
├── runtime/
│   ├── compiler.py          workflow JSON → LangGraph
│   ├── executor.py          run lifecycle; _deliver_via_agent() for per-bot reply
│   ├── nodes/
│   │   ├── agent_node.py    LLM invocation; _build_system_prompt(); tool restrictions
│   │   ├── condition.py     branch evaluation
│   │   └── terminal.py      end nodes
│   ├── memory.py            summary/windowed memory strategies
│   ├── pricing.py           static $/token table per provider+model
│   ├── events.py            event emit helper (writes + broadcasts)
│   └── templates/           seed workflow JSON files
├── tools/
│   ├── registry.py          @tool decorator + discovery
│   ├── web_search.py        Tavily-backed
│   ├── http_get.py
│   ├── calculator.py
│   ├── send_message.py      bridge to channels
│   ├── get_time.py
│   └── load_skill.py        progressive disclosure — load skill instructions on demand
├── models/                  SQLAlchemy ORM (see README structure)
├── schemas/                 Pydantic request/response/internal DTOs
├── db/
│   ├── base.py              DeclarativeBase + mixins
│   ├── session.py           async engine + session factory
│   ├── uuid7.py
│   └── seed.py              idempotent template seeding
└── worker.py                in-process async run-claimer + scheduler tick

api/skills/                  Skill definition files (YAML frontmatter + instructions body)
├── research.md
├── writing.md
├── analysis.md
├── math.md
└── translation.md
```

This layout is the single source of truth. New code lands in one of
these directories; if it doesn't fit, ask before inventing a new one.

```
web/
├── app/
│   ├── layout.tsx               Fonts, providers (ReactQuery, Toaster), sidebar shell
│   ├── page.tsx                 Dashboard — active runs (5s poll), health stats, quick actions
│   ├── agents/                  Agent CRUD (list + create + edit + delete)
│   ├── workflows/
│   │   ├── page.tsx             Workflow list with template badges
│   │   └── [id]/
│   │       ├── page.tsx         Workflow detail — React Flow canvas (editable), trigger-run, recent runs
│   │       └── trigger-run-dialog.tsx  POST /workflows/{id}/run → redirect to run detail
│   └── runs/
│       ├── page.tsx             Runs list (status, duration, cost, tokens, auto-refresh)
│       └── [id]/
│           ├── page.tsx         Run detail — live monitoring dashboard
│           ├── use-run-events.ts  WebSocket hook (accumulates events, tracks activeAgentId)
│           ├── event-feed.tsx   Live message + tool-call stream (scrolls to bottom)
│           └── cost-counter.tsx  Running token + USD cost display
├── components/
│   ├── workflow-canvas.tsx      React Flow canvas — 4 custom node types; condition edges color-coded
│   ├── telegram-setup-dialog.tsx  Dialog to call POST /webhooks/telegram/setup
│   ├── run-status-badge.tsx     Status → amber/green/red/grey badge
│   ├── ui/                      shadcn/ui primitives (Button, Dialog, Tabs, Badge, …)
│   ├── sidebar.tsx, page-header.tsx, empty-state.tsx
│   └── query-provider.tsx, toaster.tsx
└── lib/api/
    ├── schema.ts                Auto-generated from OpenAPI (pnpm openapi)
    ├── resources.ts             Per-entity API functions + type aliases
    └── client.ts                fetch wrapper (uniform error shape, typed via generics)
```

---

## Agent data model

In addition to the core identity and runtime fields, every `Agent` row carries four capability columns:

| Column | Type | Purpose |
|---|---|---|
| `channel_kind` | `str \| None` | Channel provider (`"telegram"`) or `null` for internal-only agents |
| `channel_config` | `JSON` | Bot credentials: `{"bot_token": "...", "webhook_secret": "..."}` |
| `skills` | `JSON list[str]` | Slugs of skill files in `api/skills/` assigned to this agent |
| `interaction_rules` | `JSON dict` | Operational, protocol, and domain rule constraints |

**`interaction_rules` shape** (all fields optional):

```json
{
  "allowed_tools": ["web_search"],
  "denied_tools": ["http_get"],
  "no_pii": true,
  "require_human_approval": false,
  "human_approval_actions": ["send_message"],
  "authorized_delegators": ["OrchestratorAgent"],
  "proactive_disclosure": true,
  "output_format": "markdown",
  "tone": "formal",
  "response_language": "en",
  "forbidden_topics": ["politics"],
  "domain_rules": ["Never book on Sundays."]
}
```

`AgentNode._build_system_prompt(agent)` compiles these at run time into:

```
[base system prompt]

[Available Skills]
- Research (research): Deep investigation using web search and HTTP sources.
...

[Interaction Rules]
- Output format: markdown
- Tone: formal
- Never book on Sundays.
```

The `allowed_tools`/`denied_tools` fields are enforced *before* the LLM call by filtering the tool schema list — the model never even sees denied tools.

---

## Skills — progressive disclosure

Skills are named capability packages stored as Markdown files with YAML frontmatter:

```
api/skills/{slug}.md
─────────────────────────────────────────────────────
---
name: Research
slug: research
description: Deep investigation using web search and HTTP sources.
---

When researching a topic, follow this procedure:
1. Gather sources...
```

**Registry loading** — `app/skills.py` reads all `api/skills/*.md` files at import time into `SKILLS_REGISTRY: dict[str, SkillSpec]`.

**Three-tier disclosure flow:**

```
1. AgentNode._build_system_prompt()
      └─ get_skills_overview(agent.skills)
           └─ Adds [Available Skills] block: slug + description only
                (keeps system prompt small — no full instructions yet)

2. Model decides it needs a skill and calls:
      load_skill(slug="research")

3. load_skill tool (auto-injected when agent.skills is non-empty)
      └─ Returns full instructions from SKILLS_REGISTRY[slug].instructions
           └─ Model now has the complete procedure in context
```

This pattern avoids prepopulating context with skill instructions that may never be used. A complex agent with 5 skills only pays the token cost for the skills it actually exercises.

**Custom skills:** create `api/skills/{new_slug}.md` and restart the API. No code change needed.

---

## The compile step: workflow JSON → LangGraph

This is the architecturally most interesting piece of the system.

The UI stores workflows as **React Flow documents**: a list of nodes
(each with a `type` and a `data` payload) and a list of edges (each
optionally carrying a condition expression). We persist this verbatim so
the editor round-trips losslessly.

At run time, `runtime/compiler.py` turns that document into a
`langgraph.graph.StateGraph`:

```
React Flow document          LangGraph
─────────────────────        ──────────────────────────────
node {type: "start"}    →    entry point
node {type: "agent",    →    AgentNode bound to that agent's
      data: {agent_id}}      config; emits messages on the bus
node {type: "condition",→    conditional edge evaluator returning
      data: {expr}}          the name of the next node
node {type: "end"}      →    terminal; sets run.output and exits
edge a → b              →    add_edge(a, b)
edge a -[cond]→ b       →    add_conditional_edges(a, evaluator,
                                                   {true: b, false: …})
```

The compiled graph is **per-run** — we don't cache compiled graphs
across runs, because agents are mutable rows and we want every run to
reflect the latest config. Compilation is cheap (<1ms for typical
graphs).

State passed between nodes is a `RunState` Pydantic model containing
the run's accumulated messages, the latest agent output, and a free-form
`context` dict for inter-node data. Each agent node reads the state,
calls the LLM, may invoke tools, appends new messages, and returns the
updated state.

---

## Data flow: UI-triggered run

```
User clicks "Run" in the workflow viewer
        │
        ▼
POST /workflows/{id}/run          ─── API route
        │
        ▼
RunRepo.create(status=PENDING)    ─── persistence
        │
        ▼
worker.enqueue(run_id)            ─── in-process async queue
        │
   returns 202 with run_id
        │
        ▼ (immediately)
UI navigates to /runs/{id}
        │
        ▼
UI opens WS to /ws/runs/{id}      ─── subscribes to events
        │
        ▼
Worker picks up run               ─── executor
        │
        ▼
status → RUNNING                  ─── event emitted, fanned out to WS
        │
        ▼
Compiler builds LangGraph from workflow.graph
        │
        ▼
Executor invokes graph.astream() ─── async iterator of node outputs
        │
        ▼ (for each node step)
emit event: agent_started / message / tool_call / token_usage
        │
        ▼
status → SUCCEEDED, output set    ─── final event
```

The UI sees the run "fill in" live because each event hits the WS as
soon as it's written.

---

## Data flow: Telegram-triggered run

```
User messages the bot on Telegram
        │
        ▼
Telegram POSTs to POST /webhooks/telegram/{agent_id}
        │
        ▼
Webhook handler:
  1. Loads agent from DB — must exist with channel_kind == "telegram"
  2. Verifies X-Telegram-Bot-Api-Secret-Token against agent.channel_config.webhook_secret
  3. Parses Update → extracts text, chat_id, sender_name
        │
        ▼
SELECT workflows WHERE graph::text CONTAINS agent_id
        │ (returns all workflows that reference this agent as a node)
        ▼
Fan-out: for each matching workflow
  ├─ Build conversation preamble from prior runs in this chat
  ├─ RunRepo.create(input={
  │     "input": preamble + text,
  │     "channel": "telegram",
  │     "chat_id": chat_id,
  │     "triggering_agent_id": str(agent_id)
  │   }, trigger="telegram")
  └─ worker.enqueue(run_id)
        │
   returns 200 {"status": "queued", "run_ids": [...]} to Telegram
        │
        ▼  (each run executes exactly as the UI-triggered case)
        │
        ▼
executor._execute() — at completion:
  _channel = run.input["channel"]           # "telegram"
  _triggering_agent_id = run.input[...]     # the agent_id from the webhook

  _deliver_via_agent(agent_id, channel_kind="telegram", message)
      ├─ Loads agent from DB
      ├─ Reads agent.channel_config["bot_token"]
      ├─ TelegramChannel(bot_token=...).send(ChannelMessage(chat_id, text=reply))
      └─ Posts back to Telegram's Bot API using that agent's own credentials
        │
        ▼
User sees the reply in Telegram (one reply per workflow that completed).
The full conversation is also visible in /runs/{id} in the UI.
```

**Key design invariant:** There is no globally shared bot token. Each channel agent owns its own `bot_token` in `channel_config`. This means different agents can operate different bots, and multiple bots can coexist in the same platform without credential conflicts.

---

## Async communication & the message bus

The brief requires asynchronous agent communication. We satisfy this
by treating the `messages` table as the **bus**:

- Agents never invoke each other directly. They emit messages.
- The LangGraph executor reads the latest state (including new messages)
  and routes to the next node based on graph edges.
- A node can write a message and return immediately; downstream nodes
  pick it up when they execute.
- Persistence is *prior to* broadcast — we write to Postgres first, then
  emit on the WS. A reviewer can disconnect the UI mid-run and still see
  the full history when they reload.

This design also makes runs trivially **replayable**: re-emit the
messages in order and you've reconstructed the run for the UI.

---

## The event model

Every event flowing on the WebSocket has a normalized envelope:

```json
{
  "run_id": "uuid",
  "ts": "2026-05-27T14:33:01Z",
  "type": "message" | "tool_call" | "tool_result" | "agent_started" |
          "agent_finished" | "usage" | "status",
  "payload": { ... }
}
```

Event types map 1:1 to insertable rows in `messages`, `tool_calls`,
`usage_events`, or status transitions on `runs`. The UI dispatches on
`type` to update the appropriate panel: the message timeline, the tool
inspector, the cost meter, the status badge.

---

## Persistence & schema relationships

```
┌─────────────────────────────────────────────────────────────┐
│  agents                                                      │
│  id · name · role · system_prompt · model · tools · memory  │
│  channel_kind · channel_config · skills · interaction_rules  │
└──────┬──────────────────────────────────────────────────────┘
       │ one-to-many                        │ one-to-many
       ▼                                    ▼
┌─────────────┐                    ┌──────────────────────────┐
│  channels   │                    │  (agent referenced by    │
│  agent_id   │                    │   workflow.graph JSON)   │
│  kind       │                    └──────────────────────────┘
│  external_id│
└─────────────┘

┌────────────┐   ┌─────────────┐   ┌──────────────┐
│ workflows  │──▶│    runs     │──▶│   messages   │
└─────┬──────┘   └──────┬──────┘   └──────────────┘
      │                 │
      │                 ├────────▶ tool_calls
      │                 └────────▶ usage_events
      │
      └────────▶ schedules
```

Key FK relationships:

- `channels.agent_id` → `agents.id` CASCADE DELETE — a channel is deleted when its agent is deleted.
- `workflows` and `agents` are decoupled at the FK level. The relationship is encoded in `workflow.graph` as JSON (agent IDs appear as node `data.agent_id`). The webhook fan-out query (`graph::text CONTAINS agent_id`) exploits this text encoding.
- All FKs cascade on delete from `runs` downward — deleting a run removes its messages, tool calls, and usage events.
- Deleting an agent does **not** cascade-delete messages it authored; `messages.agent_id` is `ON DELETE SET NULL` so history survives.
- UUID v7 primary keys give time-ordered IDs: `ORDER BY id` ≡ `ORDER BY created_at` for fast paging.

See `api/app/models/` for the authoritative schema.

---

## Concurrency model

- **API process**: one FastAPI app, async throughout.
- **Worker**: a coroutine spawned in the FastAPI `lifespan` context.
  Polls the `runs` table every second for `status=PENDING` rows, claims
  one with a `SELECT … FOR UPDATE SKIP LOCKED` query, and executes it.
- **Multiple workers**: the SKIP LOCKED pattern means scaling is just
  "run more workers" — no leader election needed. For v1 we run one.
- **Scheduler tick**: a second coroutine wakes every 60s, finds
  `schedules` with `next_fire_at <= now()`, creates runs, and advances
  `next_fire_at` using `croniter`.

Why in-process instead of Celery or RQ? The brief requires a single
local setup command. A separate worker process means another container,
another health check, another failure mode — for no real benefit at the
demo scale we operate at. The seam to extract a worker process is
clean: replace the in-process queue with a Postgres queue (already
implicit) or Redis Streams, and run the worker as its own service.

---

## Failure modes & recovery

| Failure | Behavior |
|---|---|
| LLM call rate-limited | Tenacity retry with exponential backoff (max 3); on exhaustion, run fails with the provider error preserved in `runs.error`. |
| Tool exception | Captured in `tool_calls.error`, agent receives a structured tool error, can recover or fail. |
| Worker crash mid-run | Run row remains `RUNNING`. A startup sweep marks stale `RUNNING` runs (older than N minutes) as `FAILED` with `error="orphaned"`. |
| Postgres down | API returns 503 on dependent routes; worker pauses with backoff. |
| Telegram API down | Outbound message is retried; if it permanently fails, the failure is logged on the run but the run still completes. |
| Guardrail tripped (max iterations / cost) | Run terminates with `status=FAILED` and a descriptive error; partial outputs remain visible. |

---

## Extensibility seams

The system was designed so the most likely extensions are one-file
additions:

- **New tool**: drop a module in `api/app/tools/`, decorate the
  function with `@tool`, it appears in the agent config dropdown.
- **New channel**: implement `api/app/channels/base.Channel` (receive,
  send, verify), add a webhook route, register a `ChannelKind`.
- **New node type** (e.g. parallel fan-out): add a node implementation
  under `runtime/nodes/`, teach the compiler about the new `type`
  string, add the corresponding React Flow node component on the web
  side.
- **New LLM provider**: register a client in `runtime/providers/`,
  add price entries to `runtime/pricing.py`, and it becomes selectable
  per agent.

---

## Out-of-scope, by design

These are the deliberate omissions. Each was considered and excluded.

- **Auth / multi-tenancy** — single-user local product; auth would 2x
  the surface area for zero demo value.
- **Vector memory / RAG** — summary memory is enough for the demo
  workflow; pgvector is the obvious upgrade path.
- **Distributed workers / queues** — in-process is correct at this
  scale; the seam to extract is clean.
- **Workflow versioning** — last-write-wins; runs snapshot the graph at
  trigger time (via `runs.input` carrying the resolved graph) so
  history isn't destabilized by edits.
- **Observability stack (OTel, Prometheus)** — structured logs are
  enough; OTel can layer in without touching business code.
