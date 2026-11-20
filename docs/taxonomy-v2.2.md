# Taxonomy v2.2

Konservativ oppdatering av v2.1. `backend/persistence/src/resources/taxonomy.v2.1.json`
bevarer den opprinnelige filen; `taxonomy.v2.json` er v2.2.

| | Før | Etter |
|---|---:|---:|
| Alle kategorirader | 241 | 269 |
| Aktive | 241 | 256 |
| Inaktive, historiske | 0 | 13 |
| Aktive navigation-only | 2 | 7 |
| Aktive og tildelbare | 239 | 249 |

28 nye ID-er: 12 product_types, 14 ingredients, Sushi som dish og Mellommåltid
som usage. Ingen eksisterende ID endrer facet, navn eller definisjon.
De 13 utgåtte product_types beholdes med `active=false`, `assignable=false`.
Hvalkjøtt flyttes til Kjøtt; Fiskeretter flyttes under Ferdigretter.
Brød- og Ost-hovedgruppene samt Smør og margarin, Syltetøy og honning og
Linser og bønner blir navigation-only. De tre siste får separate underkategorier.
Ingen andre dishes legges til. AI-prompt, modell og promptVersion endres ikke.

## Migrering

Fra `backend`:

```powershell
npm.cmd run taxonomy:preview
npm.cmd run taxonomy:migrate
npm.cmd test
npm.cmd run categories:validate
```

Preview bruker en SQLite-backup i en midlertidig mappe, ikke produksjonsdatabasen.
Apply kjører transaksjonelt og idempotent, og lager en SQLite-konsistent backup
ved siden av databasen: `.before-taxonomy-v2.2-<timestamp>.db`.
Begge klassifiseringssystemer, alle direkte assignments, metadata og timestamps
sammenlignes før/etter. Migreringen skriver bare taksonomien og migreringsmarkøren.
En avvikende v2.1-taksonomi stoppes for avklaring, fremfor å overskrive lokale endringer.

Vanlig `initDb` kjører også den idempotente migreringen. Nye databaser får først
v2.1-baseline og deretter v2.2. `TAXONOMY_FILE` beholder støtte for en separat,
eksplisitt seed uten automatisk v2.2-migrering.

`taxonomyVersion` inneholder revisjon og hash av DB-taksonomien. Eksisterende
AI-resultater blir stale ved migrering; klassifiseringsradene endres ikke.
Manuelle låser gjør at manuelle resultater ikke blir stale. Utgåtte eller
navigation-only direkte assignments vises likevel til kontroll gjennom beregnet
status, uten å skrive review-status tilbake på klassifiseringsraden.
Ingen AI-kall, innhenting eller reklassifisering utføres av migreringen.

Admin viser inaktive kategorier, opprinnelige assignments og manuelle låser.
Inaktive kategorier er skrivebeskyttet og kan ikke velges i nye klassifiseringer.
Nye klassifiseringer valideres også på serveren. Kategorioversikten viser hele
hierarkiet, inkludert de nye underkategoriene i tredje nivå.

## Tilbakeføring

Stopp backend, sett `TAXONOMY_VERSION=taxonomy-v2.1` i backend-miljøet, og kjør:

```powershell
npm.cmd run taxonomy:rollback
```

Flagget hindrer at v2.2 automatisk installeres igjen ved neste oppstart.
Tilbakeføring gjenoppretter taksonomiradene fra før migreringen, inkludert gamle
foreldre og valgbarhet, uten å endre noen klassifiseringer. Også tilbakeføring
tar backup. Den avbrytes dersom nye kategori-ID-er er tatt i bruk eller taksonomien
er redigert etter migreringen. Da må endringene avklares før tilbakeføring.

Full gjenoppretting av databasebackup er et alternativ med stoppet backend,
men vil også forkaste senere databaseendringer og gjøres ikke automatisk.
Fjern revisjonsflagget for å migrere frem til v2.2 igjen.

## Verifisering

`tests/taxonomy-migration.test.cjs` tester eksakt seed-diff, historikk, manuelle
rader, begge klassifiseringssystemer, SQLite-backup, FK-integritet, idempotens,
begge parent-flyttinger, stale-status, admin/API og trygg tilbakeføring.
Gammel fallback bruker også det gjeldende hierarkiet i konseptmodus, uten å
endre de gamle direkte assignments. Dette er testet for begge parent-flyttingene.
Den eksisterende UniCat-testen bruker nå Ferdigretter + Pizza og
Ferdigretter + Vegetar, i tråd med godkjent taksonomi.
Frontendens SSR-test sjekker visning av inaktive assignments og underkategorier,
og at inaktive/navigation-only kategorier ikke er valg i klassifiseringsfeltet.

Verifisert 2026-10-03: 47 system-/migreringstester, backend- og frontend-build,
åtte fasitcases med tre identitetskontroller, og frontendens SSR-test består.
Kontroll av 686 eksisterende tilbud med den oppdaterte koden ga ingen arv- eller
facet-feil. Den brukte en midlertidig API-server med skrivebeskyttet SQLite;
databaserader, tilbudsfiler og taksonomifil var uendret gjennom kontrollen.
Ingen interaktiv nettlesertest eller ekte AI-evaluering er kjørt.

Direkte sammenligning med produksjonsbackup bekreftet at samtlige 2498
konseptklassifiseringer, 2397 konseptassignments, 2498 gamle klassifiseringer og
2486 gamle assignments var uendret. Dette inkluderer 113 manuelt låste
konseptklassifiseringer og 113 gamle manuelle klassifiseringer.
V2.1-arkivet er byte-identisk med den opprinnelige, committede taksonomifilen.
Lokal databasebackup:
`persistence/data/mattilbud.db.before-taxonomy-v2.2-1791027111420.db`.

En backendprosess som allerede kjører gammel kode må restartes for å få den
oppdaterte versjonsmerkingen, adminstatusen og fallback-arven.
