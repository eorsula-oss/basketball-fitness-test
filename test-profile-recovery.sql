-- TESTUMGEBUNG: getrennte verschlüsselte Profilsicherungen.
-- Diese Tabelle und Funktionen werden von der Produktions-App nicht verwendet.
-- Produktionsranglisten und Produktionssicherungen werden nicht verändert.

create extension if not exists pgcrypto;

create table if not exists public.fitness_test_profile_backups (
  profile_id uuid primary key,
  owner_hash text not null,
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now()
);

alter table public.fitness_test_profile_backups enable row level security;
revoke all on public.fitness_test_profile_backups from anon, authenticated;

create or replace function public.upsert_test_profile_backup(
  p_profile_id uuid,
  p_owner_token text,
  p_ciphertext text,
  p_iv text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text := encode(extensions.digest(p_owner_token,'sha256'),'hex');
begin
  insert into public.fitness_test_profile_backups
    (profile_id, owner_hash, ciphertext, iv, updated_at)
  values
    (p_profile_id, h, p_ciphertext, p_iv, now())
  on conflict (profile_id) do update set
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    updated_at = now()
  where fitness_test_profile_backups.owner_hash = h;

  if not found then
    raise exception 'Profilcode stimmt nicht mit dem vorhandenen Testprofil überein';
  end if;
end;
$$;

create or replace function public.get_test_profile_backup(
  p_profile_id uuid,
  p_owner_token text
)
returns table(ciphertext text, iv text, updated_at timestamptz)
language sql
security definer
set search_path = public, extensions
as $$
  select b.ciphertext, b.iv, b.updated_at
  from public.fitness_test_profile_backups b
  where b.profile_id = p_profile_id
    and b.owner_hash = encode(extensions.digest(p_owner_token,'sha256'),'hex');
$$;

revoke all on function public.upsert_test_profile_backup(uuid,text,text,text) from public;
revoke all on function public.get_test_profile_backup(uuid,text) from public;
grant execute on function public.upsert_test_profile_backup(uuid,text,text,text) to anon;
grant execute on function public.get_test_profile_backup(uuid,text) to anon;

-- Kontrolle: Die Abfrage sollte 0 oder mehr reine Testprofile anzeigen.
select count(*) as test_profile_backups from public.fitness_test_profile_backups;
