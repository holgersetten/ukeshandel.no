const axios = require('axios');

const dealerId = '80742m'; // Coop Extra
const baseURL = 'https://squid-api.tjek.com/v2';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

async function analyzeCatalogs() {
    try {
        // Hent alle kataloger
        const catalogsUrl = `${baseURL}/catalogs?dealer_id=${dealerId}&order_by=-publication_date&limit=10`;
        const catalogsResponse = await axios.get(catalogsUrl, { headers });
        const catalogs = catalogsResponse.data || [];
        
        console.log('📚 ANALYSE AV ALLE KATALOGER:\n');
        
        // Filtrer til aktive
        const now = new Date();
        const activeCatalogs = catalogs.filter(catalog => {
            const runFrom = catalog.run_from ? new Date(catalog.run_from) : null;
            const runTill = catalog.run_till ? new Date(catalog.run_till) : null;
            return (!runFrom || runFrom <= now) && (!runTill || runTill >= now);
        });
        
        console.log(`Fant ${activeCatalogs.length} aktive kataloger:\n`);
        
        activeCatalogs.forEach((cat, idx) => {
            console.log(`${idx + 1}. Katalog ID: ${cat.id}`);
            console.log(`   Label: ${cat.label || '(ingen)'}`);
            console.log(`   Run from: ${cat.run_from}`);
            console.log(`   Run till: ${cat.run_till}`);
            console.log(`   Branding: ${cat.branding?.name || '(ingen)'}`);
            console.log(`   Dealer: ${cat.dealer?.name || '(ingen)'}`);
            console.log(`   Store: ${cat.store?.name || '(ingen)'}`);
            console.log(`   Types: ${cat.types || '(ingen)'}`);
            console.log('');
        });
        
        // Gruppér basert på run_from + run_till + label
        const groups = {};
        activeCatalogs.forEach(cat => {
            const key = `${cat.run_from}_${cat.run_till}_${cat.label || 'no_label'}`;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(cat);
        });
        
        console.log('=' .repeat(60));
        console.log(`\n📊 GRUPPERING (${Object.keys(groups).length} unike perioder):\n`);
        
        Object.entries(groups).forEach(([key, cats], idx) => {
            const first = cats[0];
            console.log(`Gruppe ${idx + 1}:`);
            console.log(`   Periode: ${first.run_from} → ${first.run_till}`);
            console.log(`   Label: ${first.label || '(ingen)'}`);
            console.log(`   Antall duplikater: ${cats.length}`);
            console.log(`   Katalog IDer: ${cats.map(c => c.id).join(', ')}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Feil:', error.message);
    }
}

analyzeCatalogs();
