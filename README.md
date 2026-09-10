# Ukeshandel.no

Et lokalt arbeidsverktøy for å hente dagligvaretilbud fra Tjek, foreslå kategorier med AI og kontrollere og rette resultatene manuelt.

## Arbeidsflyten

1. Start med run-app.bat. Frontend åpnes på http://localhost:5173, backend bruker port 5000.
2. Startsiden leder til tilbudsvisningen med tilbudskort, søk og filtre. Admin-knappen åpner kontroll og innhenting på /admin.
3. Åpne admin (lokalt passord: a), og trykk «Hent og kategoriser tilbud» for å hente nye tilbud og kjøre AI. Jobben kan ta flere minutter.
4. Kontroller usikre forslag. Bruk «Vis alle» eller søk for å rette også kategorier AI er sikker på.
5. Rediger hoved- og underkategorier på «Kategorier». Endringer gjelder umiddelbart og overlever omstart.

Ingen innhenting starter automatisk. Å åpne eller søke i arbeidsflaten gjør ingen AI-kall. /tilbud viser tilbudene. /admin viser administrasjonen.

Ved første oppsett: kjør npm install i backend og frontend. Legg OPENAI_API_KEY i backend/.env. SKIP_AI=true deaktiverer AI. Alternativ oppstart er npm run dev i hver mappe.

## Hva systemet inneholder

| Del | Ansvar | Viktigste fil |
| --- | --- | --- |
| Arbeidsflate | Hente, søke, vise alle tilbud og rette kategorier | frontend/src/components/AdminReview.tsx |
| Kategorioversikt | Opprette, omdøpe og slette kategorier | frontend/src/components/CategoryManager.tsx |
| API | Tilbud, kontrollkø, kategorier og oppdateringsstatus | backend/rest/src/routes/offers.ts |
| Oppdateringsjobb | Samle innhenting, kategorisering og status | backend/core/src/services/offerUpdateService.ts |
| Tilbudstjeneste | Lese og lagre tilbud per butikk | backend/core/src/services/offerService.ts |
| Tjek-klient | Hente katalog og tolke tilbudsdata | backend/persistence/src/services/tjekApiService.ts |
| Kategorisering | Gjenbruke cache, prioritere rettelser og koordinere AI | backend/core/src/services/categoryService.ts |
| AI | Instruksjoner og batchkall | backend/core/src/services/aiCategorization.ts |
| Produktidentitet | Produktnøkler og kategorinøkler | backend/core/src/utils/productKey.ts |

Oppdatering: knapp → POST /api/offers/update → hent tilbud per butikk → lagre tilbudsfiler → kategoriser fra cache/AI → prøv usikre cacheoppføringer én gang til → lagre status.

Samtidige oppdateringskall deler samme jobb. Status viser rapporterte feil. Bilder som allerede følger tilbudsdata beholdes; det kjøres ingen separat bildeinnhenting.

## Hvordan kategorier velges

Oppslag prioriterer manuell kategorisering for varen på tvers av størrelser, deretter cache for den konkrete produktnøkkelen, deretter cache på tvers av størrelser. Manglende kategorisering vises som «Ukategorisert» og kan sendes til AI under oppdatering.

| Nøkkel | Eksempel | Formål |
| --- | --- | --- |
| Produktnøkkel | testprodukt\|500g\|x1\|meny | Identifisere vare, størrelse og butikk |
| Kategorinøkkel | testprodukt\|meny | Gjenbruke kategori mellom størrelser i samme butikk |

Koblinger til gamle produktnøkler beholdes fordi eksisterende kategoriseringer kan være lagret med disse. Manuelle rettelser overstyrer eldre AI-forslag. Ingrediensnøkkelen beholdes som normalisert varenavn i eksisterende kategoriseringsmodell.

AI-resultater regnes som sikre ved minst 0,90 for hovedkategori, 0,88 for underkategori og 0,90 for ingrediensnøkkel. Dette er AI-modellens egen vurdering, ikke dokumentert treffsikkerhet. «Ukategorisert» krever alltid kontroll. Kontrollkøen inkluderer også gamle ukategoriserte cacheoppføringer. «Vis alle» viser de lagrede tilbudene.

Omdøping oppdaterer cachen. Sletting av en kategori flytter berørte varer til «Ukategorisert», som ikke kan slettes.

## Data og API

| Data | Plassering |
| --- | --- |
| Tilbud per butikk | backend/persistence/src/resources/offers/*_offers.json |
| Kategorihierarki | backend/persistence/src/resources/categories.json |
| Kategoriseringer, nøkkelkoblinger og oppdateringsstatus | persistence/data/mattilbud.db |
| Butikker og Tjek-ID-er | backend/rest/src/config/stores.ts |

DB_PATH, OFFERS_DIR og CATEGORIES_FILE kan overstyre datastiene. Eksisterende tilbud og kategoriseringer er beholdt. Gamle pristabeller kan fortsatt ligge i en eksisterende database, men appen leser eller skriver dem ikke, og nye databaser oppretter dem ikke.

| Metode | Adresse | Bruk |
| --- | --- | --- |
| GET | /api/offers | Lagrede tilbud; valgfritt ?store=Meny |
| POST | /api/offers/update | Manuell innhenting og kategorisering |
| GET | /api/offers/review | Kontrollkø |
| POST | /api/offers/categorize | Manuell rettelse |
| GET | /api/categories | Kategorihierarki |
| POST | /api/categories/main/{add,remove,rename} | Endre hovedkategorier |
| POST | /api/categories/subcategory/{add,remove,rename} | Endre underkategorier |
| GET | /api/admin/health | Oppdateringsstatus og cache-statistikk |
| GET | /health | Om serveren svarer |

## Fjernet fra aktiv funksjonalitet

- Prishistorikk, laveste pris, prisutvikling og prisendrings-API.
- Automatisk søndagsoppdatering og den ekstra weekly-update-adressen.
- Separat bildeinnhenting og bilde-API.
- Test-fetch-endepunktet som skrev egne tilbudsfiler.
- Gammelt reimport-verktøy som erstattet kategoriseringscachen med JSON-data.

De to analyseverktøyene backend/analyze_catalogs.js og backend/analyze_catalog_diff.js beholdes for feilsøking av innhenting. De brukes ikke av appen.

## Verifisering og kjente begrensninger

Kjør npm test og npm run build i backend, og npm run build i frontend. Testene bruker midlertidige filer og egen database, uten eksterne API-kall.

- Tjek-klienten henter nyeste katalog per butikk. Det er ikke en garanti for at alle aktive kataloger er dekket.
- Tom innhenting beholder gamle tilbud. Enkelte Tjek-feil blir fortsatt omgjort til tomme resultater, og kan derfor mangle i feilstatus.
- Lagrede tilbud filtreres ikke etter gyldighetsdato. Antall lagrede tilbud betyr ikke antall gyldige tilbud akkurat nå.
- Cache-statistikken gjelder også historiske varer, og viser sikkerhetsvurderinger, ikke målt kategoriseringskvalitet.
- Appen er fortsatt satt opp for lokal bruk uten serverautentisering.

Neste arbeid bør rette seg mot komplett innhenting, tydelig gyldighet og målbar kategoriseringskvalitet. Se ToDo.txt.

## Gjenopprettet grensesnitt

Forside, tilbudsvisning, tilbudskort, søk, filtre og lokal admin-skjerm er gjenopprettet etter at forenklingen fjernet for mye av grensesnittet. Tilbudsvisningen ligger i frontend/src/pages/OffersPage.tsx. Backend-oppryddingen er beholdt.
