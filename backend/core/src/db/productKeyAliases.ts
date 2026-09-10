import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import config from '../../../rest/src/config';
import { buildProductKey, buildLegacyProductKey, type OfferLike } from '../utils/productKey';

/** Behold historiske rader; koble kjente gamle nøkler til dagens produktnøkkel. */
export function initProductKeyAliases(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS product_key_aliases (
            legacy_key TEXT PRIMARY KEY,
            product_key TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_product_key_aliases_product ON product_key_aliases(product_key);
    `);
    if (!fs.existsSync(config.offersDir)) return;
    const offers: Array<OfferLike & { productKey?: string }> = [];
    for (const name of fs.readdirSync(config.offersDir).filter(name => name.endsWith('_offers.json'))) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(config.offersDir, name), 'utf8'));
            if (Array.isArray(data)) offers.push(...data.filter(o => typeof o?.title === 'string'));
        } catch (error) {
            console.warn('Kunne ikke lese produktnøkler fra ' + name, error);
        }
    }
    registerProductKeyAliases(db, offers);
}

export function registerProductKeyAliases(db: Database.Database, offers: Array<OfferLike & { productKey?: string }>): void {
    const insert = db.prepare('INSERT OR IGNORE INTO product_key_aliases (legacy_key, product_key) VALUES (?, ?)');
    const invalidateConflict = db.prepare(`UPDATE product_key_aliases SET product_key = legacy_key
        WHERE legacy_key = ? AND product_key != ?`);
    db.transaction(() => {
        for (const offer of offers) {
            const canonical = buildProductKey(offer);
            for (const legacy of new Set([buildLegacyProductKey(offer), offer.productKey])) {
                if (legacy && legacy !== canonical) {
                    insert.run(legacy, canonical);
                    // Gammelt format manglet enhet. Ikke gjett hvis samme nøkkel peker på ulike varer.
                    invalidateConflict.run(legacy, canonical);
                }
            }
        }
    })();
}
