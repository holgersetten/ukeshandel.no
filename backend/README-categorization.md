# Kategorisering

Start med [systemoversikten i README](../README.md), særlig «Hvordan kategorier velges».

- `persistence/src/resources/categories.json` inneholder kategorihierarkiet.
- `core/src/config/categories.ts` leser, validerer og oppdaterer kategoridata.
- `core/src/utils/productKey.ts` lager produkt- og kategorinøkler.
- `core/src/services/categoryService.ts` slår opp cache og koordinerer AI-kategorisering. Manuelle rettelser har prioritet.
- `core/src/services/aiCategorization.ts` gjør batchkall til AI. `SKIP_AI=true` deaktiverer disse.
- `core/src/db/categoryCacheRepo.ts` lagrer produktkategorisering i SQLite.
- `frontend/src/components/AdminReview.tsx` viser tilbud for manuell kontroll.

Et resultat krever minst 0,90 for hovedkategori, 0,88 for underkategori og 0,90 for ingrediensnøkkel for å få status med høy sikkerhet (modellens egen vurdering, ikke målt treffsikkerhet). Hovedkategorien «Ukategorisert» krever kontroll.

Oppdateringsjobben i `offerUpdateService.ts` kjører kategorisering med ett nytt forsøk for usikre resultater. Vanlig visning av tilbud bruker bare eksisterende cache.
