-- NUR in einem getrennten Supabase-Testprojekt ausführen.
-- Dieses Skript ersetzt die vom Browser übermittelte Gesamtsumme durch
-- serverseitig geprüfte Einzelhäkchen. Es ist absichtlich nicht für die
-- Produktionsdatenbank freigegeben.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.fitness_rankings (
  profile_id uuid primary key,
  owner_hash text not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  group_name text not null check (group_name in ('U12.1','U14.1','Eltern','Sonstige')),
  total_points integer not null default 0 check (total_points >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitness_completions (
  profile_id uuid not null references public.fitness_rankings(profile_id) on delete cascade,
  task_date date not null,
  exercise_id smallint not null check (exercise_id between 0 and 16),
  points smallint not null check (points between 0 and 10),
  completed_at timestamptz not null default now(),
  primary key (profile_id, task_date, exercise_id)
);

-- Nur hier eingetragene, in Supabase Auth angemeldete Trainerkonten
-- duerfen die detaillierten Trainingsdaten lesen.
create table if not exists private.fitness_trainers (
  email text primary key,
  created_at timestamptz not null default now(),
  check (email = lower(trim(email)) and char_length(email) between 3 and 254)
);

alter table public.fitness_rankings enable row level security;
alter table public.fitness_completions enable row level security;
alter table private.fitness_trainers enable row level security;

drop policy if exists "rankings are public" on public.fitness_rankings;
create policy "rankings are public"
  on public.fitness_rankings for select to anon using (true);

revoke all on public.fitness_rankings from anon, authenticated;
grant select on public.fitness_rankings to anon;
revoke all on public.fitness_completions from anon, authenticated;

create or replace function private.fitness_exercise_points(p_exercise_id integer)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_exercise_id between 0 and 4 then 3
    when p_exercise_id = 5 then 10
    when p_exercise_id between 6 and 9 then 3
    when p_exercise_id between 10 and 13 then 2
    when p_exercise_id = 14 then 4
    when p_exercise_id = 15 then 5
    when p_exercise_id = 16 then 6
  end
$$;

create or replace function private.assert_fitness_completion(
  p_task_date date,
  p_exercise_id integer
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  berlin_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if p_task_date is null then
    raise exception 'Datum fehlt';
  end if;
  if p_exercise_id is null then
    raise exception 'Aufgabe fehlt';
  end if;
  if p_task_date < date '2026-07-18' or p_task_date > date '2026-09-01' then
    raise exception 'Datum liegt außerhalb des Trainingszeitraums';
  end if;
  if p_task_date > berlin_today then
    raise exception 'Eintragungen für zukünftige Tage sind nicht erlaubt';
  end if;
  if p_exercise_id < 0 or p_exercise_id > 16 then
    raise exception 'Unbekannte Aufgabe';
  end if;
end
$$;

create or replace function private.ensure_fitness_profile(
  p_profile_id uuid,
  p_owner_token text,
  p_display_name text,
  p_group_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h text;
  stored_hash text;
begin
  if char_length(coalesce(p_owner_token,'')) < 32 then
    raise exception 'Profilnachweis ist ungültig';
  end if;
  if char_length(trim(coalesce(p_display_name,''))) not between 1 and 24 then
    raise exception 'Profilname ist ungültig';
  end if;
  if p_group_name not in ('U12.1','U14.1','Eltern','Sonstige') then
    raise exception 'Gruppe ist ungültig';
  end if;

  h := pg_catalog.encode(extensions.digest(p_owner_token,'sha256'),'hex');
  insert into public.fitness_rankings
    (profile_id, owner_hash, display_name, group_name, total_points, updated_at)
  values
    (p_profile_id, h, trim(p_display_name), p_group_name, 0, now())
  on conflict (profile_id) do nothing;

  select owner_hash into stored_hash
  from public.fitness_rankings
  where profile_id = p_profile_id
  for update;

  if stored_hash is distinct from h then
    raise exception 'Profilnachweis ist falsch';
  end if;

  update public.fitness_rankings
  set display_name = trim(p_display_name),
      group_name = p_group_name,
      updated_at = now()
  where profile_id = p_profile_id;
end
$$;

create or replace function private.refresh_fitness_total(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  result integer;
begin
  select coalesce(sum(points),0)::integer into result
  from public.fitness_completions
  where profile_id = p_profile_id;

  update public.fitness_rankings
  set total_points = result, updated_at = now()
  where profile_id = p_profile_id;

  return result;
end
$$;

create or replace function public.set_fitness_completion(
  p_profile_id uuid,
  p_owner_token text,
  p_display_name text,
  p_group_name text,
  p_task_date date,
  p_exercise_id integer,
  p_completed boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_fitness_profile(
    p_profile_id, p_owner_token, p_display_name, p_group_name
  );
  perform private.assert_fitness_completion(p_task_date, p_exercise_id);

  if p_completed then
    insert into public.fitness_completions
      (profile_id, task_date, exercise_id, points, completed_at)
    values
      (p_profile_id, p_task_date, p_exercise_id,
       private.fitness_exercise_points(p_exercise_id), now())
    on conflict (profile_id, task_date, exercise_id) do update
      set points = excluded.points, completed_at = now();
  else
    delete from public.fitness_completions
    where profile_id = p_profile_id
      and task_date = p_task_date
      and exercise_id = p_exercise_id;
  end if;

  return private.refresh_fitness_total(p_profile_id);
end
$$;

create or replace function public.sync_fitness_completions(
  p_profile_id uuid,
  p_owner_token text,
  p_display_name text,
  p_group_name text,
  p_completions jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  item_date date;
  item_exercise integer;
  item_completed boolean;
begin
  perform private.ensure_fitness_profile(
    p_profile_id, p_owner_token, p_display_name, p_group_name
  );

  if jsonb_typeof(coalesce(p_completions,'[]'::jsonb)) <> 'array' then
    raise exception 'Erledigungen müssen als Liste gesendet werden';
  end if;
  if jsonb_array_length(coalesce(p_completions,'[]'::jsonb)) > 800 then
    raise exception 'Zu viele Erledigungen in einer Anfrage';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_completions,'[]'::jsonb)) loop
    if jsonb_typeof(item) <> 'object'
       or coalesce(item->>'task_date','') !~ '^2026-[0-9]{2}-[0-9]{2}$'
       or coalesce(item->>'exercise_id','') !~ '^[0-9]{1,2}$'
       or jsonb_typeof(item->'completed') <> 'boolean' then
      raise exception 'Ungültiger Erledigungseintrag';
    end if;

    item_date := (item->>'task_date')::date;
    item_exercise := (item->>'exercise_id')::integer;
    item_completed := (item->>'completed')::boolean;
    perform private.assert_fitness_completion(item_date, item_exercise);

    if item_completed then
      insert into public.fitness_completions
        (profile_id, task_date, exercise_id, points, completed_at)
      values
        (p_profile_id, item_date, item_exercise,
         private.fitness_exercise_points(item_exercise), now())
      on conflict (profile_id, task_date, exercise_id) do update
        set points = excluded.points;
    else
      delete from public.fitness_completions
      where profile_id = p_profile_id
        and task_date = item_date
        and exercise_id = item_exercise;
    end if;
  end loop;

  return private.refresh_fitness_total(p_profile_id);
end
$$;

create or replace function public.get_fitness_daily_report(
  p_report_date date
)
returns table (
  profile_id uuid,
  display_name text,
  group_name text,
  training_date date,
  exercise_id smallint,
  points smallint,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  trainer_email text := lower(coalesce(auth.jwt() ->> 'email',''));
begin
  if coalesce(auth.role(),'') <> 'authenticated'
     or not exists (
       select 1 from private.fitness_trainers t where t.email = trainer_email
     ) then
    raise exception 'Dieser Zugang ist nicht als Trainer freigeschaltet';
  end if;

  if p_report_date < date '2026-07-18'
     or p_report_date > date '2026-09-01' then
    raise exception 'Datum liegt ausserhalb des Trainingszeitraums';
  end if;

  return query
  select
    r.profile_id,
    r.display_name,
    r.group_name,
    p_report_date,
    c.exercise_id,
    c.points,
    c.completed_at
  from public.fitness_rankings r
  left join public.fitness_completions c
    on c.profile_id = r.profile_id
   and c.task_date = p_report_date
  order by r.group_name, lower(r.display_name), c.exercise_id;
end
$$;

create or replace function public.delete_fitness_ranking(
  p_profile_id uuid,
  p_owner_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.fitness_rankings
  where profile_id = p_profile_id
    and owner_hash = pg_catalog.encode(extensions.digest(p_owner_token,'sha256'),'hex');
end
$$;

drop function if exists public.upsert_fitness_ranking(uuid,text,text,text,integer);

revoke all on schema private from public, anon, authenticated;
revoke all on table private.fitness_trainers from public, anon, authenticated;
revoke all on function private.fitness_exercise_points(integer) from public, anon, authenticated;
revoke all on function private.assert_fitness_completion(date,integer) from public, anon, authenticated;
revoke all on function private.ensure_fitness_profile(uuid,text,text,text) from public, anon, authenticated;
revoke all on function private.refresh_fitness_total(uuid) from public, anon, authenticated;
revoke all on function public.set_fitness_completion(uuid,text,text,text,date,integer,boolean) from public;
revoke all on function public.sync_fitness_completions(uuid,text,text,text,jsonb) from public;
revoke all on function public.delete_fitness_ranking(uuid,text) from public;
revoke all on function public.get_fitness_daily_report(date) from public;
revoke all on function public.set_fitness_completion(uuid,text,text,text,date,integer,boolean) from anon, authenticated;
revoke all on function public.sync_fitness_completions(uuid,text,text,text,jsonb) from anon, authenticated;
revoke all on function public.delete_fitness_ranking(uuid,text) from anon, authenticated;
revoke all on function public.get_fitness_daily_report(date) from anon, authenticated;

grant execute on function public.set_fitness_completion(uuid,text,text,text,date,integer,boolean) to anon;
grant execute on function public.sync_fitness_completions(uuid,text,text,text,jsonb) to anon;
grant execute on function public.delete_fitness_ranking(uuid,text) to anon;
grant execute on function public.get_fitness_daily_report(date) to authenticated;

commit;

-- Kontrollabfragen: Direkte Schreibrechte dürfen nicht vorhanden sein.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and table_name in ('fitness_rankings','fitness_completions')
order by table_name, privilege_type;
