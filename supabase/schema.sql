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
  id        text primary key,
  agent_id  text not null references agents(id) on delete cascade,
  schedule  text not null default '',
  condition text not null default '',
  action    text not null default '',
  enabled   boolean not null default true,
  created_at timestamptz not null default now()
);

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
