const fs=require('node:fs');const path=require('node:path');
const directory=path.join(__dirname,'../evaluation-results');
const mechanics=JSON.parse(fs.readFileSync(path.join(directory,'unicat-mechanics.json'),'utf8'));
const live=JSON.parse(fs.readFileSync(path.join(directory,'unicat-live-readonly.json'),'utf8'));
const ui=JSON.parse(fs.readFileSync(path.join(directory,'unicat-ui-render.json'),'utf8'));
const labels=value=>value?.length?value.map(a=>a.name+(a.relation?' / '+a.relation:'')).join(', '):'Ingen';
const line=(name,value)=>`- ${name}: ${value===null||value===undefined?'Ukjent / ikke tilgjengelig':value}\n`;
const entry=c=>{
  const classification=Array.isArray(c.activeClassification)?labels(c.activeClassification):JSON.stringify(c.activeClassification);
  return `### ${c.case} — ${c.observedTitle||c.title||'ingen tilsvarende aktuell vare'}\n\n`+
    line('Datagrunnlag',c.dataSource)+line('Treff / konseptstatus',c.match||c.conceptState)+
    line('offerOccurrenceId',c.offerOccurrenceId?`\`${c.offerOccurrenceId}\``:null)+line('concept_id',c.concept_id?`\`${c.concept_id}\``:null)+
    line('Alias brukt',c.aliasUsed?`${c.aliasUsed.normalizedTitle} → ${c.aliasUsed.conceptId}; scope: ${c.aliasUsed.scopeKey}; status: ${c.aliasUsed.status}`:null)+
    line('Nytt / eksisterende konsept',c.conceptState)+line('Aktiv klassifisering',classification)+line('product_type',c.product_type===null?null:labels(c.product_type))+
    line('ingredient',c.ingredient===null?null:labels(c.ingredient))+line('dish',c.dish===null?null:labels(c.dish))+line('source',c.source)+
    line('manual_lock',c.manual_lock)+line('stale',c.stale)+line('needs_review',c.needs_review)+line('Review-årsak',c.reviewReason||'Ingen')+
    line('Bilde-fallback forsøkt',c.imageFallbackAttempted)+
    (c.imageFallbackNote?line('Bilde-merknad',c.imageFallbackNote)+'Ingen bilde-fallback er kjørt i denne skrivebeskyttede kontrollen.\n':'')+'\n';
};
let text=`# UniCat-verifisering — 2. oktober 2026

UniCat-mekanikken er klar for taksonomirydding og revisjon av AI-prompten etter at tre konkrete feil ble rettet. Denne konklusjonen gjelder mekanikken, ikke klassifiseringskvaliteten på hele sortimentet eller godkjenning av en massekjøring.

37 automatiserte tester består (27 eksisterende og 10 nye målrettede tester). Backend og frontend bygger. Ingen prompt, versjonskonstanter eller kategoritaksonomi er endret i denne runden. Ingen gamle AI-resultater er massekjørt. Alle muterende tester bruker midlertidig SQLite og separate tilbudsfiler; alle ekte data er undersøkt gjennom GET-kall og en skrivebeskyttet SQLite-forbindelse.

## Krav og bevis

| Krav | Resultat og verifikasjonsnivå |
| --- | --- |
| 1. Samme tilbud / samme katalog | Bestått gjennom faktisk Tjek-transformering, JSON-lagring og konseptoppslag med mockede katalog/hotspot-svar. Ny innhenting gir samme ID og konsept, og ingen ny AI-kjøring for uendret grunnlag. Alle ${live.offers} ekte tilbud beholder ID ved gjentatt API-lesing. Ingen ny ekstern Tjek-innhenting er gjort. |
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

- ${live.offers} tilbud, ${live.uniqueOccurrences} unike forekomster og ${live.uniqueConcepts} konsepter er lest.
- ${live.review.offers} tilbud / ${live.review.uniqueConcepts} konsepter trenger kontroll. Alle disse tilbudene er stale; det er ikke et mål på antall påviste semantiske feil.
- Alle eksisterende tilbud mangler catalogId og bruker gyldighetsperiode som deterministisk fallback. Den nye Tjek-transformeringen fyller catalogId ved innhenting; dette er verifisert med testdata.
- De to ekte lam-navnevariantene er fremdeles forskjellige legacy-konsepter. Ingen aliasgodkjenning er utført i ekte data i denne runden. Dette er forventet: semantisk deling krever uttrykkelig godkjenning.
- Gamle klassifiseringer mangler normalt ingredient/dish-tags. Legacy-fallback kan vise gamle kategorier uten at disse er gyldige nye facet-assignments. Rapporten viser både det som vises og konseptets assignments.
- Historiske bilde-forsøk er ikke lagret i dagens minimale skjema. De kan ikke utledes fra imageUrl; feltet er derfor ukjent i rapporten for ekte tilbud.
- Databaseinnhold, tilbudsfiler og taksonomifil er identiske før og etter skrivebeskyttet audit: ${JSON.stringify(live.unchanged)}.
- Frontend på port 5173 var ikke tilgjengelig under live-audit. Rendring er derfor verifisert med faktiske komponenter i Vite SSR, og filter/lagring er testet separat. Dette bekrefter ikke interaktiv oppførsel i nettleseren.

## Avgrensning og neste fase

Det nye fasitgrunnlaget her består av 12 representative produkter med kontrollerte AI-svar. Det beviser ID-, alias-, lås-, lagrings-, retry- og API-mekanikk; det beviser ikke at en ekte modell velger riktig kategori eller tolker bilder riktig. Modellens valg er ikke optimalisert eller kvalitetsvurdert her. Tidligere live-AI-rapport er en separat test og er ikke kjørt på nytt i denne runden.

Neste fase kan være taksonomirydding og promptrevisjon, med evalueringssettet som regresjonskontroll. Før massekjøring bør en begrenset prøve med ekte tilbud og ekte bilder gjennomføres, og resultatene vurderes. Eksisterende aliaser i produksjonsdata bør vurderes manuelt; denne verifiseringen godkjenner ingen nye koblinger der.

## Kjør på nytt

Fra backend: npm.cmd test, npm.cmd run unicat:verify og npm.cmd run unicat:verify-live. Sistnevnte krever backend på localhost:5000 og skriver ingen data til databasen. Fra frontend: npm.cmd run unicat:verify-ui og npm.cmd run build. Oppdater denne rapporten med node scripts/writeUnicatVerificationReport.cjs fra backend etter at JSON-rapportene er generert. SSR-sjekken har resultat ${JSON.stringify(ui.checks)}.

## Testdata: alle produkt- og identitetscaser

Fullstendige felt finnes også i backend/evaluation-results/unicat-mechanics.json. Konsept-UUID-er er lokale for denne isolerte testkjøringen; de er ikke produksjons-ID-er. Kategoriene nedenfor er kontrollerte testsvar, ikke en vurdering av optimal taksonomi.

`;
text+=mechanics.cases.map(entry).join('');
text+='## Ekte tilbud: observerte felt\n\nFelt med «ukjent» er ikke målt eller finnes ikke i de aktuelle dataene. Relaterte treff er uttrykkelig merket og må ikke forveksles med eksakt testcase.\n\n';
text+=live.cases.map(entry).join('');
fs.writeFileSync(path.join(__dirname,'../../docs/UniCat-verification.md'),text);
console.log('docs/UniCat-verification.md skrevet med '+mechanics.cases.length+' testcaser og '+live.cases.length+' oppslag i ekte tilbud.');
