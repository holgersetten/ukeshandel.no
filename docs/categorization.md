# Minimal konseptbasert kategorisering

Tilbudene ligger fortsatt i butikkens JSON-filer. Original tittel, beskrivelse, mengde, merke, katalog, gyldighet og imageUrl følger AI-forsøk og lagres som grunnlag på klassifiseringen. Ingen bilder lastes ned eller lagres lokalt.

## Identitet og pipeline

1. `offerOccurrenceId` er SHA-256 av versjonert kilde + normalisert butikk + katalog-ID + tilbuds-ID. Uten tilbuds-ID brukes hotspot-ID, ellers normalisert tittel og original beskrivelse/mengde/enhet. Pris inngår ikke. Uten katalog brukes gyldighetsperiode. Mangler både katalog og periode, beholdes gammel flyt og varen merkes for kontroll. ID-en er aldri en produktidentitet på tvers av kataloger.
2. Finn godkjent kobling for forekomsten først, deretter godkjent globalt alias for eksakt normalisert tittel. Ellers opprettes et foreløpig konsept. Samme forekomst gjenbruker konsept selv om tittelen korrigeres. Ingen fuzzy matching eller AI slår sammen konsepter.
3. Manuelt låste konsepter hopper over AI. AI-resultater blir stale ved endret prompt/policy, taksonomi, modell eller relevant originalinformasjon.
4. AI velger én produkttype, eventuelt én primær ingrediens, og flere andre tags. Retter har `is_dish` eller `for_dish`. Smakstilsetninger blir ikke ingredienssubstitutter. Sekundære ingredienser er utelatt i denne minimale versjonen.
5. Valider kategori-ID, facet, kardinalitet, relasjon, foreldre/underkategorier og dokumentasjon fra produktgrunnlaget. Eksplisitte rettsnavn uten dish-tag krever ny vurdering. Confidence er kun metadata. Ufullstendige batch-svar får høyst ett isolert tekstforsøk.
6. Utilstrekkelig tekst utløser bilde-fallback med eksisterende imageUrl. Manglende/feilet bilde og ugyldige svar merkes for kontroll. Et feilet forsøk erstatter ikke tidligere klassifisering. Retry bruker lagret originalgrunnlag og avviser historiske konsepter uten slikt grunnlag.
7. Administrasjonen kan rette facets og godkjenne kobling til et eksisterende konsept. Globalt alias må velges uttrykkelig. Gamle konseptavgjørelser slettes ikke ved ny kobling.

## Database

Det konkrete SQL-skjemaet finnes i `backend/core/src/db/conceptMigration.ts`. Fem nye tabeller:

| Tabell | Formål |
| --- | --- |
| taxonomy_categories | Parallelle kategorier med parent_id, facet, definisjon, assignable og active |
| product_concepts | Kanonisk produktnavn og provisional/confirmed |
| concept_aliases | Eksakt normalisert tittel, scope_key (`global` eller `offer:<id>`), konsept og godkjenningsstatus |
| concept_classifications | Klassifisering per konsept, manual_lock, prompt_version, taxonomy_version, model, original input_json/input_hash og kontrollmetadata |
| concept_categories | Direkte kategori/facet/relasjon per konsept |

SQL-indekser håndhever maksimalt én product_type og én ingredient. Fremmednøkler håndhever samsvar med kategoriens facet. Dish-relasjon håndheves med CHECK. Applikasjonen krever nøyaktig én product_type ved godkjenning; uavklarte konsepter kan ha null.

## Migrering og reversering

Migreringen er additiv, transaksjonell og idempotent. Første migrering tar en SQLite-sikkerhetskopi med `.before-concepts-<timestamp>.db`. Eksisterende kategoritabeller, klassifiseringer og tilbudsfiler beholdes. `taxonomy_categories` er bevisst separat fra gammel `categories` for å gjøre tilbakeføring enkel.

Gamle avgjørelser importeres per normalisert navn, med forekomstkoblinger kun for tilgjengelige originaltilbud. Ingen gamle titler blir globale aliaser automatisk. Manuelle avgjørelser låses. AI-resultater importeres med legacy-versjoner og er stale. Klassifiseringer som ikke kan mappes sikkert merkes `legacy_taxonomy_conflict`; originalen blir tilgjengelig gjennom fallback. Historikk uten original produktinformasjon beholdes og kan rettes manuelt, men sendes ikke til AI med et fabrikert grunnlag.

Standardmodus er `concept`, med gammel klassifisering som fallback. Sett `CATEGORY_MODE=legacy` og start backend på nytt for å bruke den gamle flyten. `CATEGORY_MODE=shadow` lar gammel flyt styre visningen mens begge klassifiserer ved innhenting. Tilbakeføring sletter ikke nye data, men nye manuelle avgjørelser vises bare i konseptmodus; gammel modus bruker sine opprinnelige tabeller. Full fysisk tilbakeføring krever stoppet backend og gjenoppretting fra sikkerhetskopien; dette forkaster senere endringer og gjøres ikke automatisk.

Fra `backend`:

```powershell
npm.cmd run concepts:preview
npm.cmd run concepts:migrate
npm.cmd test
npm.cmd run categories:validate
npm.cmd run categories:evaluate -- --output evaluation-results/category-gold-final.json
```

AI-modellen kan overstyres med `CATEGORY_MODEL`; standard er `gpt-4.1-mini`. `SKIP_AI=true` stopper AI-forsøk. Ny klassifisering skjer ved innhenting eller eksplisitt retry, ikke ved visning av tilbud.

## Måling

Versjonert fasit ligger i `backend/tests/fixtures/category-gold.v1.json`. Evalueringsscriptet bruker en isolert midlertidig database, rapporterer eksakt treff, produkttypetreff, kontrollandel og precision/recall per facet. `--validate` sjekker fasit og konseptidentitet uten AI; det er ikke en kvalitetsmåling av modellen. `--live` måler faktisk AI og koster API-bruk. Oppgi en ny outputfil for sammenligning før/etter endringer. Åtte eksempler er et første regresjonssett, ikke bevis for kvalitet på hele sortimentet. Bilde-fallback er dekket av systemtest med mock; ekte bildeklassifisering er ikke målt i dette fasitsettet.

Ingen gammel kode er fjernet. Evalueringsrapporter fra tidligere promptforsøk er beholdt for sammenligning.
