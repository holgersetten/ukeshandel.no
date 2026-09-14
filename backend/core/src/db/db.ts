import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from '../../../rest/src/config';
import { migrateCategories } from './categoryMigration';

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
    
    migrateCategories(database);
    console.log('✅ Database tables and triggers initialized');
}
