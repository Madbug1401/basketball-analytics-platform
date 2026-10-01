-- Migração 2026-10-01 (v0.11): feedback do ABC de 29 set 2026.
-- Correr no Supabase: SQL Editor → colar → Run. Pode correr-se mais do que uma vez.
-- Enquanto não correr, a app continua a funcionar e avisa (indicador de sincronização e Definições → Versão e
-- sincronização) do que falta no servidor; o que depende disto fica guardado no dispositivo.

-- 1) Posições secundárias do atleta (a principal continua em players.position)
alter table public.players add column if not exists secondary_positions jsonb;

-- 2) Anexos dos exercícios: lista em drills.media; os ficheiros vão para o Storage (bucket drill-media, abaixo)
alter table public.drills add column if not exists media jsonb;

-- 3) Acompanhar o plano durante o treino: uma linha por treino (id = id do treino), só para a equipa técnica.
--    Apagar o treino apaga o registo (cascade; o tombstone avisa os outros dispositivos).
create table if not exists public.practice_runs (
  id uuid primary key references public.practices(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  items jsonb not null default '{}'::jsonb,
  note text,
  started_at bigint,
  ended_at bigint,
  created_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists practice_runs_team on public.practice_runs(team_id, updated_at);

drop trigger if exists touch_practice_runs on public.practice_runs;
create trigger touch_practice_runs before insert or update on public.practice_runs for each row execute function public.touch_updated_at();
drop trigger if exists tomb_practice_runs on public.practice_runs;
create trigger tomb_practice_runs after delete on public.practice_runs for each row execute function public.log_tombstone();
-- um dispositivo atrasado não recria o registo de um treino apagado
drop trigger if exists skip_deleted_practice_runs on public.practice_runs;
create trigger skip_deleted_practice_runs before insert on public.practice_runs for each row execute function public.skip_deleted();

alter table public.practice_runs enable row level security;
drop policy if exists practice_runs_all on public.practice_runs;
create policy practice_runs_all on public.practice_runs for all using (public.is_staff(team_id)) with check (public.is_staff(team_id));
grant all on public.practice_runs to authenticated;

-- 4) Storage dos anexos: bucket privado; caminho = <team_id>/<drill_id>/<ficheiro>.
--    Toda a equipa vê (os jogadores também veem os exercícios); só a equipa técnica envia/apaga.
--    Limite de 50 MB por ficheiro (igual ao da app, src/lib/media.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drill-media', 'drill-media', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- o 1.º segmento do caminho tem de ser um uuid de uma equipa; um nome inválido não dá acesso (devolve null)
create or replace function public.media_team(object_name text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

drop policy if exists drill_media_select on storage.objects;
drop policy if exists drill_media_insert on storage.objects;
drop policy if exists drill_media_update on storage.objects;
drop policy if exists drill_media_delete on storage.objects;
create policy drill_media_select on storage.objects for select to authenticated
  using (bucket_id = 'drill-media' and public.is_member(public.media_team(name)));
create policy drill_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'drill-media' and public.is_staff(public.media_team(name)));
create policy drill_media_update on storage.objects for update to authenticated
  using (bucket_id = 'drill-media' and public.is_staff(public.media_team(name)));
create policy drill_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'drill-media' and public.is_staff(public.media_team(name)));

grant execute on function public.media_team(text) to authenticated;
notify pgrst, 'reload schema';
