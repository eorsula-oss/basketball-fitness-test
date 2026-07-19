# Basketball Fitness – isolierte Testumgebung

## Sicherheitsgrenze

Dieses Projekt darf niemals die URL oder den Publishable Key der Produktionsdatenbank enthalten. Die Produktions-App und ihre Daten werden von Tests nicht angesprochen.

## Gleicher Stand wie Produktion

Die Test-App basiert auf Produktionsversion 17. Bewusst anders sind nur:

- eigener Browser-Speicher `ferienfit-test-v1`
- gelber TEST-Hinweis
- simulierbares Datum über `?testDate=JJJJ-MM-TT`
- eigener Service-Worker-Cache
- eigene Supabase-Testdatenbank

## Einmalige Einrichtung

1. In Supabase ein neues, separates Projekt mit einem Namen wie `basketball-fitness-test` anlegen.
2. Im SQL Editor zuerst `supabase-setup.sql` ausführen.
3. Danach `season-start-2026.sql` ausführen.
4. Danach `supabase-secure-points-test.sql` ausführen.
5. Danach `supabase-secure-points-tests.sql` ausführen. Erwartete Meldung: `Alle Sicherheitstests erfolgreich; Testdaten wurden verworfen.`
6. Erst nach erfolgreichen SQL-Tests Projekt-URL und Publishable Key in `supabase-config.js` eintragen und `testMode` auf `false` setzen.
7. Unter `Authentication > Users` ein separates Trainerkonto anlegen.
8. In `trainer-access-template.sql` die Trainer-E-Mail einsetzen und die Abfrage ausfuehren.

## Geschuetzte Traineruebersicht

`trainer.html` zeigt fuer einen ausgewaehlten Trainingstag alle Profile, erledigten Aufgaben,
Punkte und den Zeitpunkt der Eintragung. Profile ohne Aufgabe werden ebenfalls aufgefuehrt.
Die Liste kann als CSV heruntergeladen oder als PDF gedruckt werden. Die Detaildaten sind
nicht anonym lesbar: Zugriff erhalten nur angemeldete Supabase-Auth-Nutzer, deren E-Mail
zusaetzlich in `private.fitness_trainers` freigeschaltet wurde.

## Freigabeablauf

1. Änderung nur auf dem Test-Zweig entwickeln.
2. Automatische und manuelle Tests in der isolierten Test-App durchführen.
3. Test-App auf `main` veröffentlichen.
4. Eva testet auf dem Handy und gibt ausdrücklich frei.
5. Erst danach wird eine getrennte, datenbewahrende Produktionsmigration vorbereitet.
6. Vor der Produktionsmigration wird ein manueller Datenbankstand erzeugt.

Die Testdaten werden niemals in die Produktion kopiert.
