-- ── Performance indexes ──────────────────────────────────────────────────────────
-- Additive, idempotent. Run once in the Supabase SQL editor.
--
-- These cover filter+sort paths that currently fall back to sequential scans and
-- in-memory sorts. Each index matches a real query (file:line noted).
--
-- NOTE: the Supabase SQL editor runs the whole script in ONE transaction, and
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction. These tables are
-- small enough that a plain CREATE INDEX is effectively instant and a brief lock
-- is fine. If any table has grown large in production, run that single statement
-- separately as:  create index concurrently if not exists <name> on <table> (...);

-- leads: inbox lists by account newest-first; ROAS windows scan account + created_at range.
--   listLeads        lib/leads/store.ts:51  (eq account_id, order created_at desc)
--   leadsInWindow    lib/leads/store.ts:351 (eq account_id, created_at range)
--   wonLeadsForRoas  lib/leads/store.ts:375 (eq account_id, status=won, created_at range)
create index if not exists leads_account_created_idx on leads (account_id, created_at desc);

-- logs: written + read by agent, ordered by time. Currently NO index on the table.
--   addLog/getLogs   lib/agents/db-store.ts:127,141
create index if not exists logs_agent_created_idx on logs (agent_id, created_at desc);

-- rule_runs: listed per rule, newest-first.
--   listRuleRuns     lib/agents/db-store.ts:227
create index if not exists rule_runs_rule_ran_idx on rule_runs (rule_id, ran_at desc);

-- chat_messages: fetched per session in chronological order.
--   getSession       lib/agents/db-store.ts:259
create index if not exists chat_messages_session_created_idx on chat_messages (session_id, created_at);

-- sessions: listed per agent, capped by oldest updated.
--   listSessions     lib/agents/db-store.ts:237
create index if not exists sessions_agent_updated_idx on sessions (agent_id, updated_at desc);

-- rules: listed per agent in creation order.
--   listRules        lib/agents/db-store.ts:163
create index if not exists rules_agent_created_idx on rules (agent_id, created_at);

-- fb_pages: page→account lookups (FK columns are NOT auto-indexed in Postgres).
--   accountPages     lib/cache/accounts.ts:28  (eq account_id)
create index if not exists fb_pages_account_idx on fb_pages (account_id);
