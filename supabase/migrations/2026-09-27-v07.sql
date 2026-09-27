-- Migração 2026-09-27 (v0.7): rotações, relatórios individuais, carga/disponibilidade e notificações push.
-- Correr no Supabase: SQL Editor → colar → Run. Pode correr-se mais do que uma vez.

-- rotação planeada (minutos por jogador e período) e relatório individual pós-jogo
alter table public.agenda add column if not exists rotation jsonb;
alter table public.feedback add column if not exists report jsonb;

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

drop trigger if exists touch_wellness on public.wellness;
create trigger touch_wellness before insert or update on public.wellness for each row execute function public.touch_updated_at();
drop trigger if exists tomb_wellness on public.wellness;
create trigger tomb_wellness after delete on public.wellness for each row execute function public.log_tombstone();

alter table public.wellness enable row level security;
drop policy if exists wellness_select on public.wellness;
drop policy if exists wellness_write on public.wellness;
drop policy if exists wellness_update on public.wellness;
drop policy if exists wellness_delete on public.wellness;
create policy wellness_select on public.wellness for select using (public.is_staff(team_id) or player_id = public.my_player_id(team_id));
create policy wellness_write on public.wellness for insert with check (public.is_staff(team_id) or player_id = public.my_player_id(team_id));
create policy wellness_update on public.wellness for update using (public.is_staff(team_id) or player_id = public.my_player_id(team_id)) with check (public.is_staff(team_id) or player_id = public.my_player_id(team_id));
create policy wellness_delete on public.wellness for delete using (public.is_staff(team_id) or player_id = public.my_player_id(team_id));
grant all on public.wellness to authenticated;

-- notificações push: uma subscrição por dispositivo
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists push_subs_own on public.push_subs;
create policy push_subs_own on public.push_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on public.push_subs to authenticated;

-- para quem enviar: staff → jogadores escolhidos; qualquer membro → equipa técnica
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

-- apagar subscrições que já não existem (o serviço de push respondeu 404/410)
create or replace function public.push_drop(p_endpoints text[])
returns void language sql security definer set search_path = public as $$
  delete from public.push_subs s
  where s.endpoint = any(p_endpoints)
    and exists (select 1 from public.team_members a join public.team_members b on a.team_id = b.team_id
                where a.user_id = auth.uid() and b.user_id = s.user_id);
$$;

grant execute on function public.push_targets(uuid, uuid[], boolean) to authenticated;
grant execute on function public.push_drop(text[]) to authenticated;
notify pgrst, 'reload schema';
