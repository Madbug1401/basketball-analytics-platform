-- v0.9: o que foi apagado não volta.
-- Se um dispositivo que ainda não sabia do apagão enviar outra vez um jogo, treino, atleta ou evento
-- que outro treinador já apagou, o servidor ignora-o (em vez de o recriar vazio).
-- Seguro de correr mais do que uma vez.

create index if not exists tombstones_row on public.tombstones(table_name, row_id);

create or replace function public.skip_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tombstones where table_name = tg_table_name and row_id = new.id::text) then
    return null; -- já foi apagado: não recriar
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  -- só tabelas com ids aleatórios (nunca reutilizados); respostas/presenças usam ids compostos que podem voltar
  foreach t in array array['games','practices','players','events'] loop
    execute format('drop trigger if exists skip_deleted_%1$s on public.%1$s', t);
    execute format('create trigger skip_deleted_%1$s before insert on public.%1$s for each row execute function public.skip_deleted()', t);
  end loop;
end $$;
