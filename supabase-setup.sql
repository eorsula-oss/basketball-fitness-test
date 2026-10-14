create extension if not exists pgcrypto;

create table if not exists public.fitness_backups (
  backup_id uuid primary key,
  ciphertext text not null,
  iv text not null,
  app_version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.fitness_backups add column if not exists app_version integer not null default 1;
alter table public.fitness_backups enable row level security;
drop policy if exists "encrypted backups can be read" on public.fitness_backups;
drop policy if exists "encrypted backups can be created" on public.fitness_backups;
drop policy if exists "encrypted backups can be updated" on public.fitness_backups;
create policy "encrypted backups can be read" on public.fitness_backups for select to anon using (true);
create policy "encrypted backups can be created" on public.fitness_backups for insert to anon with check (true);
create policy "encrypted backups can be updated" on public.fitness_backups for update to anon using (true) with check (true);
grant select,insert,update on public.fitness_backups to anon;

create table if not exists public.fitness_rankings (
  profile_id uuid primary key,
  owner_hash text not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  group_name text not null check (group_name in ('U12.1','U14.1','Eltern','Sonstige')),
  total_points integer not null default 0 check (total_points >= 0),
  updated_at timestamptz not null default now()
);
alter table public.fitness_rankings enable row level security;
drop policy if exists "rankings are public" on public.fitness_rankings;
create policy "rankings are public" on public.fitness_rankings for select to anon using (true);
grant select on public.fitness_rankings to anon;

create or replace function public.upsert_fitness_ranking(p_profile_id uuid,p_owner_token text,p_display_name text,p_group_name text,p_total_points integer)
returns void language plpgsql security definer set search_path=public as $$
declare
  h text:=encode(extensions.digest(p_owner_token,'sha256'),'hex');
  today_berlin date:=(now() at time zone 'Europe/Berlin')::date;
  eligible_days integer:=greatest(0,least(today_berlin,date '2026-10-31')-date '2026-10-17'+1);
  maximum_points integer:=eligible_days*60;
begin
  if btrim(p_display_name)='' or lower(regexp_replace(btrim(p_display_name),'\s+',' ','g'))='kind 1' or p_display_name ~ '[<>{}]' then
    raise exception 'invalid profile name';
  end if;
  if p_total_points<0 or p_total_points>maximum_points then
    raise exception 'invalid point total for current date';
  end if;
  insert into public.fitness_rankings(profile_id,owner_hash,display_name,group_name,total_points)
  values(p_profile_id,h,left(btrim(p_display_name),24),p_group_name,p_total_points)
  on conflict(profile_id) do update set
    display_name=excluded.display_name,
    group_name=excluded.group_name,
    total_points=excluded.total_points,
    updated_at=now()
  where fitness_rankings.owner_hash=h;
end $$;
revoke all on function public.upsert_fitness_ranking(uuid,text,text,text,integer) from public;
grant execute on function public.upsert_fitness_ranking(uuid,text,text,text,integer) to anon;

create or replace function public.delete_fitness_ranking(p_profile_id uuid,p_owner_token text)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.fitness_rankings where profile_id=p_profile_id and owner_hash=encode(extensions.digest(p_owner_token,'sha256'),'hex');
end $$;
revoke all on function public.delete_fitness_ranking(uuid,text) from public;
grant execute on function public.delete_fitness_ranking(uuid,text) to anon;

