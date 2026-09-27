-- Migração 2026-09-27 (v0.5): calendário/convocatórias, feedback, planeador de treinos e scouting.
-- Correr no Supabase: SQL Editor → colar → Run. Pode correr-se mais do que uma vez.

-- agenda: hora, local, convocatória e plano de treino de cada jogo/treino (id = id do jogo ou treino)
create table if not exists public.agenda (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('game','practice')),
  time text,
  meet_time text,
  location text,
  callup jsonb,
  published boolean,
  plan jsonb,
  note text,
  updated_at timestamptz not null default now()
);
create index if not exists agenda_team on public.agenda(team_id, updated_at);

-- respostas dos jogadores (vou / talvez / não posso); id = `${ref_id}:${player_id}`
create table if not exists public.rsvps (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  ref_id text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null check (status in ('yes','maybe','no')),
  note text,
  answered_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists rsvps_team on public.rsvps(team_id, updated_at);

-- feedback do treinador para um jogador (nota + jogada do vídeo)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  clip_start double precision,
  clip_end double precision,
  event_ids jsonb,
  text text not null default '',
  author text,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists feedback_team on public.feedback(team_id, updated_at);

-- "visto" pelo jogador (id = id do feedback)
create table if not exists public.seen (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seen_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists seen_team on public.seen(team_id, updated_at);

-- biblioteca de exercícios
create table if not exists public.drills (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  focus jsonb,
  minutes smallint,
  description text,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists drills_team on public.drills(team_id, updated_at);

-- notas de scouting por adversário
create table if not exists public.scouting (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  notes text,
  key_players text,
  edited_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists scouting_team on public.scouting(team_id, updated_at);

drop trigger if exists touch_agenda on public.agenda;
create trigger touch_agenda before insert or update on public.agenda for each row execute function public.touch_updated_at();
drop trigger if exists tomb_agenda on public.agenda;
create trigger tomb_agenda after delete on public.agenda for each row execute function public.log_tombstone();
drop trigger if exists touch_rsvps on public.rsvps;
create trigger touch_rsvps before insert or update on public.rsvps for each row execute function public.touch_updated_at();
drop trigger if exists tomb_rsvps on public.rsvps;
create trigger tomb_rsvps after delete on public.rsvps for each row execute function public.log_tombstone();
drop trigger if exists touch_feedback on public.feedback;
create trigger touch_feedback before insert or update on public.feedback for each row execute function public.touch_updated_at();
drop trigger if exists tomb_feedback on public.feedback;
create trigger tomb_feedback after delete on public.feedback for each row execute function public.log_tombstone();
drop trigger if exists touch_seen on public.seen;
create trigger touch_seen before insert or update on public.seen for each row execute function public.touch_updated_at();
drop trigger if exists tomb_seen on public.seen;
create trigger tomb_seen after delete on public.seen for each row execute function public.log_tombstone();
drop trigger if exists touch_drills on public.drills;
create trigger touch_drills before insert or update on public.drills for each row execute function public.touch_updated_at();
drop trigger if exists tomb_drills on public.drills;
create trigger tomb_drills after delete on public.drills for each row execute function public.log_tombstone();
drop trigger if exists touch_scouting on public.scouting;
create trigger touch_scouting before insert or update on public.scouting for each row execute function public.touch_updated_at();
drop trigger if exists tomb_scouting on public.scouting;
create trigger tomb_scouting after delete on public.scouting for each row execute function public.log_tombstone();

alter table public.agenda enable row level security;
alter table public.rsvps enable row level security;
alter table public.feedback enable row level security;
alter table public.seen enable row level security;
alter table public.drills enable row level security;
alter table public.scouting enable row level security;

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'agenda' loop
    execute format('drop policy if exists %I on public.agenda', r.policyname);
  end loop;
end $$;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'rsvps' loop
    execute format('drop policy if exists %I on public.rsvps', r.policyname);
  end loop;
end $$;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'feedback' loop
    execute format('drop policy if exists %I on public.feedback', r.policyname);
  end loop;
end $$;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'seen' loop
    execute format('drop policy if exists %I on public.seen', r.policyname);
  end loop;
end $$;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'drills' loop
    execute format('drop policy if exists %I on public.drills', r.policyname);
  end loop;
end $$;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'scouting' loop
    execute format('drop policy if exists %I on public.scouting', r.policyname);
  end loop;
end $$;

-- agenda, exercícios e scouting: membros leem, staff escreve
do $$
declare t text;
begin
  foreach t in array array['agenda','drills','scouting'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_member(team_id))', t);
    execute format('create policy %1$s_write on public.%1$s for insert with check (public.is_staff(team_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_staff(team_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_staff(team_id))', t);
  end loop;
end $$;

-- respostas e "visto": o jogador escreve as suas; o staff vê e gere todas
do $$
declare t text;
begin
  foreach t in array array['rsvps','seen'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_staff(team_id) or player_id = public.my_player_id(team_id))', t);
    execute format('create policy %1$s_write on public.%1$s for insert with check (public.is_staff(team_id) or player_id = public.my_player_id(team_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_staff(team_id) or player_id = public.my_player_id(team_id)) with check (public.is_staff(team_id) or player_id = public.my_player_id(team_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_staff(team_id) or player_id = public.my_player_id(team_id))', t);
  end loop;
end $$;

-- feedback: staff escreve; cada jogador só vê o seu
create policy feedback_select on public.feedback for select using (
  public.is_staff(team_id) or player_id = public.my_player_id(team_id));
create policy feedback_write on public.feedback for insert with check (public.is_staff(team_id));
create policy feedback_update on public.feedback for update using (public.is_staff(team_id));
create policy feedback_delete on public.feedback for delete using (public.is_staff(team_id));

grant all on public.agenda, public.rsvps, public.feedback, public.seen, public.drills, public.scouting to authenticated;
notify pgrst, 'reload schema';
