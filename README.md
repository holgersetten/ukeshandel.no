# Slik fungerer Ukeshandel.no, fra oppstart til tilbud på skjermen

Ukeshandel.no samler dagligvaretilbud fra Tjek, kategoriserer varene og viser dem på én side der du kan søke, filtrere på butikk og kategori og sortere på pris. En administrator starter innhentingen manuelt. «Planlegg ukeshandel» står på forsiden som **Kommer snart**, så den aktive brukerreisen ender i tilbudsoversikten. Forsiden (frontend/src/pages/HomePage.tsx) · Appens sider (frontend/src/App.tsx)

## 1\. Appen starter

På Windows starter `run-app.bat` backend og frontend. Backend er en Express-server på port `5000` som klargjør SQLite-databasen og kjører nødvendige migreringer. Frontend er React med Vite og åpnes på `http://localhost:5173`. Tilbud som allerede ligger på disk, kan vises så snart appen er oppe. Å starte appen utløser ingen innhenting fra Tjek. Oppstartsskript (run-app.bat) · Backendserver (backend/rest/src/server.ts) · Database (backend/core/src/db/db.ts)

## 2\. Administratoren starter innhentingen

På `/admin` logger administratoren inn med nøkkelen som er konfigurert som `ADMIN_API_KEY`, og trykker **Hent og kategoriser tilbud**. Frontend kaller `POST /api/offers/update`. Serveren kontrollerer nøkkelen og gjenbruker den pågående jobben hvis flere oppdateringskall kommer samtidig. Det er denne handlingen som starter den vanlige oppdateringen. Adminside (frontend/src/pages/AdminPage.tsx) · API-ruter (backend/rest/src/routes/offers.ts) · Oppdateringsjobb (backend/core/src/services/offerUpdateService.ts)

## 3\. Backend henter og lagrer tilbud fra Tjek

Backend henter tilbud parallelt for de 12 butikkjedene som er aktivert i konfigurasjonen, blant annet Kiwi, Rema 1000, Meny, Spar og Coop Extra. For hver kjede henter den **den nyest publiserte katalogen** og leser katalogens _hotspots_, som er feltene der Tjek knytter tilbud til katalogen.

Hvert tilbud får blant annet tittel, beskrivelse, tilbudspris, eventuell førpris, mengde, bilde, butikk og gyldighetsdatoer når kilden oppgir dem. Katalogens datoer brukes hvis datoene mangler på selve tilbudet. Backend legger også til butikklogo og forsøker å supplere manglende bildelenker. Deretter lagres tilbudene i én JSON-fil per butikk. Et tomt resultat lar den gamle butikkfilen ligge. Flere Tjek-feil returneres som tomme resultater, så en oppdatering som meldes fullført kan fortsatt inneholde eldre tilbud fra enkelte butikker. Butikkonfigurasjon (backend/rest/src/config/stores.ts) · Tjek-integrasjon (backend/persistence/src/services/tjekApiService.ts) · Tilbudstjeneste (backend/core/src/services/offerService.ts)

## 4. Backend gjenbruker kategorier eller ber OpenAI om et forslag

Backend normaliserer tilbudstittelen og bruker den som nøkkel i SQLite. Originaltittelen beholdes. Tilbud med samme normaliserte navn deler kategorisering, også på tvers av butikker.

Ved oppdatering sendes produkter som mangler en lagret klassifisering til OpenAI i grupper på opptil 30. Modellen foreslår 1–3 direkte kategorier. Usikre eller ugyldige resultater flagges for kontroll. AI-kategorisering krever `OPENAI_API_KEY` og kan slås av med `SKIP_AI=true`. [Kategorisering](backend/core/src/services/categoryService.ts) · [AI-kall](backend/core/src/services/aiCategorization.ts)

## 5. Backend setter sammen det nettleseren trenger

Ved `GET /api/offers` leser backend tilbud fra butikkfilene og slår opp klassifiseringene i SQLite. Svaret inneholder direkte kategorier, arvede overkategorier og kontrollstatus. Sidevisning bruker de lagrede dataene. [Tilbudstjeneste](backend/core/src/services/offerService.ts) · [API-ruter](backend/rest/src/routes/offers.ts)

## 6\. Brukeren finner tilbud på nettsiden

Forsiden viser antall lagrede tilbud og hvor mange butikkjeder de kommer fra. På `/tilbud` kan brukeren velge mellom **Beste tilbud** og **Alle tilbud**, søke i varenavn, beskrivelse, butikk og kategorinavn, velge butikker og kategorier og sortere på pris.

**Beste tilbud** velger opptil ti varer. Når førpris finnes, rangeres de etter prosentvis rabatt, deretter spart beløp i kroner og til slutt laveste pris. Hvis ingen varer kvalifiserer, brukes et tilfeldig utvalg av tilbud med positiv pris. Tilbudskortene viser blant annet vare, butikk, pris og eventuell førpris og rabatt. Selv om forsiden bruker teksten «Tilbud denne uka», teller den de lagrede tilbudene. Tilbudsvisningen filtrerer heller ikke automatisk bort varer etter utløpsdato. Forsiden (frontend/src/pages/HomePage.tsx) · Tilbudssiden (frontend/src/pages/OffersPage.tsx) · Tilbudskort (frontend/src/components/grocery/offer-card.tsx)

## 7\. Administratoren retter klassifiseringer før neste oppdatering

I `/admin` kan administratoren gjennomgå kategoriseringer som trenger kontroll og lagre manuelle rettelser. Rettelsene lagres i SQLite og gjenbrukes ved neste tilbudsoppdatering. Administratoren kan også be om et nytt AI-forsøk for tidligere AI-resultater som trenger gjennomgang. Kategorihierarkiet administreres på `/kategorier`. [Kontrollkø](frontend/src/components/AdminReview.tsx) · [Kategoriadministrasjon](frontend/src/components/CategoryManager.tsx)
