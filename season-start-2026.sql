-- Richtet ausschließlich verschlüsselte tägliche Backups mit sieben Tagen Aufbewahrung ein.
-- Vorhandene Ranglistenpunkte, Profile und Fortschritte werden nicht verändert.

begin;

create table if not exists public.fitness_backup_history (
  backup_id uuid not null,
  snapshot_date date not null default current_date,
  ciphertext text not null,
  iv text not null,
  app_version integer not null default 1,
  source_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (backup_id, snapshot_date)
);

alter table public.fitness_backup_history enable row level security;
drop policy if exists "encrypted backup history can be read" on public.fitness_backup_history;
create policy "encrypted backup history can be read"
  on public.fitness_backup_history for select to anon using (true);
grant select on public.fitness_backup_history to anon;

create or replace function public.snapshot_fitness_backups()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fitness_backup_history
    (backup_id, snapshot_date, ciphertext, iv, app_version, source_updated_at)
  select backup_id, current_date, ciphertext, iv, app_version, updated_at
  from public.fitness_backups
  on conflict (backup_id, snapshot_date) do update set
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    app_version = excluded.app_version,
    source_updated_at = excluded.source_updated_at,
    created_at = now();

  delete from public.fitness_backup_history
  where snapshot_date < current_date - 6;
end;
$$;

revoke all on function public.snapshot_fitness_backups() from public;

commit;

create extension if not exists pg_cron;

select cron.schedule(
  'basketball-fitness-daily-backup',
  '0 2 * * *',
  $$select public.snapshot_fitness_backups();$$
);

-- Erzeugt sofort den ersten Tagesstand; danach täglich automatisch um 02:00 UTC.
select public.snapshot_fitness_backups();
