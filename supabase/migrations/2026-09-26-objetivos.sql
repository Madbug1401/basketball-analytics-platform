-- Migração 2026-09-26: objetivos (goals).
-- Correr no Supabase: SQL Editor → colar → Run. Pode correr-se mais do que uma vez.

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

drop trigger if exists touch_goals on public.goals;
create trigger touch_goals before insert or update on public.goals for each row execute function public.touch_updated_at();
drop trigger if exists tomb_goals on public.goals;
create trigger tomb_goals after delete on public.goals for each row execute function public.log_tombstone();

alter table public.goals enable row level security;
drop policy if exists goals_select on public.goals;
drop policy if exists goals_write on public.goals;
drop policy if exists goals_update on public.goals;
drop policy if exists goals_delete on public.goals;
-- objetivos: staff gere; o jogador vê os da equipa e os seus
create policy goals_select on public.goals for select using (
  public.is_staff(team_id) or (public.is_member(team_id) and (player_id is null or player_id = public.my_player_id(team_id))));
create policy goals_write on public.goals for insert with check (public.is_staff(team_id));
create policy goals_update on public.goals for update using (public.is_staff(team_id));
create policy goals_delete on public.goals for delete using (public.is_staff(team_id));

grant all on public.goals to authenticated;
notify pgrst, 'reload schema';
