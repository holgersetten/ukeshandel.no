# Kategorisering

Se [systemoversikten](../README.md) for dataflyt, migrering, API og begrensninger.

Kategorisering slås opp utelukkende med `normalizedName`. Original tilbudstittel beholdes. Direkte kategorier lagres med ID, og deres foreldre arves automatisk gjennom `parentId`.

AI foreslår 1–3 direkte kategorier. Usikre resultater lagres for kontroll; de sendes ikke automatisk på nytt. Manuelle rettelser overstyrer AI, og gjenbrukes mellom butikker.

Kategorier og klassifiseringer lagres nå i SQLite. `persistence/src/resources/categories.json` brukes bare til førstegangsimport av det gamle hierarkiet.
