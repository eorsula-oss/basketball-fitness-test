-- NUR im getrennten Supabase-Testprojekt ausfuehren.
-- 1. Zuerst unter Authentication > Users das Trainerkonto anlegen.
-- 2. Danach unten TRAINER-EMAIL ersetzen und diese Abfrage ausfuehren.

insert into private.fitness_trainers (email)
values (lower(trim('TRAINER-EMAIL')))
on conflict (email) do nothing;

select email, created_at
from private.fitness_trainers
order by email;
