-- =====================================================================
-- Courtside — esquema Supabase (Postgres)
-- Correr UMA vez no Supabase: Dashboard → SQL Editor → colar tudo → Run.
-- Papéis por equipa: owner (dono/treinador principal), coach, analyst, player.
-- Admin global (profiles.is_admin): vê e gere tudo.
-- As tabelas espelham a base local da app (IndexedDB) para o sync.
-- =====================================================================

-- ---------- utilizadores ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- equipas e membros ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default '',
  gender text not null default 'M' check (gender in ('M','F')),
  season text not null default '',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  number smallint not null,
  position text not null default '',
  birth_year smallint,
  height_cm smallint,
  active boolean not null default true,
  prev_id uuid,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists players_team on public.players(team_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','coach','analyst','player')),
  player_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user on public.team_members(user_id);

-- notas do treinador: tabelas à parte para os jogadores não as verem
create table if not exists public.players_private (
  player_id uuid primary key references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  date text not null,
  title text,
  duration_min smallint,
  intensity smallint check (intensity between 1 and 5),
  notes text,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists practices_team on public.practices(team_id);

create table if not exists public.attendance (
  id text primary key, -- `${practice_id}:${player_id}`
  team_id uuid not null references public.teams(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null check (status in ('present','late','absent','excused')),
  note text,
  updated_at timestamptz not null default now()
);
create index if not exists attendance_team on public.attendance(team_id);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  date text not null,
  opponent text not null,
  home boolean not null default true,
  competition text,
  periods smallint not null default 4,
  period_minutes smallint not null default 10,
  video jsonb not null default '{"kind":"none"}',
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists games_team on public.games(team_id);

create table if not exists public.games_private (
  game_id uuid primary key references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now()
);

-- o coração: tudo o resto é calculado a partir daqui
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  side text not null check (side in ('us','opp')),
  player_id uuid references public.players(id) on delete set null,
  type text not null,
  period smallint not null,
  video_ts double precision not null,
  x real,
  y real,
  meta jsonb,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists events_team_updated on public.events(team_id, updated_at);
create index if not exists events_game on public.events(game_id);

-- objetivos individuais (player_id) ou da equipa (player_id nulo)
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  metric text not null,
  target double precision not null,
  title text,
  due_date text,
  active boolean not null default true,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists goals_team on public.goals(team_id, updated_at);

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
  rotation jsonb,
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
  report jsonb,
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

-- notas do treinador ligadas ao vídeo (só a equipa técnica)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  video_ts double precision not null default 0,
  period smallint not null default 1,
  text text not null default '',
  author text,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists notes_team on public.notes(team_id, updated_at);

-- carga de treino (esforço 1–10) e disponibilidade, respondidas pelo jogador
create table if not exists public.wellness (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('session','status')),
  ref_id text,
  date text not null,
  rpe smallint check (rpe between 1 and 10),
  minutes smallint,
  status text check (status in ('ok','limited','out')),
  note text,
  answered_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists wellness_team on public.wellness(team_id, updated_at);

-- perfil físico: medições e testes (histórico, nunca se sobrescreve)
create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  type text not null check (type in ('altura','peso','envergadura','alcance','cmj','salto_balanco','lane','sprint')),
  value double precision not null,
  date text not null,
  session_id text,
  attempts jsonb,
  base double precision,
  evaluator text,
  protocol_ok boolean,
  notes text,
  from_team text,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists measurements_team on public.measurements(team_id, updated_at);

-- notificações push: uma subscrição por dispositivo
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);

-- convites (código de 6 caracteres)
create table if not exists public.invites (
  code text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  role text not null check (role in ('coach','analyst','player')),
  player_id uuid references public.players(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create index if not exists invites_team on public.invites(team_id);

-- registo de apagados, para o sync incremental saber o que remover
create table if not exists public.tombstones (
  id bigserial primary key,
  table_name text not null,
  row_id text not null,
  team_id uuid,
  deleted_at timestamptz not null default now()
);
create index if not exists tombstones_team on public.tombstones(team_id, id);

-- ---------- funções de permissão ----------
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.team_role(t uuid) returns text
language sql security definer stable set search_path = public as $$
  select role from public.team_members where team_id = t and user_id = auth.uid()
$$;

create or replace function public.is_member(t uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.team_members where team_id = t and user_id = auth.uid())
$$;

create or replace function public.is_staff(t uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.team_members where team_id = t and user_id = auth.uid() and role in ('owner','coach','analyst'))
$$;

create or replace function public.is_owner(t uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.team_members where team_id = t and user_id = auth.uid() and role = 'owner')
$$;

create or replace function public.my_player_id(t uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select player_id from public.team_members where team_id = t and user_id = auth.uid()
$$;

-- ---------- triggers ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.log_tombstone() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(old);
begin
  insert into public.tombstones (table_name, row_id, team_id)
  values (tg_table_name,
          coalesce(j->>'id', j->>'player_id', j->>'game_id'),
          case when tg_table_name = 'teams' then (j->>'id')::uuid else (j->>'team_id')::uuid end);
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['teams','players','players_private','practices','attendance','games','games_private','events','goals','agenda','rsvps','feedback','seen','drills','scouting','notes','wellness','measurements'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before insert or update on public.%1$s for each row execute function public.touch_updated_at()', t);
    execute format('drop trigger if exists tomb_%1$s on public.%1$s', t);
    execute format('create trigger tomb_%1$s after delete on public.%1$s for each row execute function public.log_tombstone()', t);
  end loop;
end $$;

-- quem cria a equipa fica dono dela
create or replace function public.add_team_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into public.team_members (team_id, user_id, role) values (new.id, auth.uid(), 'owner')
    on conflict (team_id, user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists team_owner on public.teams;
create trigger team_owner after insert on public.teams for each row execute function public.add_team_owner();

-- só um admin pode dar/tirar admin
create or replace function public.protect_admin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() and auth.uid() is not null then
    raise exception 'Só um administrador pode alterar administradores';
  end if;
  return new;
end $$;
drop trigger if exists profiles_admin on public.profiles;
create trigger profiles_admin before update on public.profiles for each row execute function public.protect_admin_flag();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.players enable row level security;
alter table public.players_private enable row level security;
alter table public.practices enable row level security;
alter table public.attendance enable row level security;
alter table public.games enable row level security;
alter table public.games_private enable row level security;
alter table public.events enable row level security;
alter table public.goals enable row level security;
alter table public.agenda enable row level security;
alter table public.rsvps enable row level security;
alter table public.feedback enable row level security;
alter table public.seen enable row level security;
alter table public.drills enable row level security;
alter table public.scouting enable row level security;
alter table public.notes enable row level security;
alter table public.wellness enable row level security;
alter table public.push_subs enable row level security;
alter table public.measurements enable row level security;
alter table public.invites enable row level security;
alter table public.tombstones enable row level security;

-- apagar políticas antigas (para poder correr o ficheiro outra vez)
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.is_admin() or exists (
    select 1 from public.team_members a join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_admin());

create policy teams_select on public.teams for select using (public.is_member(id) or created_by = auth.uid());
create policy teams_insert on public.teams for insert with check (auth.uid() is not null);
create policy teams_update on public.teams for update using (public.is_staff(id));
create policy teams_delete on public.teams for delete using (public.is_owner(id));

create policy members_select on public.team_members for select using (public.is_member(team_id));
create policy members_update on public.team_members for update using (public.is_owner(team_id));
create policy members_delete on public.team_members for delete using (public.is_owner(team_id) or user_id = auth.uid());

-- dados da equipa: membros leem, staff escreve
do $$
declare t text;
begin
  foreach t in array array['players','practices','games','events'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_member(team_id))', t);
    execute format('create policy %1$s_write on public.%1$s for insert with check (public.is_staff(team_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_staff(team_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_staff(team_id))', t);
  end loop;
  foreach t in array array['players_private','games_private'] loop
    execute format('create policy %1$s_all on public.%1$s for all using (public.is_staff(team_id)) with check (public.is_staff(team_id))', t);
  end loop;
end $$;

-- presenças: o jogador só vê as suas
create policy attendance_select on public.attendance for select using (
  public.is_staff(team_id) or player_id = public.my_player_id(team_id));
create policy attendance_write on public.attendance for insert with check (public.is_staff(team_id));
create policy attendance_update on public.attendance for update using (public.is_staff(team_id));
create policy attendance_delete on public.attendance for delete using (public.is_staff(team_id));

-- objetivos: staff gere; o jogador vê os da equipa e os seus
create policy goals_select on public.goals for select using (
  public.is_staff(team_id) or (public.is_member(team_id) and (player_id is null or player_id = public.my_player_id(team_id))));
create policy goals_write on public.goals for insert with check (public.is_staff(team_id));
create policy goals_update on public.goals for update using (public.is_staff(team_id));
create policy goals_delete on public.goals for delete using (public.is_staff(team_id));

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
  foreach t in array array['rsvps','seen','wellness'] loop
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

-- notas de vídeo: só staff
create policy notes_all on public.notes for all using (public.is_staff(team_id)) with check (public.is_staff(team_id));

-- perfil físico: staff regista e vê tudo; o jogador vê as suas medições, exceto o peso
create policy measurements_select on public.measurements for select using (
  public.is_staff(team_id) or (player_id = public.my_player_id(team_id) and type <> 'peso'));
create policy measurements_write on public.measurements for insert with check (public.is_staff(team_id));
create policy measurements_update on public.measurements for update using (public.is_staff(team_id));
create policy measurements_delete on public.measurements for delete using (public.is_staff(team_id));

-- subscrições push: cada utilizador gere as suas
create policy push_subs_own on public.push_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy invites_select on public.invites for select using (public.is_staff(team_id));
create policy invites_delete on public.invites for delete using (public.is_staff(team_id));

create policy tombstones_select on public.tombstones for select using (
  table_name = 'teams' or public.is_member(team_id));

-- ---------- RPCs ----------
-- notificações: staff → jogadores escolhidos; qualquer membro → equipa técnica
create or replace function public.push_targets(p_team uuid, p_players uuid[], p_staff boolean)
returns table (endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_team) then raise exception 'forbidden'; end if;
  if coalesce(array_length(p_players, 1), 0) > 0 and not public.is_staff(p_team) then raise exception 'forbidden'; end if;
  return query
    select distinct s.endpoint, s.p256dh, s.auth
    from public.push_subs s
    join public.team_members m on m.user_id = s.user_id and m.team_id = p_team
    where s.user_id <> auth.uid()
      and (m.player_id = any(coalesce(p_players, '{}'::uuid[]))
           or (p_staff and m.role in ('owner','coach','analyst')));
end $$;

create or replace function public.push_drop(p_endpoints text[])
returns void language sql security definer set search_path = public as $$
  delete from public.push_subs s
  where s.endpoint = any(p_endpoints)
    and exists (select 1 from public.team_members a join public.team_members b on a.team_id = b.team_id
                where a.user_id = auth.uid() and b.user_id = s.user_id);
$$;

create or replace function public.create_invite(p_team uuid, p_role text, p_player uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if p_role = 'player' then
    if not public.is_staff(p_team) then raise exception 'Sem permissão'; end if;
    if p_player is null or not exists (select 1 from public.players where id = p_player and team_id = p_team) then
      raise exception 'Jogador inválido';
    end if;
  elsif p_role in ('coach','analyst') then
    if not public.is_owner(p_team) then raise exception 'Só o dono da equipa pode convidar treinadores'; end if;
    p_player := null;
  else
    raise exception 'Papel inválido';
  end if;
  loop
    c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when length(c) = 6 and not exists (select 1 from public.invites where code = c);
  end loop;
  insert into public.invites (code, team_id, role, player_id, created_by) values (c, p_team, p_role, p_player, auth.uid());
  return c;
end $$;

create or replace function public.claim_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  if auth.uid() is null then raise exception 'Tens de iniciar sessão'; end if;
  select * into inv from public.invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Código inválido'; end if;
  if inv.used_at is not null then raise exception 'Este código já foi usado'; end if;
  if inv.expires_at < now() then raise exception 'Este código expirou'; end if;
  insert into public.team_members (team_id, user_id, role, player_id)
  values (inv.team_id, auth.uid(), inv.role, inv.player_id)
  on conflict (team_id, user_id) do update
    set role = case when public.team_members.role = 'owner' then 'owner' else excluded.role end,
        player_id = coalesce(excluded.player_id, public.team_members.player_id);
  update public.invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.team_id;
end $$;

-- visão geral para o admin
create or replace function public.admin_teams()
returns table (id uuid, name text, category text, season text, owner_email text,
               members int, players int, games int, events int, created_at bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Só administradores'; end if;
  return query
    select t.id, t.name, t.category, t.season,
      (select p.email from public.team_members m join public.profiles p on p.id = m.user_id
        where m.team_id = t.id and m.role = 'owner' limit 1),
      (select count(*)::int from public.team_members m where m.team_id = t.id),
      (select count(*)::int from public.players p where p.team_id = t.id),
      (select count(*)::int from public.games g where g.team_id = t.id),
      (select count(*)::int from public.events e where e.team_id = t.id),
      t.created_at
    from public.teams t order by t.created_at desc;
end $$;

create or replace function public.admin_users()
returns table (id uuid, email text, full_name text, is_admin boolean, created_at timestamptz, teams text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Só administradores'; end if;
  return query
    select p.id, p.email, p.full_name, p.is_admin, p.created_at,
      coalesce((select string_agg(t.name || ' ' || t.category || ' (' || m.role || ')', ', ')
        from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = p.id), '')
    from public.profiles p order by p.created_at desc;
end $$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------- depois de criares a tua conta na app ----------
-- update public.profiles set is_admin = true where email = 'o-teu-email@exemplo.com';
