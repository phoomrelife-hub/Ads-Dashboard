-- ── Agents system ──────────────────────────────────────────────────────────────

create table if not exists agents (
  id           text primary key,
  name         text not null,
  role         text not null default '',
  sprite       text not null default 'default',
  provider     text not null default 'anthropic',
  model        text not null,
  system_prompt text not null default '',
  scope        text[] not null default '{}',
  api_key      text,
  pos_x        integer not null default 0,
  pos_y        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists rules (
  id          text primary key,
  agent_id    text references agents(id) on delete cascade,
  account_id  text not null default '',
  name        text not null default '',
  schedule    text not null default '',
  condition   text not null default '',
  action      text not null default '',
  instruction text,
  level       text not null default 'ad',
  date_preset text not null default 'today',
  dry_run     boolean not null default false,
  enabled     boolean not null default true,
  last_run_at bigint,
  last_result text,
  created_at  timestamptz not null default now()
);

-- Migration: add missing columns to existing rules table
alter table rules add column if not exists account_id  text not null default '';
alter table rules add column if not exists name        text not null default '';
alter table rules add column if not exists instruction text;
alter table rules add column if not exists level       text not null default 'ad';
alter table rules add column if not exists date_preset text not null default 'today';
alter table rules add column if not exists dry_run     boolean not null default false;
alter table rules add column if not exists last_run_at bigint;
alter table rules add column if not exists last_result text;
alter table rules alter column agent_id drop not null;

create table if not exists rule_runs (
  id        text primary key default gen_random_uuid()::text,
  rule_id   text not null references rules(id) on delete cascade,
  status    text not null,
  summary   text,
  error     text,
  ran_at    timestamptz not null default now()
);

create table if not exists sessions (
  id         text primary key,
  agent_id   text not null references agents(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id          text primary key,
  session_id  text not null references sessions(id) on delete cascade,
  role        text not null,
  content     text not null,
  tool_calls  jsonb,
  tool_results jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists logs (
  id         text primary key default gen_random_uuid()::text,
  agent_id   text not null references agents(id) on delete cascade,
  type       text not null,
  message    text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create table if not exists office_layout (
  id        text primary key default 'singleton',
  tiles     jsonb not null default '[]',
  furniture jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ── Facebook cache ─────────────────────────────────────────────────────────────

create table if not exists fb_accounts (
  id        text primary key,
  name      text not null,
  currency  text,
  timezone  text,
  cached_at timestamptz not null default now()
);

create table if not exists fb_pages (
  id         text primary key,
  account_id text not null references fb_accounts(id) on delete cascade,
  name       text not null,
  cached_at  timestamptz not null default now()
);

-- ── Insights snapshots ─────────────────────────────────────────────────────────

create table if not exists insights_snapshots (
  id          text primary key default gen_random_uuid()::text,
  account_id  text not null,
  date_preset text not null,
  dimension   text not null default 'none',
  data        jsonb not null,
  snapshot_at timestamptz not null default now(),
  unique (account_id, date_preset, dimension)
);

create index if not exists insights_snapshots_account_id_idx on insights_snapshots (account_id);

-- Disable RLS on all tables (internal tool)
alter table agents disable row level security;
alter table rules disable row level security;
alter table rule_runs disable row level security;
alter table sessions disable row level security;
alter table chat_messages disable row level security;
alter table logs disable row level security;
alter table office_layout disable row level security;
alter table fb_accounts disable row level security;
alter table fb_pages disable row level security;
alter table insights_snapshots disable row level security;

-- ── Leads (lead → sale tracker) ───────────────────────────────────────────────

create table if not exists leads (
  id            text primary key,
  account_id    text not null,
  phone         text not null,
  name          text,
  campaign_id   text,
  adset_id      text,
  ad_id         text,
  campaign_name text,
  ad_name       text,
  source        text not null default 'manual',
  status        text not null default 'new',
  sale_amount   numeric,
  product       text,
  lost_reason   text,
  fb_lead_id    text,
  contacted_at  timestamptz,
  won_at        timestamptz,
  lost_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists leads_account_status_idx on leads (account_id, status);
create index if not exists leads_account_ad_idx on leads (account_id, ad_id);
create index if not exists leads_phone_idx on leads (phone);
-- Partial unique: only one row per FB lead id (nulls are excluded by WHERE clause)
create unique index if not exists leads_fb_lead_id_unique on leads (fb_lead_id) where fb_lead_id is not null;

create table if not exists lead_events (
  id       text primary key default gen_random_uuid()::text,
  lead_id  text not null references leads(id) on delete cascade,
  ts       timestamptz not null default now(),
  kind     text not null,
  note     text,
  agent    text
);

create index if not exists lead_events_lead_id_idx on lead_events (lead_id);

alter table leads disable row level security;
alter table lead_events disable row level security;
