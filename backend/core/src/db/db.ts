import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from '../../../rest/src/config';
import { initProductKeyAliases } from './productKeyAliases';

// Singleton connection
let db: Database.Database | null = null;

/**
 * Henter eller oppretter singleton DB-connection
 */
export function getDb(): Database.Database {
    if (!db) {
        const dbPath = config.dbPath;
        const dbDir = path.dirname(dbPath);
        
        // Opprett mappe hvis den ikke eksisterer
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log(`📁 Created database directory: ${dbDir}`);
        }
        
        db = new Database(dbPath);
        
        // Sett pragmas for performance og data integrity
        db.pragma('journal_mode = WAL'); // Write-Ahead Logging
        db.pragma('foreign_keys = ON');  // Håndhev foreign keys
        
        console.log(`✅ SQLite database opened`);
    }
    return db;
}

/**
 * Lukker DB-connection (vanligvis ikke nødvendig i dev, men nyttig ved testing/shutdown)
 */
export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
        console.log('🔒 SQLite database closed');
    }
}

/**
 * Initialiserer database: lager tabeller og triggers hvis de ikke finnes
 */
export function initDb(): void {
    const database = getDb();
    
    // Lag category_cache tabell
    database.exec(`
        CREATE TABLE IF NOT EXISTS category_cache (
            product_key TEXT PRIMARY KEY,
            main_category TEXT NOT NULL,
            sub_category TEXT NOT NULL,
            ingredient_key TEXT NOT NULL,
            source TEXT NOT NULL,
            confidence_main REAL,
            confidence_sub REAL,
            confidence_ingredient REAL,
            cache_status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Lag trigger for å oppdatere updated_at automatisk
    database.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_category_cache_updated
        AFTER UPDATE ON category_cache
        FOR EACH ROW
        BEGIN
            UPDATE category_cache 
            SET updated_at = CURRENT_TIMESTAMP 
            WHERE product_key = NEW.product_key;
        END;
    `);

    // Lag health_metrics tabell for weekly-update statistikk
    database.exec(`
        CREATE TABLE IF NOT EXISTS health_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            duration INTEGER NOT NULL,
            totalOffers INTEGER NOT NULL,
            totalProductKeys INTEGER DEFAULT 0,
            offersPerStore TEXT NOT NULL,
            newProductKeys INTEGER NOT NULL,
            cacheHitRate REAL NOT NULL,
            pendingRate REAL NOT NULL,
            errors TEXT NOT NULL,
            success INTEGER NOT NULL
        );
    `);

    // Migrer eksisterende health_metrics tabell til å inkludere totalProductKeys
    try {
        database.exec(`
            ALTER TABLE health_metrics 
            ADD COLUMN totalProductKeys INTEGER DEFAULT 0;
        `);
        console.log('✅ Migrated health_metrics table to include totalProductKeys');
    } catch (e) {
        // Kolonnen eksisterer allerede, ignorer feilen
    }

    initProductKeyAliases(database);
    console.log('✅ Database tables and triggers initialized');
}
