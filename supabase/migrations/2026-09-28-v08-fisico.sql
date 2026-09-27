-- Migração 2026-09-28 (v0.8): perfil físico dos atletas (histórico de medições e testes).
-- Correr no Supabase: SQL Editor → colar → Run. Pode correr-se mais do que uma vez.

-- o mesmo atleta noutra equipa (subida de escalão)
alter table public.players add column if not exists prev_id uuid;

-- medições: uma linha por atleta, tipo e dia (nunca se sobrescreve)
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

drop trigger if exists touch_measurements on public.measurements;
create trigger touch_measurements before insert or update on public.measurements for each row execute function public.touch_updated_at();
drop trigger if exists tomb_measurements on public.measurements;
create trigger tomb_measurements after delete on public.measurements for each row execute function public.log_tombstone();

-- staff regista e vê tudo; o jogador vê as suas medições, exceto o peso
alter table public.measurements enable row level security;
drop policy if exists measurements_select on public.measurements;
drop policy if exists measurements_write on public.measurements;
drop policy if exists measurements_update on public.measurements;
drop policy if exists measurements_delete on public.measurements;
create policy measurements_select on public.measurements for select using (
  public.is_staff(team_id) or (player_id = public.my_player_id(team_id) and type <> 'peso'));
create policy measurements_write on public.measurements for insert with check (public.is_staff(team_id));
create policy measurements_update on public.measurements for update using (public.is_staff(team_id));
create policy measurements_delete on public.measurements for delete using (public.is_staff(team_id));
grant all on public.measurements to authenticated;
notify pgrst, 'reload schema';
