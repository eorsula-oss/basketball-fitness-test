-- NUR nach supabase-secure-points-test.sql im getrennten Testprojekt ausführen.
-- Die Tests laufen in einer Transaktion und werden am Ende vollständig verworfen.

begin;

do $$
declare
  test_profile constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  test_token constant text := 'test-owner-token-123456789012345678901234567890';
  result integer;
begin
  result := public.set_fitness_completion(
    test_profile, test_token, 'Sicherheitstest', 'Sonstige',
    date '2026-07-18', 0, true
  );
  if result <> 3 then
    raise exception 'Test fehlgeschlagen: erstes Häkchen ergab % statt 3', result;
  end if;

  result := public.set_fitness_completion(
    test_profile, test_token, 'Sicherheitstest', 'Sonstige',
    date '2026-07-18', 0, true
  );
  if result <> 3 then
    raise exception 'Test fehlgeschlagen: doppeltes Häkchen wurde mehrfach gezählt';
  end if;

  result := public.set_fitness_completion(
    test_profile, test_token, 'Sicherheitstest', 'Sonstige',
    date '2026-07-18', 5, true
  );
  if result <> 13 then
    raise exception 'Test fehlgeschlagen: serverseitiger Punktewert stimmt nicht';
  end if;

  result := public.set_fitness_completion(
    test_profile, test_token, 'Sicherheitstest', 'Sonstige',
    date '2026-07-18', 0, false
  );
  if result <> 10 then
    raise exception 'Test fehlgeschlagen: Häkchen entfernen zog Punkte nicht ab';
  end if;

  result := public.sync_fitness_completions(
    test_profile, test_token, 'Sicherheitstest', 'Sonstige',
    jsonb_build_array(
      jsonb_build_object('task_date','2026-07-18','exercise_id',1,'completed',true),
      jsonb_build_object('task_date','2026-07-18','exercise_id',5,'completed',false)
    )
  );
  if result <> 3 then
    raise exception 'Test fehlgeschlagen: nachträgliche Offline-Synchronisierung stimmt nicht';
  end if;

  begin
    perform public.set_fitness_completion(
      test_profile, test_token, 'Sicherheitstest', 'Sonstige',
      date '2026-07-18', 99, true
    );
    raise exception 'Test fehlgeschlagen: unbekannte Aufgaben-ID wurde akzeptiert';
  exception
    when others then
      if sqlerrm = 'Test fehlgeschlagen: unbekannte Aufgaben-ID wurde akzeptiert' then
        raise;
      end if;
  end;

  begin
    perform public.set_fitness_completion(
      test_profile, test_token, 'Sicherheitstest', 'Sonstige',
      date '2026-09-02', 0, true
    );
    raise exception 'Test fehlgeschlagen: Datum außerhalb des Zeitraums wurde akzeptiert';
  exception
    when others then
      if sqlerrm = 'Test fehlgeschlagen: Datum außerhalb des Zeitraums wurde akzeptiert' then
        raise;
      end if;
  end;

  begin
    perform public.set_fitness_completion(
      test_profile, 'wrong-owner-token-123456789012345678901234567890',
      'Sicherheitstest', 'Sonstige', date '2026-07-18', 1, true
    );
    raise exception 'Test fehlgeschlagen: falscher Profilnachweis wurde akzeptiert';
  exception
    when others then
      if sqlerrm = 'Test fehlgeschlagen: falscher Profilnachweis wurde akzeptiert' then
        raise;
      end if;
  end;

  if to_regprocedure('public.upsert_fitness_ranking(uuid,text,text,text,integer)') is not null then
    raise exception 'Test fehlgeschlagen: unsichere Summenfunktion existiert noch';
  end if;
end
$$;

do $$
begin
  begin
    set local role anon;
    insert into public.fitness_completions
      (profile_id, task_date, exercise_id, points)
    values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', date '2026-07-18', 1, 10);
    reset role;
    raise exception 'Test fehlgeschlagen: anon durfte direkt Erledigungen schreiben';
  exception
    when insufficient_privilege then
      reset role;
  end;
end
$$;

rollback;

select 'Alle Sicherheitstests erfolgreich; Testdaten wurden verworfen.' as ergebnis;
