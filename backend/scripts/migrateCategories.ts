import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import config from '../rest/src/config';
import { migrateCategories } from '../core/src/db/categoryMigration';

async function main() {
  const preview = process.argv.includes('--preview');
  if (!preview && !process.argv.includes('--apply')) throw new Error('Bruk --preview eller --apply');
  const temporary = preview ? fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-migration-')) : null;
  const target = temporary ? path.join(temporary,'preview.db') : config.dbPath;
  if (preview && fs.existsSync(config.dbPath)) {
    const source = new Database(config.dbPath,{readonly:true});
    try {await source.backup(target);} finally {source.close();}
  }
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const db = new Database(target);
  try {
    db.pragma('foreign_keys=ON');
    migrateCategories(db);
    const migration = db.prepare('SELECT report FROM schema_migrations WHERE name=?').get('normalized-categories-v1') as {report:string};
    console.log(JSON.stringify({mode:preview?'preview':'applied',...JSON.parse(migration.report),
      classifications:db.prepare('SELECT count(*) AS count FROM classifications').get(),
      review:db.prepare('SELECT count(*) AS count FROM classifications WHERE needs_review=1').get(),
      integrity:db.pragma('integrity_check'),foreignKeys:db.pragma('foreign_key_check')},null,2));
  } finally {
    db.close();
    if(temporary) {
      if(path.dirname(temporary)!==fs.realpathSync(os.tmpdir()) || !path.basename(temporary).startsWith('ukeshandel-migration-')) throw new Error('Uventet testmappe');
      fs.rmSync(temporary,{recursive:true});
    }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
