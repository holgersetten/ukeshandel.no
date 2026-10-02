# UniCat-verifisering — 2. oktober 2026

UniCat-mekanikken er klar for taksonomirydding og revisjon av AI-prompten etter at tre konkrete feil ble rettet. Denne konklusjonen gjelder mekanikken, ikke klassifiseringskvaliteten på hele sortimentet eller godkjenning av en massekjøring.

37 automatiserte tester består (27 eksisterende og 10 nye målrettede tester). Backend og frontend bygger. Ingen prompt, versjonskonstanter eller kategoritaksonomi er endret i denne runden. Ingen gamle AI-resultater er massekjørt. Alle muterende tester bruker midlertidig SQLite og separate tilbudsfiler; alle ekte data er undersøkt gjennom GET-kall og en skrivebeskyttet SQLite-forbindelse.

## Krav og bevis

| Krav | Resultat og verifikasjonsnivå |
| --- | --- |
| 1. Samme tilbud / samme katalog | Bestått gjennom faktisk Tjek-transformering, JSON-lagring og konseptoppslag med mockede katalog/hotspot-svar. Ny innhenting gir samme ID og konsept, og ingen ny AI-kjøring for uendret grunnlag. Alle 686 ekte tilbud beholder ID ved gjentatt API-lesing. Ingen ny ekstern Tjek-innhenting er gjort. |
| 2. Ny katalog | Testet med samme kilde-tilbuds-ID og ny katalog-ID: ny forekomst-ID, eksisterende konsept via godkjent globalt alias. Dette er testdata. |
| 3. Godkjente aliaser | Begge lam-titler og begge lettrømme-titler deler konsept og klassifisering etter eksplisitt godkjenning. Ingen fuzzy/AI-sammenslåing. |
| 4. Generiske titler | Fjordland holdes atskilt fra Fjordland Fårikål. Testens AI-respons avstår fra klassifisering av merke alene. Ekte Fjordland har et separat legacy-konsept; den gamle AI-klassifiseringen er bevart og stale. |
| 5. Manuell lås | Verifisert i repository, under AI-race, vanlig kategoriseringskjøring og retry-API. AI kan ikke overskrive, og låste konsepter blir ikke sendt til AI av vanlig flyt. |
| 6. Facets | SQL og applikasjon avviser flere product_type/ingredient og feil dish-relasjon. Flere dish, dietary og usage aksepteres. Manuell godkjenning krever én product_type; uavklarte AI-resultater kan ha null. Ingen ny taksonomi er laget for testen. |
| 7. Stale | Prompt-, taksonomi- og modellversjonsmismatch er testet uavhengig i isolert database. AI blir stale; manuell lås og manuell klassifisering påvirkes ikke. |
| 8. Retry | Retry-API sender concept_id og full original tittel, beskrivelse, merke, mengde, størrelse, enhet, antall, periode og imageUrl. Manglende originalgrunnlag avvises. SDK-adapterens faktiske HTTP-payload er testet med mock av transporten. |
| 9. Bilde-fallback | Tilstrekkelig tekst utløser ikke bilde. Utilstrekkelig tekst utløser bilde når URL finnes. Feil ved bilde-forsøk flagger produktet og stanser ikke resten av batchen. Ingen ekte bildehenting eller ekstern bilde-AI er utført. |
| 10. Frontend/API | Tilbuds- og review-API, conceptId/facets, foreldrekategorier, faktisk frontend-filterkode og faktisk lagringshandler er testet. Ekte data har ingen arv-/facet-/review-avvik. Vite SSR rendrer 12 tilbud, facetvelger, dish-relasjoner og review/lås-badges. Ingen interaktiv nettlesertest er utført. |

## Konkrete feil funnet og rettet

1. En ettords-tittel som Kyllingfilet utløste bilde-fallback selv om AI-tekstresultatet var tilstrekkelig. Testen forventet null bilde-forsøk og fikk ett. Bildeheuristikken overstyrer nå ikke et tilstrekkelig tekstresultat.
2. Historikk-API-et filtrerte inn stale resultater, men returnerte lagret needsReview=false og manglet stale-flagget. Det returnerer nå effektiv review-status, stale og korrekt grunn til kontroll; frontend tar med flagget.
3. Historiske rettelser feilet med «Tilbudsforekomsten finnes ikke» når frontend sendte ID for en gammel forekomst. Historiske rettelser sendes nå gjennom concept_id, og bevart originalinformasjon beholdes. Både feilen og rettelsen er verifisert med den faktiske frontend-handleren og HTTP-API-et.

Dette var små korrigeringer av eksisterende flyt; ingen arkitekturendring er innført.

## Observasjoner fra ekte data

- 686 tilbud, 686 unike forekomster og 562 konsepter er lest.
- 665 tilbud / 544 konsepter trenger kontroll. Alle disse tilbudene er stale; det er ikke et mål på antall påviste semantiske feil.
- Alle eksisterende tilbud mangler catalogId og bruker gyldighetsperiode som deterministisk fallback. Den nye Tjek-transformeringen fyller catalogId ved innhenting; dette er verifisert med testdata.
- De to ekte lam-navnevariantene er fremdeles forskjellige legacy-konsepter. Ingen aliasgodkjenning er utført i ekte data i denne runden. Dette er forventet: semantisk deling krever uttrykkelig godkjenning.
- Gamle klassifiseringer mangler normalt ingredient/dish-tags. Legacy-fallback kan vise gamle kategorier uten at disse er gyldige nye facet-assignments. Rapporten viser både det som vises og konseptets assignments.
- Historiske bilde-forsøk er ikke lagret i dagens minimale skjema. De kan ikke utledes fra imageUrl; feltet er derfor ukjent i rapporten for ekte tilbud.
- Databaseinnhold, tilbudsfiler og taksonomifil er identiske før og etter skrivebeskyttet audit: {"databaseRows":true,"offerFiles":true,"taxonomyFile":true}.
- Frontend på port 5173 var ikke tilgjengelig under live-audit. Rendring er derfor verifisert med faktiske komponenter i Vite SSR, og filter/lagring er testet separat. Dette bekrefter ikke interaktiv oppførsel i nettleseren.

## Avgrensning og neste fase

Det nye fasitgrunnlaget her består av 12 representative produkter med kontrollerte AI-svar. Det beviser ID-, alias-, lås-, lagrings-, retry- og API-mekanikk; det beviser ikke at en ekte modell velger riktig kategori eller tolker bilder riktig. Modellens valg er ikke optimalisert eller kvalitetsvurdert her. Tidligere live-AI-rapport er en separat test og er ikke kjørt på nytt i denne runden.

Neste fase kan være taksonomirydding og promptrevisjon, med evalueringssettet som regresjonskontroll. Før massekjøring bør en begrenset prøve med ekte tilbud og ekte bilder gjennomføres, og resultatene vurderes. Eksisterende aliaser i produksjonsdata bør vurderes manuelt; denne verifiseringen godkjenner ingen nye koblinger der.

## Kjør på nytt

Fra backend: npm.cmd test, npm.cmd run unicat:verify og npm.cmd run unicat:verify-live. Sistnevnte krever backend på localhost:5000 og skriver ingen data til databasen. Fra frontend: npm.cmd run unicat:verify-ui og npm.cmd run build. Oppdater denne rapporten med node scripts/writeUnicatVerificationReport.cjs fra backend etter at JSON-rapportene er generert. SSR-sjekken har resultat {"twelveOffersRender":true,"fiveFacetsRender":true,"bothDishRelationsRender":true,"manualLockBadge":true,"staleBadge":true,"reviewReason":true,"editorsClosedInitially":true}.

## Testdata: alle produkt- og identitetscaser

Fullstendige felt finnes også i backend/evaluation-results/unicat-mechanics.json. Konsept-UUID-er er lokale for denne isolerte testkjøringen; de er ikke produksjons-ID-er. Kategoriene nedenfor er kontrollerte testsvar, ikke en vurdering av optimal taksonomi.

### same-catalog-first-fetch — Lettrømme 0,5 %

- Datagrunnlag: synthetic-Tjek-hotspot through real transform and JSON ingestion
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_3243fb4c62962eb681e28c45ba1796143cf1447c97f1ab9d7b1fde2916abff97`
- concept_id: `0ff539fa-c942-4bbd-94d2-e9f3d9f79173`
- Alias brukt: lettrømme 0 5 → 0ff539fa-c942-4bbd-94d2-e9f3d9f79173; scope: offer:occ_3243fb4c62962eb681e28c45ba1796143cf1447c97f1ab9d7b1fde2916abff97; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Rømme, rømme
- product_type: Rømme
- ingredient: rømme
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### same-catalog-refetch — Lettrømme 0,5 %

- Datagrunnlag: synthetic-Tjek-hotspot through real transform and JSON ingestion
- Treff / konseptstatus: existing
- offerOccurrenceId: `occ_3243fb4c62962eb681e28c45ba1796143cf1447c97f1ab9d7b1fde2916abff97`
- concept_id: `0ff539fa-c942-4bbd-94d2-e9f3d9f79173`
- Alias brukt: lettrømme 0 5 → 0ff539fa-c942-4bbd-94d2-e9f3d9f79173; scope: offer:occ_3243fb4c62962eb681e28c45ba1796143cf1447c97f1ab9d7b1fde2916abff97; status: approved
- Nytt / eksisterende konsept: existing
- Aktiv klassifisering: Rømme, rømme
- product_type: Rømme
- ingredient: rømme
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### new-catalog-approved-alias — Lettrømme 0,5 %

- Datagrunnlag: synthetic-Tjek-hotspot through real transform and JSON ingestion
- Treff / konseptstatus: existing
- offerOccurrenceId: `occ_2e9574d8a821c2ccfb6a1b6d6e5b5907e555f0bbe385ade3ede482df384e149e`
- concept_id: `0ff539fa-c942-4bbd-94d2-e9f3d9f79173`
- Alias brukt: lettrømme 0 5 → 0ff539fa-c942-4bbd-94d2-e9f3d9f79173; scope: global; status: approved
- Nytt / eksisterende konsept: existing
- Aktiv klassifisering: Rømme, rømme
- product_type: Rømme
- ingredient: rømme
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### cream — Lettrømme 0,5 %

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_48836444a71424cfc8884148c1d0fc2dc82ef870bda526cfde258bdfc3f6956a`
- concept_id: `0546f367-562e-4ee2-9286-5c77184fbaec`
- Alias brukt: lettrømme 0 5 → 0546f367-562e-4ee2-9286-5c77184fbaec; scope: offer:occ_48836444a71424cfc8884148c1d0fc2dc82ef870bda526cfde258bdfc3f6956a; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Rømme, rømme
- product_type: Rømme
- ingredient: rømme
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### cream-variant — Lettrømme 0.5 prosent

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: existing
- offerOccurrenceId: `occ_3d92bf5c7df6d871e5fb5e8f3582b398223aa0df0642c32c694e9d6ad55c4b1b`
- concept_id: `0546f367-562e-4ee2-9286-5c77184fbaec`
- Alias brukt: lettrømme 0 5 prosent → 0546f367-562e-4ee2-9286-5c77184fbaec; scope: global; status: approved
- Nytt / eksisterende konsept: existing
- Aktiv klassifisering: Rømme, rømme
- product_type: Rømme
- ingredient: rømme
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### scampi — Coop Scampi Hvitløk & Urter

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_1890138049dc83520cf279aee5723b1bf3e49a401e8d8ad8b8d1a173f0514601`
- concept_id: `71cad605-ec5c-4fbc-9e03-6b8413762dc2`
- Alias brukt: coop scampi hvitløk urter → 71cad605-ec5c-4fbc-9e03-6b8413762dc2; scope: offer:occ_1890138049dc83520cf279aee5723b1bf3e49a401e8d8ad8b8d1a173f0514601; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: scampi, Scampi
- product_type: Scampi
- ingredient: scampi
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### lamb — Lam fårikålkjøtt

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_c9b1828f3263696d6cb57932f83781cad2a046635c138506c8afd4e1ff42a32b`
- concept_id: `dd2d309f-1957-49f2-b8bf-9696ee27a763`
- Alias brukt: lam fårikålkjøtt → dd2d309f-1957-49f2-b8bf-9696ee27a763; scope: offer:occ_c9b1828f3263696d6cb57932f83781cad2a046635c138506c8afd4e1ff42a32b; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Fårikål / for_dish, Lammekjøtt, lam
- product_type: Lammekjøtt
- ingredient: lam
- dish: Fårikål / for_dish
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### lamb-variant — Fårikålkjøtt lam

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: existing
- offerOccurrenceId: `occ_17e4aa30cde11da4575a5ca2de624abbb52f5be9c809549cf56ca4e892446988`
- concept_id: `dd2d309f-1957-49f2-b8bf-9696ee27a763`
- Alias brukt: fårikålkjøtt lam → dd2d309f-1957-49f2-b8bf-9696ee27a763; scope: global; status: approved
- Nytt / eksisterende konsept: existing
- Aktiv klassifisering: Fårikål / for_dish, Lammekjøtt, lam
- product_type: Lammekjøtt
- ingredient: lam
- dish: Fårikål / for_dish
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### prepared — Fjordland Fårikål

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_5fdfacb4cabe3d8b1d26a2e072731b30b9394531172371195a4a0bd3c7add5f4`
- concept_id: `bbf18c0b-11e4-4915-834b-ecc0fa45ef66`
- Alias brukt: fjordland fårikål → bbf18c0b-11e4-4915-834b-ecc0fa45ef66; scope: offer:occ_5fdfacb4cabe3d8b1d26a2e072731b30b9394531172371195a4a0bd3c7add5f4; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Ferdigretter, Fårikål / is_dish
- product_type: Ferdigretter
- ingredient: Ingen
- dish: Fårikål / is_dish
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### generic — Fjordland

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_516936c112af2c6d6994e17da07822e33c8ab124e4b741d6724cd04eee4510f1`
- concept_id: `50dc4930-963d-4582-a6a6-fbad755ddb50`
- Alias brukt: fjordland → 50dc4930-963d-4582-a6a6-fbad755ddb50; scope: offer:occ_516936c112af2c6d6994e17da07822e33c8ab124e4b741d6724cd04eee4510f1; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Ingen
- product_type: Ingen
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: true
- Review-årsak: missing_image_for_ambiguous_text, insufficient_evidence, no_categories, requires_one_product_type
- Bilde-fallback forsøkt: false

### chicken — Kyllingfilet

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_b0e8015c13fdc6dabf910d9f54f7ff121ae4c963f01af9216a68894d9aff115b`
- concept_id: `da383512-f460-452e-9beb-1f1d6340bb04`
- Alias brukt: kyllingfilet → da383512-f460-452e-9beb-1f1d6340bb04; scope: offer:occ_b0e8015c13fdc6dabf910d9f54f7ff121ae4c963f01af9216a68894d9aff115b; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Kylling, kylling
- product_type: Kylling
- ingredient: kylling
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### marinated-chicken — Marinert kyllingfilet hvitløk

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_499b79006f85da3e828c820d578423963dabe2a822a5c6270669b1aed5236262`
- concept_id: `4334ad04-a454-47d4-b764-18f562602cba`
- Alias brukt: marinert kyllingfilet hvitløk → 4334ad04-a454-47d4-b764-18f562602cba; scope: offer:occ_499b79006f85da3e828c820d578423963dabe2a822a5c6270669b1aed5236262; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Kylling, kylling
- product_type: Kylling
- ingredient: kylling
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### pizza — Ferdigpizza

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_b25e8184079bbd91379f492d00450d2c4cd6cc2ccacafbd068ba728d0cf8809f`
- concept_id: `d59b434b-893d-4314-82f3-e5a9cb977285`
- Alias brukt: ferdigpizza → d59b434b-893d-4314-82f3-e5a9cb977285; scope: offer:occ_b25e8184079bbd91379f492d00450d2c4cd6cc2ccacafbd068ba728d0cf8809f; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Pizza, Pizza / is_dish
- product_type: Pizza
- ingredient: Ingen
- dish: Pizza / is_dish
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### vegetarian — Vegetarrett glutenfri

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_25e5935affc991c06db5255727d5511243eb5473c76e7df29d9e5b766483a452`
- concept_id: `37f54b24-afc9-41a3-8526-6924cc62482c`
- Alias brukt: vegetarrett glutenfri → 37f54b24-afc9-41a3-8526-6924cc62482c; scope: offer:occ_25e5935affc991c06db5255727d5511243eb5473c76e7df29d9e5b766483a452; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Vegetarretter, Glutenfri, Vegetar
- product_type: Vegetarretter
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

### vague — Ukens favoritt

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_e4feda6adfced0b6c5f1f99ef08b2ea8cf177582e47f4f6ec340b5491e392872`
- concept_id: `2d953240-ff31-4d31-9cf8-9f6af22cc9c2`
- Alias brukt: ukens favoritt → 2d953240-ff31-4d31-9cf8-9f6af22cc9c2; scope: offer:occ_e4feda6adfced0b6c5f1f99ef08b2ea8cf177582e47f4f6ec340b5491e392872; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: scampi, Scampi
- product_type: Scampi
- ingredient: scampi
- dish: Ingen
- source: ai
- manual_lock: false
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: true

### lamb-after-manual-lock — Lam fårikålkjøtt

- Datagrunnlag: synthetic-fixture
- Treff / konseptstatus: new
- offerOccurrenceId: `occ_c9b1828f3263696d6cb57932f83781cad2a046635c138506c8afd4e1ff42a32b`
- concept_id: `dd2d309f-1957-49f2-b8bf-9696ee27a763`
- Alias brukt: lam fårikålkjøtt → dd2d309f-1957-49f2-b8bf-9696ee27a763; scope: offer:occ_c9b1828f3263696d6cb57932f83781cad2a046635c138506c8afd4e1ff42a32b; status: approved
- Nytt / eksisterende konsept: new
- Aktiv klassifisering: Fårikål / for_dish, Lammekjøtt, lam
- product_type: Lammekjøtt
- ingredient: lam
- dish: Fårikål / for_dish
- source: manual
- manual_lock: true
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: false

## Ekte tilbud: observerte felt

Felt med «ukjent» er ikke målt eller finnes ikke i de aktuelle dataene. Relaterte treff er uttrykkelig merket og må ikke forveksles med eksakt testcase.

### Lettrømme 0,5 % — TINE LETTRØMME OG EKSTRA LETT

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: related-only-not-the-requested-exact-product
- offerOccurrenceId: `occ_4ebbaad95deeb3a4b4b4fe4f4a9be885b876c2563729dd38dd4b37001fa9b244`
- concept_id: `legacy_f2b3a2e70109048b4d160a3fe3af4b8e2af2e211ce330e6b321bd4c80aa2b27a`
- Alias brukt: tine lettrømme og ekstra lett → legacy_f2b3a2e70109048b4d160a3fe3af4b8e2af2e211ce330e6b321bd4c80aa2b27a; scope: offer:occ_4ebbaad95deeb3a4b4b4fe4f4a9be885b876c2563729dd38dd4b37001fa9b244; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"concept","displayedCategories":[{"id":"d7752f191461d4143c228664","name":"Rømme"}],"conceptAssignments":[{"categoryId":"d7752f191461d4143c228664","facet":"product_type","relation":"","name":"Rømme"}]}
- product_type: Rømme
- ingredient: Ingen
- dish: Ingen
- source: manual
- manual_lock: true
- stale: false
- needs_review: false
- Review-årsak: Ingen
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Navnevariant av lettrømme — ingen tilsvarende aktuell vare

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: not-found-in-current-offers
- offerOccurrenceId: Ukjent / ikke tilgjengelig
- concept_id: Ukjent / ikke tilgjengelig
- Alias brukt: Ukjent / ikke tilgjengelig
- Nytt / eksisterende konsept: Ukjent / ikke tilgjengelig
- Aktiv klassifisering: null
- product_type: Ukjent / ikke tilgjengelig
- ingredient: Ukjent / ikke tilgjengelig
- dish: Ukjent / ikke tilgjengelig
- source: Ukjent / ikke tilgjengelig
- manual_lock: Ukjent / ikke tilgjengelig
- stale: Ukjent / ikke tilgjengelig
- needs_review: Ukjent / ikke tilgjengelig
- Review-årsak: Ingen
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig

### Coop Scampi Hvitløk & Urter — COOP SCAMPI

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: related-only-not-the-requested-exact-product
- offerOccurrenceId: `occ_458fef7b1d94b2ce4eba88ad18883eaf6d3064bd8d2e7bc50a522635f3b36e1d`
- concept_id: `legacy_fdd5adffaa3084afd47a48bf49f898b570164fba8152d2003e89a51e959de9ca`
- Alias brukt: coop scampi → legacy_fdd5adffaa3084afd47a48bf49f898b570164fba8152d2003e89a51e959de9ca; scope: offer:occ_458fef7b1d94b2ce4eba88ad18883eaf6d3064bd8d2e7bc50a522635f3b36e1d; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"concept","displayedCategories":[{"id":"c3782078f6d7a77a2100be6a","name":"Skalldyr"}],"conceptAssignments":[{"categoryId":"c3782078f6d7a77a2100be6a","facet":"product_type","relation":"","name":"Skalldyr"}]}
- product_type: Skalldyr
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: true
- needs_review: true
- Review-årsak: legacy_ai_stale
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Lam fårikålkjøtt — LAM FÅRIKÅLKJØTT

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: current-title-match
- offerOccurrenceId: `occ_6d1314c7690bcb02c9ebb6dc7552db0b3fddcbdea37f5a42da8849b4335208b2`
- concept_id: `legacy_151dff47846cb4d8f26217420e09fc7cbc1c75dd6e1fc1f1cf96ac90c4b56c0f`
- Alias brukt: lam fårikålkjøtt → legacy_151dff47846cb4d8f26217420e09fc7cbc1c75dd6e1fc1f1cf96ac90c4b56c0f; scope: offer:occ_6d1314c7690bcb02c9ebb6dc7552db0b3fddcbdea37f5a42da8849b4335208b2; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"concept","displayedCategories":[{"id":"9a101bf032d63d0147b6c6cd","name":"Viltkjøtt"}],"conceptAssignments":[{"categoryId":"9a101bf032d63d0147b6c6cd","facet":"product_type","relation":"","name":"Viltkjøtt"}]}
- product_type: Viltkjøtt
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: true
- needs_review: true
- Review-årsak: legacy_ai_stale
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Fårikålkjøtt lam — FÅRIKÅLKJØTT LAM

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: current-title-match
- offerOccurrenceId: `occ_f6aafe9979bbec73174b217132b60fa4b3838805d9bb81134c4f7f7c32d1d520`
- concept_id: `legacy_bc382bd0fc299a7aa395b3d85fbd62cca6fa2ee90f0027b446b4819e7e76ec54`
- Alias brukt: fårikålkjøtt lam → legacy_bc382bd0fc299a7aa395b3d85fbd62cca6fa2ee90f0027b446b4819e7e76ec54; scope: offer:occ_f6aafe9979bbec73174b217132b60fa4b3838805d9bb81134c4f7f7c32d1d520; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"concept","displayedCategories":[{"id":"3e9b08a1a6ecfe971622242b","name":"Kjøtt"}],"conceptAssignments":[{"categoryId":"3e9b08a1a6ecfe971622242b","facet":"product_type","relation":"","name":"Kjøtt"}]}
- product_type: Kjøtt
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: true
- needs_review: true
- Review-årsak: legacy_ai_stale
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Fjordland Fårikål — FÅRIKÅL

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: related-only-not-the-requested-exact-product
- offerOccurrenceId: `occ_fad90075fb8ca20db339242370640debd675abef47bf96d4d050a1f99e587711`
- concept_id: `legacy_317ad539a4cffc9441364c8bb20628cc534a437a551566c186140009c2f185d6`
- Alias brukt: fårikål → legacy_317ad539a4cffc9441364c8bb20628cc534a437a551566c186140009c2f185d6; scope: offer:occ_fad90075fb8ca20db339242370640debd675abef47bf96d4d050a1f99e587711; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"legacy-fallback","displayedCategories":[{"id":"78832e2ffd8b08d963edf826","name":"Middag"},{"id":"f39965a5cc9edac44cb89cf9","name":"Kjøttkaker og kjøttboller"}],"conceptAssignments":[]}
- product_type: Ingen
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: true
- needs_review: true
- Review-årsak: legacy_taxonomy_conflict, legacy_ai_stale
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Generisk Fjordland — Fjordland

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: current-title-match
- offerOccurrenceId: `occ_c6b8e89333348be797c1c589f79e298a38333c192cf0fffc13fd7fdee19899aa`
- concept_id: `legacy_0903ebe460aaf317ed962acd84b2db5aac2601eed4518f0b03b9e28238fcca25`
- Alias brukt: fjordland → legacy_0903ebe460aaf317ed962acd84b2db5aac2601eed4518f0b03b9e28238fcca25; scope: offer:occ_c6b8e89333348be797c1c589f79e298a38333c192cf0fffc13fd7fdee19899aa; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"concept","displayedCategories":[{"id":"855f97b2c5713d5e40f27fd0","name":"Ferdigretter"}],"conceptAssignments":[{"categoryId":"855f97b2c5713d5e40f27fd0","facet":"product_type","relation":"","name":"Ferdigretter"}]}
- product_type: Ferdigretter
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: true
- needs_review: true
- Review-årsak: legacy_ai_stale
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Vanlig kyllingfilet — KYLLINGFILET

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: current-title-match
- offerOccurrenceId: `occ_62952125ede36828a8b1c38b20840547e0197fcb9b6363b93b2ad286061df1b9`
- concept_id: `legacy_9b35c463fb12bbf5057f84d00f76625bc406d636da299d2d5a5deebca9bea6c2`
- Alias brukt: kyllingfilet → legacy_9b35c463fb12bbf5057f84d00f76625bc406d636da299d2d5a5deebca9bea6c2; scope: offer:occ_62952125ede36828a8b1c38b20840547e0197fcb9b6363b93b2ad286061df1b9; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"concept","displayedCategories":[{"id":"779f5c08855825ab1085e83e","name":"Kylling"}],"conceptAssignments":[{"categoryId":"779f5c08855825ab1085e83e","facet":"product_type","relation":"","name":"Kylling"}]}
- product_type: Kylling
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: true
- needs_review: true
- Review-årsak: legacy_ai_stale
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Marinert kyllingfilet — PRIOR KYLLINGFILET PEPPER & HVITLØK

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: related-only-not-the-requested-exact-product
- offerOccurrenceId: `occ_44fddc83893f3d2af1374960dac6e38f1811f253618af7600a2de35531d53463`
- concept_id: `legacy_d7d4df09edc8b291257c11cac273d18195ed057589a3cea1dd6ee75810f15206`
- Alias brukt: prior kyllingfilet pepper hvitløk → legacy_d7d4df09edc8b291257c11cac273d18195ed057589a3cea1dd6ee75810f15206; scope: offer:occ_44fddc83893f3d2af1374960dac6e38f1811f253618af7600a2de35531d53463; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"legacy-fallback","displayedCategories":[{"id":"3e9b08a1a6ecfe971622242b","name":"Kjøtt"},{"id":"baf01ff55d7ea681b3594a75","name":"Kylling og fjærkre"}],"conceptAssignments":[]}
- product_type: Ingen
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: true
- needs_review: true
- Review-årsak: legacy_taxonomy_conflict, legacy_ai_stale
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Ferdigpizza — PIZZA SUPREME SALAME

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: current-title-match
- offerOccurrenceId: `occ_8e5b4dc174c50673485cb10563cc23e6f9297994521493c6536eb5130c01995b`
- concept_id: `legacy_560586478f1e2fc88126c2cbdaa050751409fb6ccfdca11e52c4795eba259ec2`
- Alias brukt: pizza supreme salame → legacy_560586478f1e2fc88126c2cbdaa050751409fb6ccfdca11e52c4795eba259ec2; scope: offer:occ_8e5b4dc174c50673485cb10563cc23e6f9297994521493c6536eb5130c01995b; status: approved
- Nytt / eksisterende konsept: existing; read-only audit creates nothing
- Aktiv klassifisering: {"layer":"legacy-fallback","displayedCategories":[{"id":"0b085c562c2b1e7631968593","name":"Pizza"},{"id":"3e9b08a1a6ecfe971622242b","name":"Kjøtt"}],"conceptAssignments":[]}
- product_type: Ingen
- ingredient: Ingen
- dish: Ingen
- source: ai
- manual_lock: false
- stale: true
- needs_review: true
- Review-årsak: legacy_taxonomy_conflict, legacy_ai_stale
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig
- Bilde-merknad: Historical attempts are not persisted; cannot infer them from imageUrl
Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.

### Vegetarvare — ingen tilsvarende aktuell vare

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: not-found-in-current-offers
- offerOccurrenceId: Ukjent / ikke tilgjengelig
- concept_id: Ukjent / ikke tilgjengelig
- Alias brukt: Ukjent / ikke tilgjengelig
- Nytt / eksisterende konsept: Ukjent / ikke tilgjengelig
- Aktiv klassifisering: null
- product_type: Ukjent / ikke tilgjengelig
- ingredient: Ukjent / ikke tilgjengelig
- dish: Ukjent / ikke tilgjengelig
- source: Ukjent / ikke tilgjengelig
- manual_lock: Ukjent / ikke tilgjengelig
- stale: Ukjent / ikke tilgjengelig
- needs_review: Ukjent / ikke tilgjengelig
- Review-årsak: Ingen
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig

### Svært vag tittel — ingen tilsvarende aktuell vare

- Datagrunnlag: real-stored-offers
- Treff / konseptstatus: not-found-in-current-offers
- offerOccurrenceId: Ukjent / ikke tilgjengelig
- concept_id: Ukjent / ikke tilgjengelig
- Alias brukt: Ukjent / ikke tilgjengelig
- Nytt / eksisterende konsept: Ukjent / ikke tilgjengelig
- Aktiv klassifisering: null
- product_type: Ukjent / ikke tilgjengelig
- ingredient: Ukjent / ikke tilgjengelig
- dish: Ukjent / ikke tilgjengelig
- source: Ukjent / ikke tilgjengelig
- manual_lock: Ukjent / ikke tilgjengelig
- stale: Ukjent / ikke tilgjengelig
- needs_review: Ukjent / ikke tilgjengelig
- Review-årsak: Ingen
- Bilde-fallback forsøkt: Ukjent / ikke tilgjengelig

