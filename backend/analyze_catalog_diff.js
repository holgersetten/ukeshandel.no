const fs = require('fs');
const path = require('path');

const testFile = path.join(__dirname, 'persistence/src/resources/offers/TEST_coop_extra_offers.json');
const offers = JSON.parse(fs.readFileSync(testFile, 'utf-8'));

console.log(`📊 Totalt ${offers.length} tilbud i test-filen\n`);

// Gruppér tilbud per katalog
const catalogGroups = {};
offers.forEach(offer => {
    const catId = offer.catalogId;
    if (!catalogGroups[catId]) {
        catalogGroups[catId] = [];
    }
    catalogGroups[catId].push(offer);
});

console.log(`📚 Antall kataloger: ${Object.keys(catalogGroups).length}\n`);

// Vis antall tilbud per katalog
Object.entries(catalogGroups).forEach(([catId, catOffers]) => {
    const uniqueTitles = [...new Set(catOffers.map(o => o.title))];
    console.log(`Katalog ${catId}:`);
    console.log(`   - ${catOffers.length} totale tilbud`);
    console.log(`   - ${uniqueTitles.length} unike titler`);
});

console.log('\n' + '='.repeat(70));

// Sammenlign produkter mellom kataloger
const catalogTitles = {};
Object.entries(catalogGroups).forEach(([catId, catOffers]) => {
    catalogTitles[catId] = new Set(catOffers.map(o => o.title));
});

const allTitles = new Set();
Object.values(catalogTitles).forEach(titles => {
    titles.forEach(title => allTitles.add(title));
});

console.log(`\n📋 Totalt ${allTitles.size} unike produkttitler på tvers av alle kataloger\n`);

// Finn produkter som IKKE finnes i alle kataloger
const catalogIds = Object.keys(catalogTitles);
const uniqueToSomeCatalogs = [];

allTitles.forEach(title => {
    const catalogsWithThisTitle = catalogIds.filter(catId => 
        catalogTitles[catId].has(title)
    );
    
    if (catalogsWithThisTitle.length < catalogIds.length) {
        uniqueToSomeCatalogs.push({
            title,
            inCatalogs: catalogsWithThisTitle.length,
            catalogs: catalogsWithThisTitle
        });
    }
});

console.log('🔍 PRODUKTER SOM IKKE FINNES I ALLE KATALOGER:\n');

if (uniqueToSomeCatalogs.length === 0) {
    console.log('✅ ALLE produkter finnes i ALLE kataloger!');
    console.log('   → Dette bekrefter at katalogene er 100% identiske duplikater');
} else {
    console.log(`❌ Fant ${uniqueToSomeCatalogs.length} produkter som varierer:\n`);
    
    uniqueToSomeCatalogs.forEach((item, idx) => {
        if (idx < 20) { // Vis kun første 20
            console.log(`${idx + 1}. "${item.title}"`);
            console.log(`   - Finnes i ${item.inCatalogs}/${catalogIds.length} kataloger`);
            console.log(`   - Katalog IDer: ${item.catalogs.slice(0, 3).join(', ')}${item.catalogs.length > 3 ? '...' : ''}`);
        }
    });
    
    if (uniqueToSomeCatalogs.length > 20) {
        console.log(`\n   ... og ${uniqueToSomeCatalogs.length - 20} flere produkter`);
    }
}

// Finn produkter som finnes i ALLE kataloger
const inAllCatalogs = [];
allTitles.forEach(title => {
    const inAll = catalogIds.every(catId => catalogTitles[catId].has(title));
    if (inAll) {
        inAllCatalogs.push(title);
    }
});

console.log(`\n\n✅ Produkter som finnes i ALLE ${catalogIds.length} kataloger: ${inAllCatalogs.length}`);
console.log(`❌ Produkter som bare finnes i NOEN kataloger: ${uniqueToSomeCatalogs.length}`);

// Sjekk om det finnes duplikater INNENFOR samme katalog
console.log('\n' + '='.repeat(70));
console.log('\n🔍 SJEKKER FOR DUPLIKATER INNENFOR HVER KATALOG:\n');

Object.entries(catalogGroups).forEach(([catId, catOffers]) => {
    const titleCounts = {};
    catOffers.forEach(offer => {
        titleCounts[offer.title] = (titleCounts[offer.title] || 0) + 1;
    });
    
    const duplicates = Object.entries(titleCounts).filter(([_, count]) => count > 1);
    
    if (duplicates.length > 0) {
        console.log(`Katalog ${catId}:`);
        duplicates.slice(0, 5).forEach(([title, count]) => {
            console.log(`   - "${title}" x${count}`);
        });
        if (duplicates.length > 5) {
            console.log(`   ... og ${duplicates.length - 5} flere duplikater`);
        }
    }
});
