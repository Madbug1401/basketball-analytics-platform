-- Migração 2026-09-27 (v0.6): notas do treinador ligadas ao vídeo.
-- Correr no Supabase: SQL Editor → colar → Run. Pode correr-se mais do que uma vez.

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

drop trigger if exists touch_notes on public.notes;
create trigger touch_notes before insert or update on public.notes for each row execute function public.touch_updated_at();
drop trigger if exists tomb_notes on public.notes;
create trigger tomb_notes after delete on public.notes for each row execute function public.log_tombstone();

alter table public.notes enable row level security;
drop policy if exists notes_all on public.notes;
create policy notes_all on public.notes for all using (public.is_staff(team_id)) with check (public.is_staff(team_id));

grant all on public.notes to authenticated;
notify pgrst, 'reload schema';
