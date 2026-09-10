# Ukeshandel.no

Henter dagligvaretilbud fra Tjek API, kategoriserer dem med AI og viser dem med søk, filter og manuell kontroll. Middagsplanleggingen er fjernet.

## Start appen

Dobbeltklikk `run-app.bat` på Windows. Appen vises på http://localhost:5173; backend kjører på http://localhost:5000. Skriptet stopper først prosesser på disse portene og starter serverne med AI aktivert.

Ved første oppsett: kjør `npm install` i både `backend/` og `frontend/`. Legg `OPENAI_API_KEY=...` i `backend/.env` for AI-kategorisering. 

Alternativ oppstart: kjør `npm run dev` i hver mappe, i to terminaler. `SKIP_AI=true` deaktiverer AI-kall.

## Systemet i fire deler

| Del | Ansvar | Start her |
| --- | --- | --- |
| Frontend | Viser tilbud og lar deg rette kategorier | `frontend/src/App.tsx` |
| API | Tar imot forespørsler fra frontend | `backend/rest/src/routes/offers.ts` |
| Tjenester | Henter tilbud og utfører kategorisering | `backend/core/src/services/` |
| Lagring og eksterne kall | Leser/skriver filer og database; kontakter Tjek | `backend/persistence/src/services/`, `backend/core/src/db/` |

## 1. Når appen starter

`frontend/src/main.tsx` starter React. `App.tsx` velger side etter nettadressen, og `Layout.tsx` viser den felles toppen.

`backend/rest/src/server.ts` laster miljøvariabler, initialiserer SQLite, registrerer API-et og starter oppdateringstimeren eksplisitt. Å importere tilbudstjenesten starter ingen timer.

Sidene er `/`, `/tilbud`, `/admin` og `/kategorier`. Den eksisterende lokale passordskjermen på admin bruker `a`.

## 2. Når du ser på tilbud

```text
OffersPage.tsx → frontend/src/services/api.ts → GET /api/offers
  → offerService.getAllOffers()
  → les tilbudsfilene
  → slå opp kategorier i SQLite-cachen
  → send resultatet til frontend
  → filtrer, sorter og vis tilbudskort
```

Vanlig visning gjør ingen innhenting fra Tjek og ingen AI-kall.

## 3. Når tilbud oppdateres

Admin-knappen og søndagstimeren kaller samme funksjon: `offerUpdateService.updateOffers()`.

```text
Admin-knapp ─────┐
                ├→ offerUpdateService.updateOffers()
Søndagstimer ────┘    1. Hent tilbud via offerService og tjekApiService.
                     2. Lagre tilbudsfiler og prishistorikk.
                     3. Hent og lagre bilder via imageService.
                     4. Kategoriser nye produkter via categoryService.
                     5. Forsøk usikre kategoriseringer én gang til.
                     6. Lagre statistikk og returner resultatet.
```

Samtidige oppdateringskall deler den pågående jobben. Feil som rapporteres fra butikkinnhentingen følger med i resultatet og statistikken.

`offerUpdateScheduler.ts` sjekker hver time om det er søndag i timen 22–23 etter serverens lokale klokke. Serveren må kjøre for at timeren skal utløses. Dette er ingen ekstern tidsstyrt tjeneste.

## 4. Hvordan kategorisering fungerer

`categoryService.ts` sjekker i denne rekkefølgen:

1. Manuell rettelse for varen på tvers av størrelser.
2. Lagret kategorisering for den konkrete produktnøkkelen.
3. Lagret kategorisering for varen på tvers av størrelser.
4. Hvis ingenting finnes, vises varen som ukategorisert. Under oppdateringsjobben kan den sendes til AI.

`aiCategorization.ts` gjør AI-kallene. Resultatene lagres i SQLite og gjenbrukes. Usikre resultater kan kontrolleres i `AdminReview.tsx`. Den tidligere regelfilen gjorde ingen kategorisering og er fjernet.

### To nøkkeltyper med hvert sitt formål

Alle nye produktnøkler lages i `core/src/utils/productKey.ts`.

| Nøkkel | Eksempel | Bruk |
| --- | --- | --- |
| Produktnøkkel | `testprodukt|500g|x1|meny` | Identifiserer varen med størrelse og butikk, blant annet i prishistorikk og API |
| Kategorinøkkel | `testprodukt|meny` | Deler kategorisering mellom størrelser av samme vare i samme butikk |

Manuelle rettelser lagres på kategorinøkkelen og har prioritet over eldre AI-cache for en bestemt størrelse.

Gamle prisrader slettes eller omskrives ikke. `productKeyAliases.ts` kobler kjente gamle nøkler fra tilbudsfilene til det felles formatet. Prishistorikk kan da hentes med gammel eller ny nøkkel. Historiske nøkler uten tilstrekkelig tilbudsinformasjon, eller med tvetydig enhet, beholdes på gammel nøkkel uten gjetting.

## 5. Endring av kategorier

Å rette kategorien på en vare og å endre kategorilisten er to ulike operasjoner:

- `AdminReview.tsx` → `POST /api/offers/categorize` → `categoryService.ts` → SQLite.
- `CategoryManager.tsx` → kategoriendepunktene → `categoryConfigService.ts` → `categories.json`.

`core/src/config/categories.ts` leser og validerer JSON-filen og holder kategorilisten tilgjengelig for API og AI. Endringer gjelder umiddelbart og overlever omstart. Kildekoden blir ikke skrevet om.

Ved omdøping oppdateres kategoriene i cachen. Ved sletting flyttes berørte cacheoppføringer til «Ukategorisert». Denne standardkategorien kan ikke slettes.

## Hvor dataene ligger

| Data | Plassering |
| --- | --- |
| Tilbud per butikk | `backend/persistence/src/resources/offers/*_offers.json` |
| Tillatte hoved- og underkategorier | `backend/persistence/src/resources/categories.json` |
| Kategoriseringscache, prishistorikk, nøkkelkoblinger og statistikk | `persistence/data/mattilbud.db` |
| Butikkjeder og Tjek-ID-er | `backend/rest/src/config/stores.ts` |
| Butikklogoer | `backend/persistence/src/resources/img/store_logos/` |

Datastiene bestemmes i `backend/rest/src/config/index.ts` og er de samme fra TypeScript og bygget backend. `DB_PATH`, `OFFERS_DIR` og `CATEGORIES_FILE` kan overstyres, blant annet for isolerte tester.

## Hvilken fil endrer jeg?

| Jeg vil endre … | Fil |
| --- | --- |
| Oppdateringsrekkefølge | `backend/core/src/services/offerUpdateService.ts` |
| Tidspunkt for automatisk oppdatering | `backend/core/src/services/offerUpdateScheduler.ts` |
| Hvordan Tjek-data leses og tolkes | `backend/persistence/src/services/tjekApiService.ts` |
| Hvordan tilbud lagres og leses | `backend/core/src/services/offerService.ts` |
| AI-instruksjoner | `backend/core/src/services/aiCategorization.ts` |
| Cacheoppslag og krav til kategorisering | `backend/core/src/services/categoryService.ts` |
| Produktidentitet | `backend/core/src/utils/productKey.ts` |
| Søk, sortering og filtre | `frontend/src/pages/OffersPage.tsx` |
| Manuell kontroll | `frontend/src/components/AdminReview.tsx` |
| Utseendet på et tilbud | `frontend/src/components/grocery/offer-card.tsx` |

## Viktige API-endepunkter

| Metode | Sti | Funksjon |
| --- | --- | --- |
| GET | `/health` | Serverstatus |
| GET | `/api/offers` | Tilbud; valgfritt `?store=Meny` |
| POST | `/api/offers/update` eller `/api/offers/weekly-update` | Samme komplette oppdatering; svar når den er ferdig |
| GET | `/api/offers/review` | Tilbud som trenger kontroll |
| POST | `/api/offers/categorize` | Lagre manuell kategorisering |
| GET | `/api/categories` | Gjeldende kategoriliste |
| POST | `/api/categories/main/{add,remove,rename}` | Administrer hovedkategorier |
| POST | `/api/categories/subcategory/{add,remove,rename}` | Administrer underkategorier |
| GET | `/api/admin/health` | Oppdateringsstatistikk |

Se `routes/offers.ts` for bilde-, prishistorikk- og diagnoseendepunkter.

## Verifisering og vedlikehold

- `npm run build` i backend og frontend kontrollerer TypeScript og bygger appen.
- `npm test` i backend tester oppdatering, kategorier og kompatibilitet med eksisterende data. Testene bruker midlertidige filer og egen SQLite-database, uten eksterne API-kall.
- `backend/analyze_catalogs.js` og `backend/analyze_catalog_diff.js` er diagnoseverktøy for Tjek-kataloger.
- `npm run reimport` i backend erstatter SQLite-cachen med gammel JSON-cache. Dette er et vedlikeholdsverktøy, ikke et oppstartssteg.

Videre oppfølgingspunkter står i [ToDo.txt](ToDo.txt).
