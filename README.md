# Slik fungerer Ukeshandel.no, fra oppstart til tilbud på skjermen

Ukeshandel.no samler dagligvaretilbud fra Tjek, kategoriserer varene og viser dem på én side der du kan søke, filtrere på butikk og kategori og sortere på pris. En administrator starter innhentingen manuelt. «Planlegg ukeshandel» står på forsiden som **Kommer snart**, så den aktive brukerreisen ender i tilbudsoversikten. Forsiden (frontend/src/pages/HomePage.tsx) · Appens sider (frontend/src/App.tsx)

## 1\. Appen starter

På Windows starter `run-app.bat` backend og frontend. Backend er en Express-server på port `5000` som klargjør SQLite-databasen og kjører nødvendige migreringer. Frontend er React med Vite og åpnes på `http://localhost:5173`. Tilbud som allerede ligger på disk, kan vises så snart appen er oppe. Å starte appen utløser ingen innhenting fra Tjek. Oppstartsskript (run-app.bat) · Backendserver (backend/rest/src/server.ts) · Database (backend/core/src/db/db.ts)

## 2\. Administratoren starter innhentingen

På `/admin` logger administratoren inn med nøkkelen som er konfigurert som `ADMIN_API_KEY`, og trykker **Hent og kategoriser tilbud**. Frontend kaller `POST /api/offers/update`. Serveren kontrollerer nøkkelen og gjenbruker den pågående jobben hvis flere oppdateringskall kommer samtidig. Det er denne handlingen som starter den vanlige oppdateringen. Adminside (frontend/src/pages/AdminPage.tsx) · API-ruter (backend/rest/src/routes/offers.ts) · Oppdateringsjobb (backend/core/src/services/offerUpdateService.ts)

## 3\. Backend henter og lagrer tilbud fra Tjek

Backend henter tilbud parallelt for de 12 butikkjedene som er aktivert i konfigurasjonen, blant annet Kiwi, Rema 1000, Meny, Spar og Coop Extra. For hver kjede henter den **den nyest publiserte katalogen** og leser katalogens _hotspots_, som er feltene der Tjek knytter tilbud til katalogen.

Hvert tilbud får blant annet tittel, beskrivelse, tilbudspris, eventuell førpris, mengde, bilde, butikk og gyldighetsdatoer når kilden oppgir dem. Katalogens datoer brukes hvis datoene mangler på selve tilbudet. Backend legger også til butikklogo og forsøker å supplere manglende bildelenker. Deretter lagres tilbudene i én JSON-fil per butikk. Et tomt resultat lar den gamle butikkfilen ligge. Flere Tjek-feil returneres som tomme resultater, så en oppdatering som meldes fullført kan fortsatt inneholde eldre tilbud fra enkelte butikker. Butikkonfigurasjon (backend/rest/src/config/stores.ts) · Tjek-integrasjon (backend/persistence/src/services/tjekApiService.ts) · Tilbudstjeneste (backend/core/src/services/offerService.ts)

## 4\. Systemet finner ut hvilken vare tilbudet gjelder

Standardmodusen skiller mellom **tilbudsforekomst** og **produktkonsept**. En tilbudsforekomst er varen slik den står i én bestemt katalog. Produktkonseptet er varen som kategoriene knyttes til, og kan gjenbrukes for flere tilbud.

Backend lager en forekomst-ID basert på kilden, butikken, katalogen og tilbudets identifikator der den finnes. Prisen inngår ikke i ID-en. Systemet ser først etter en godkjent kobling for den konkrete forekomsten, deretter etter et godkjent globalt alias som matcher den normaliserte tittelen eksakt. Hvis ingen kobling finnes, opprettes et foreløpig konsept. Dermed kan administratoren skille ulike varer med samme generiske tittel og samtidig koble flere tilbud til samme vare når identiteten er bekreftet. Forekomst-ID (backend/core/src/utils/offerOccurrence.ts) · Produktkonsepter og aliaser (backend/core/src/db/productConceptRepo.ts)

## 5\. Backend gjenbruker kategorier eller ber OpenAI om et forslag

Eksisterende klassifiseringer gjenbrukes. Nye konsepter og klassifiseringer som er blitt utdaterte, kan sendes til OpenAI under oppdateringen. Endringer i modell, instruksjon, kategorihierarki eller relevant produktinformasjon kan utløse ny vurdering. Manuelt låste klassifiseringer beholdes. AI-kjøring krever `OPENAI_API_KEY` og kan slås av med `SKIP_AI=true`.

En godkjent klassifisering har én **produkttype** og kan i tillegg ha en primær ingrediens og merkelapper for rett, kosthold og bruk. For eksempel kan en ferdig pizza få produkttypen **Ferdigretter** og rettsmerkelappen **Pizza**. For en pizzabunn kan systemet uttrykke at varen er _til_ pizza. Backend kontrollerer at kategoriene finnes, at kombinasjonen er gyldig, og at produktinformasjonen gir grunnlag for svaret. Ved utilstrekkelig tekst kan systemet prøve med den eksisterende bildelenken. Uavklarte resultater flagges for kontroll. Klassifiseringsflyt (backend/core/src/services/concepts/conceptService.ts) · Kategoriregler og AI-validering (backend/core/src/services/concepts/conceptAI.ts)

## 6\. Backend setter sammen det nettleseren trenger

Når frontend ber om `GET /api/offers`, leser backend tilbudene fra butikkfilene og slår opp klassifiseringene i SQLite. API-et returnerer tilbudet sammen med kategorier, arvede overkategorier og eventuell kontrollstatus. Kategoriarven gjør at et tilbud kan finnes både via en underkategori og via kategorien over den. Når en brukbar konseptklassifisering mangler, kan API-et vise den eldre navnebaserte kategoriseringen og samtidig merke tilbudet for kontroll. Vanlig sidevisning utløser ingen nye Tjek- eller OpenAI-kall. Tilbudstjeneste (backend/core/src/services/offerService.ts) · API-ruter (backend/rest/src/routes/offers.ts)

## 7\. Brukeren finner tilbud på nettsiden

Forsiden viser antall lagrede tilbud og hvor mange butikkjeder de kommer fra. På `/tilbud` kan brukeren velge mellom **Beste tilbud** og **Alle tilbud**, søke i varenavn, beskrivelse, butikk og kategorinavn, velge butikker og kategorier og sortere på pris.

**Beste tilbud** velger opptil ti varer. Når førpris finnes, rangeres de etter prosentvis rabatt, deretter spart beløp i kroner og til slutt laveste pris. Hvis ingen varer kvalifiserer, brukes et tilfeldig utvalg av tilbud med positiv pris. Tilbudskortene viser blant annet vare, butikk, pris og eventuell førpris og rabatt. Selv om forsiden bruker teksten «Tilbud denne uka», teller den de lagrede tilbudene. Tilbudsvisningen filtrerer heller ikke automatisk bort varer etter utløpsdato. Forsiden (frontend/src/pages/HomePage.tsx) · Tilbudssiden (frontend/src/pages/OffersPage.tsx) · Tilbudskort (frontend/src/components/grocery/offer-card.tsx)

## 8\. Administratoren retter klassifiseringer før neste oppdatering

I `/admin` kan administratoren se tilbud som trenger kontroll, søke i alle lagrede tilbud og gjennomgå historiske klassifiseringer. En manuell rettelse låser klassifiseringen for konseptet. Administratoren kan også koble et tilbud til et eksisterende konsept og uttrykkelig godkjenne et globalt alias for fremtidige eksakte treff. Kategorihierarkiet administreres på `/kategorier`. Endringene lagres i SQLite, vises ved neste innlasting og gjenbrukes når neste tilbudsrunde hentes. Kontrollkø (frontend/src/components/AdminReview.tsx) · Aliasadministrasjon (frontend/src/components/ConceptAliasManager.tsx) · Kategoriadministrasjon (frontend/src/components/CategoryManager.tsx)

Oversikten følger koden og standardinnstillingene i arbeidsmappen. Jeg startet ingen innhenting og verifiserte ingen levende tilbudstall.