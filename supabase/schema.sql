-- Courtside — Postgres/Supabase schema (Fase 2: sync na cloud + multi-treinador)
-- Espelha as tabelas locais (src/lib/db.ts). Ainda NÃO está ligado à app:
-- serve de contrato para a migração. Todas as tabelas têm team_id + RLS.

create extension if not exists "pgcrypto";

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  name text not null,
  category text not null,          -- 'Sub-16'
  gender char(1) not null check (gender in ('M','F')),
  season text not null,            -- '2026/27'
  created_at timestamptz not null default now()
);

-- quem tem acesso a que equipa (treinador principal, adjunto, analista)
create table team_members (
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','coach','analyst','viewer')),
  primary key (team_id, user_id)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  number smallint not null,
  position text,
  birth_year smallint,             -- só o ano: menos dados pessoais de menores
  height_cm smallint,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table practices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  date date not null,
  title text,
  duration_min smallint,
  intensity smallint check (intensity between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);

create table attendance (
  practice_id uuid references practices(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  status text not null check (status in ('present','late','absent','excused')),
  note text,
  primary key (practice_id, player_id)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  date date not null,
  opponent text not null,
  home boolean not null default true,
  competition text,
  periods smallint not null default 4,
  period_minutes smallint not null default 10,
  video jsonb not null default '{"kind":"none"}',
  notes text,
  created_at timestamptz not null default now()
);

-- O coração: tudo o resto é derivado daqui.
create table game_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  side text not null check (side in ('us','opp')),
  player_id uuid references players(id) on delete set null,
  type text not null check (type in ('SHOT','FT','REB','AST','STL','BLK','TOV','FOUL','FOUL_DRAWN','SUB','PERIOD_START')),
  period smallint not null,
  video_ts real not null,          -- segundos no vídeo
  x real, y real,                  -- metros no meio-campo FIBA
  meta jsonb,
  created_at timestamptz not null default now()
);
create index on game_events (game_id, video_ts);
create index on game_events (team_id, player_id);

-- Row Level Security: cada utilizador só vê as equipas de que é membro
create or replace function is_member(t uuid) returns boolean
language sql security definer stable as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid())
$$;

alter table teams enable row level security;
alter table team_members enable row level security;
alter table players enable row level security;
alter table practices enable row level security;
alter table attendance enable row level security;
alter table games enable row level security;
alter table game_events enable row level security;

create policy "members read team" on teams for select using (is_member(id));
create policy "members read membership" on team_members for select using (is_member(team_id));
create policy "members all players" on players for all using (is_member(team_id)) with check (is_member(team_id));
create policy "members all practices" on practices for all using (is_member(team_id)) with check (is_member(team_id));
create policy "members all attendance" on attendance for all using (is_member(team_id)) with check (is_member(team_id));
create policy "members all games" on games for all using (is_member(team_id)) with check (is_member(team_id));
create policy "members all events" on game_events for all using (is_member(team_id)) with check (is_member(team_id));
