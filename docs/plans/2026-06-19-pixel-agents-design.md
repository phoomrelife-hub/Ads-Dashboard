# Pixel Agents — Design

Date: 2026-06-19
Project: `D:\ERP\ads-dashboard` (Next.js 16.2.9, React 19, Tailwind v4, framer-motion)

## Concept

A new top nav page — **Agents** — placed above "Ads Management". It renders an
editable, game-like **pixel office**. You add AI agent characters, each configured
with its own AI provider + API key. Click an agent to open a chat popup; the agent
can read your Facebook ads data and propose actions (open/close ads, change budget,
navigate the dashboard). Inspired by github.com/pixel-agents-hq/pixel-agents, but as
a real control surface over the ads data rather than a passive visualizer.

## Decisions (from brainstorming)

- **Provider:** multi-provider — each agent picks Anthropic (Claude) or OpenAI at creation.
- **Action safety:** propose → user confirms. No write hits Facebook without an explicit Confirm click.
- **Room:** full game-like office — walking characters, BFS pathfinding, desks, edit-able layout.
- **Storage:** server-side JSON file (`agents-store.json`). API keys stored server-side, never returned to the browser (redacted as `••••`). AI calls proxied through Next route handlers.
- **Tools (v1):** read ad data, pause/activate, change budget, navigate dashboard.
- **Default models:** Claude → `claude-opus-4-8`; OpenAI → `gpt-4o`.

## Architecture

### Server / data
- `app/api/agents/route.ts` — CRUD for agents + office layout → `agents-store.json` (sibling of `accounts-cache.json`). GET redacts API keys.
- `app/api/agents/chat/route.ts` — agent brain: load agent (provider/key/system prompt) server-side, run model with tool-calling, return text + proposed write actions. Read tools auto-execute server-side and loop; write tools pause and return as proposals.
- `app/api/agents/act/route.ts` — execute a *confirmed* write action against FB (`set_status`, `set_budget`).
- `lib/agents/store.ts` — read/write the JSON store, key redaction helper.
- `lib/agents/providers.ts` — `runTurn(agent, messages, tools)` adapter; branches Anthropic `/v1/messages` vs OpenAI `/chat/completions`, normalized to `{ text, toolCalls[] }`.
- `lib/agents/tools.ts` — JSON tool schemas + executors for read tools; write tools flagged as proposals.

### Agent record
```
{ id, name, spriteId, color, provider, model, apiKey (server-only),
  systemPrompt, scope:{accountId}, pos:{x,y}, deskId, createdAt }
```

### Office layout
```
office: { cols, rows, tiles:number[], furniture:[{id,type,x,y,facing}] }
```

### Client
- `app/agents/page.tsx` — assembles the room + toolbar.
- `components/agents/office-canvas.tsx` — Canvas 2D renderer, rAF loop, procedural pixel tiles + characters, BFS pathfinding, status-driven animation (idle/walking/thinking/acting), speech bubble on "needs confirm".
- `components/agents/agent-create-modal.tsx` — name/color/sprite, provider+model, API key (password, test-key ping), scoped account, system prompt.
- `components/agents/agent-chat.tsx` — framer-motion chat popup; message stream, thinking indicator, inline proposed-action confirm/cancel card.
- `components/agents/edit-toolbar.tsx` — paint floor/wall/carpet, place/remove desk, move agent, save, add agent.

### Guardrails
- Every write validates target `id` belongs to the agent's scoped `accountId`.
- Agent `scope.accountId` injected into system prompt.
- Tool-call loop bounded (max iterations) to avoid runaway.

## Tool set
- `list_accounts()` → `getAccounts()` (auto).
- `get_insights({level,datePreset,since?,until?})` → `getLevel()` (auto).
- `set_status({id,status})` → propose → `fbPost('/{id}',{status})`.
- `set_budget({id,dailyBudget})` → propose → `fbPost('/{id}',{daily_budget: x*100})`.
- `navigate({path,query?})` → propose → client router push.

## Build order
1. Store + `/api/agents` CRUD (key redaction).
2. Provider adapter + tool loop + `/api/agents/chat` & `/act`.
3. Office canvas renderer → pathfinding → edit mode.
4. Create modal + chat panel + sprite status wiring.
5. Nav item + `/agents` page assembly.
