# UniCat: promptrevisjon etter taxonomy-v2.2

## Hvilken prompt brukes?

I standardmodus `CATEGORY_MODE=concept` brukes `SYSTEM_PROMPT` i
`backend/core/src/services/concepts/conceptAI.ts`, med standardmodell `gpt-4.1-mini`.
`CATEGORY_MODEL` kan overstyre modellen. Den separate inline-prompten i
`aiCategorization.ts` er legacy-prompten (`gpt-4o-mini`), brukt i legacy/shadow-modus.
Fallback i konseptmodus leser gammel klassifisering; det kjører ikke legacy-prompten.
En allerede startet backend må restartes for å laste revidert kode.

## Audit før endringer

- Prompten forklarte facets, men manglet tydelige kontraster for smak/ingredient,
  råvare/ferdigrett, eksplisitt bruksområde og dietary-dokumentasjon.
- Output-instruksjonen om tomme `assignments` stemte ikke med modellens wire-format:
  `productTypeKey`, `ingredientKey`, `dishes`, `dietaryKeys`, `usageKeys`.
- Adapteren fjernet definitions som startet med «Produkt av typen» eller «Velg denne brede».
  Dermed fikk modellen ikke hele den autoritative kategoriavgrensningen.
- Taxonomy kom fra databasen; JSON Schema begrenset valgene til aktive/tildelbare
  kategorier. Foreldrekontekst lå i kategoristien, men hadde ikke et eksplisitt parent-felt.
- Original tittel, beskrivelse og øvrig metadata var allerede tilgjengelig ved retry.
  Normalisering erstattet ikke originalinformasjonen i konseptflyten.
- Første kall brukte tekst. Bildet ble sendt ved utilstrekkelig tekst; feil var isolert
  per konsept. `imageAvailable` var ikke tydelig skilt fra et faktisk vedlagt bilde.
- Confidence alene utløste ikke review i UniCat. Eksisterende evidens-, facet- og
  dish-kontroller ga øvrige review-grunner; gamle manuelle avgjørelser var låst.
- Dish-omission-kontrollen brukte brede ordtreff, som kunne kreve Pizza ved pizzasmak.

## Endringer

Promptens struktur er oppgave, autoritativ taksonomi, fem facets, kilder/bilde,
usikkerhet, eksakt svarformat/evidens og kontrasteksempler. Den forklarer at name er
etikett, facet er betydning, definition avgrenser bruk og parent gir arv.
Ingen parallell kategorioversikt eller hardkodede kategori-ID-er er innført.

Alle aktive kategorier sendes med hele definition og `parentKey`. Navigation-only
foreldre gir kontekst, mens JSON Schema bare tillater de 249 aktive/tildelbare valgene.
Original metadata beholdes, med eksisterende pris/valuta som ekstra kontekst.
`imageAttached` skiller et faktisk vedlagt bilde fra en tilgjengelig URL.

Confidence under 0,90 eller manglende confidence gir review. Høy confidence kan ikke
omgå struktur/evidens. Sitater skal være bokstavrette, og bilde-evidens krever en
vedlagt HTTP(S)-bildekilde på riktig inputIndex. Dish-omission-kontrollen skiller
eksplisitt rett/komponent fra smak, negasjon og tilfeldige oppskriftsreferanser.
Kontrollen tildeler aldri kategorier selv. Disse kvalitetsreglene er versjonert som
`evidence-v3`; ingen lagringsmodell eller konsept-/aliaslogikk er endret.

Versjon før: `concept-classification-v4:evidence-v2`.
Versjon etter: **`concept-classification-v7:evidence-v3`**.
v5 og v6 var avgrensede testrevisjoner; rapportene beholdes for sporbarhet.
Modell: uendret `gpt-4.1-mini`.
Taxonomy: uendret `taxonomy-v2.2:2336a75f264c98dc09bce96a15ec1d8888a2d43f5b9f51642d98c092b2d9ffa5`.

## Verifisering

- 55/55 systemtester består, inkludert åtte nye prompt-/adapter-/kvalitetstester.
- Backend TypeScript-build består. Frontend er ikke endret i denne oppgaven.
- Versjonert `category-gold.v2.json`: 29 cases + tre identitetspar, offline validert.
- Ekte AI på fasit: 29/29 består; fem cases går til review som forventet.
- A–J er dekket, i tillegg til rå/marinert kylling, potet, fiskekaker, dokumentert
  vegetar/vegansk/glutenfri, eksplisitt baking, pizzasmak, titler uten beskrivelse,
  blandet ferdigrettsutvalg og et ubestemt rettsnavn.
- Tester av image-feil, eksakte sitater, inaktive/navigation-only valg,
  confidence-review og manual lock bruker mock/isolert testdatabase.

Ekte tilbud er hentet uendret fra eksisterende JSON-filer (historiske septembertilbud,
ikke en kontroll av dagens priser/gyldighet). Alle 13 hadde tom description, og alle
fikk tom dietary og usage. Ingen av de 686 lokale tilbudene hadde eksplisitt
vegetar/vegansk/glutenfri i tekst; disse positive tilfellene er derfor målt med
syntetisk fasit og ekte AI, ikke ekte tilbud med slik merking.

| Original title | product_type | ingredient | dish/relation | Bilde brukt | Confidence | needsReview | Vurdering |
|---|---|---|---|---|---|---|---|
| KYLLINGFILET | Kylling | kylling | — | nei | 0,95 | false | Riktig |
| PRIOR KYLLINGFILET PEPPER & HVITLØK | Kylling | kylling | — | nei | 0,95 | false | Riktig, ingen hvitløk-ingredient |
| COOP SCAMPI | Scampi | scampi | — | nei | 0,95 | false | Riktig |
| LAM FÅRIKÅLKJØTT | Lammekjøtt | lam | Fårikål/for_dish | nei | 0,95 | false | Riktig |
| FÅRIKÅLKJØTT LAM | Lammekjøtt | lam | Fårikål/for_dish | nei | 0,95 | false | Riktig, samme semantikk |
| TINE LETTRØMME OG EKSTRA LETT | Rømme | rømme | — | nei | 0,95 | false | Riktig |
| MOZZARELLA | Mozzarella | ost | — | nei | 0,95 | false | Riktig, ingen automatisk Pizza |
| PIZZABUNN PRIME RUND | Pizzabunn | null | Pizza/for_dish | nei | 0,95 | false | Riktig |
| GRANDIOSA PEPPERONI PIZZA | Ferdigretter | null | Pizza/is_dish | nei | 0,95 | false | Riktig |
| FÅRIKÅL M/POTETER | Ferdigretter | null | Fårikål/is_dish | ja | 0,95 | false | Riktig; bildet viser Fjordland ferdigrett |
| FÅRIKÅL | Ferdigretter | null | Fårikål/is_dish | ja | 0,95 | false | Riktig; bildet avklarer produktformen |
| Fjordland | Ferdigretter | null | — | ja | 0,95 | false | Svakhet: blandet utvalg burde fortsatt gå til review |
| HVITLØKSBRØD | Brød | null | — | nei | 0,90 | false | Riktig, ingen hvitløk-ingredient |

Full input, description, valgt kategori-ID, evidens, kall, confidence og review finnes
i `backend/evaluation-results/real-offers-prompt-v7.json`.
Fasitrapport: `backend/evaluation-results/category-gold-v2-prompt-v7-live.json`.
Offline-rapport: `backend/evaluation-results/category-gold-v2-prompt-v7-validation.json`.

## Observerte begrensninger og neste steg

Fasit 29/29 er ikke bevis på allmenn kvalitet. v5 bestod sitt daværende fasitsett,
men feilet på to kyllingtyper og manglet dish på to ekte lam-tilbud. v6 rettet disse,
men feiltolket rettsnavnet FÅRIKÅL som rått lam og manglet pasta-ingredient i ett fasitcase.
v7 retter disse tilfellene i siste måling.

Fjordland-bildet viser pasta med ost-/skinkesaus og kjøttsuppe under «Plukk & miks».
Modellen følger ikke konservativ sortimentsregel stabilt: v6 sendte det til review,
v7 godtok den brede felles typen med 0,95. Dette vurderes som en review-feil, selv om
Ferdigretter er felles for de viste varene. Confidence er fortsatt ofte 0,95 og er
ikke kalibrert. Eksakte sitater beviser kildebruk, men garanterer ikke semantikken.
Strict JSON Schema sikrer format, ikke korrekt klassifisering.

Anbefaling: klart for et større, avgrenset **isolert evalueringssample** med manuell
vurdering og vekt på blandede annonser, bildesaker og kostholdsmerking. Ikke klart
for bred reklassifisering som automatisk skriver til eksisterende konseptdata.
Promptendringen alene har ikke gitt garanti for konservativ review i alle tilfeller.

Ingen produksjons-retry eller massekjøring ble utført. SQLite-tabellene for taxonomy,
konsepter, aliaser, klassifiseringer, assignments og migreringer er byte-identiske
på radnivå før/etter; SHA-256:
`54318e2a05aa8c2575b73bfd904242ee6444db4ec05980ba51e5265528deac32`.
Tilbudsfilene og taxonomy-filen er uendret. 113 manuelt låste konseptklassifiseringer
og de gamle manuelle avgjørelsene/historikken er bevart. Gamle AI-resultater blir
stale gjennom versjonssjekken; ingen rader er omskrevet.

OpenAI-referanser brukt ved revisjonen:
[Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
og [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
