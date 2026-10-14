-- Einmaliger, abgesicherter Saisonwechsel auf die NRW-Herbstferien 2026.
-- Erst ausführen, wenn die Test-App freigegeben ist; danach die Produktions-App veröffentlichen.
begin;
create extension if not exists pgcrypto;
create schema if not exists private;
create table if not exists private.fitness_rankings_herbst_2026_backup (
  snapshot_id uuid not null,
  backed_up_at timestamptz not null,
  profile_id uuid not null,
  owner_hash text not null,
  display_name text not null,
  group_name text not null,
  total_points integer not null,
  source_updated_at timestamptz not null,
  primary key(snapshot_id,profile_id)
);

do $$
declare sid uuid:=gen_random_uuid();
begin
  insert into private.fitness_rankings_herbst_2026_backup
    (snapshot_id,backed_up_at,profile_id,owner_hash,display_name,group_name,total_points,source_updated_at)
  select sid,now(),profile_id,owner_hash,display_name,group_name,total_points,updated_at
  from public.fitness_rankings;

  delete from public.fitness_rankings
  where lower(regexp_replace(btrim(display_name),'\s+',' ','g'))='kind 1'
     or display_name ~ '[<>{}]';

  update public.fitness_rankings
  set total_points=0,updated_at=now();
end $$;

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
commit;

-- Kontrolle: Es dürfen keine Platzhalter oder Punkte aus der Sommersaison übrig sein.
select display_name,group_name,total_points,updated_at
from public.fitness_rankings
order by group_name,display_name;

