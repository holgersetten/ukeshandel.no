import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import config from '../rest/src/config';
import { migrateCategories } from '../core/src/db/categoryMigration';
import { migrateConcepts,CONCEPT_MIGRATION } from '../core/src/db/conceptMigration';

async function main(){
  const preview=process.argv.includes('--preview');
  if(!preview&&!process.argv.includes('--apply'))throw new Error('Bruk --preview eller --apply');
  const temporary=preview?fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-concept-preview-')):null;
  const target=temporary?path.join(temporary,'preview.db'):config.dbPath;
  if(preview&&fs.existsSync(config.dbPath)){const original=new Database(config.dbPath,{readonly:true});try{await original.backup(target);}finally{original.close();}}
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const db=new Database(target);db.pragma('foreign_keys=ON');
  try{
    migrateCategories(db);migrateConcepts(db);
    const row=db.prepare('SELECT report FROM schema_migrations WHERE name=?').get(CONCEPT_MIGRATION) as {report:string};
    console.log(JSON.stringify({mode:preview?'preview':'applied',...JSON.parse(row.report),
      integrity:db.pragma('integrity_check'),foreignKeys:db.pragma('foreign_key_check'),
      rollback:'CATEGORY_MODE=legacy. Ingen gamle tabeller eller tilbudsfiler er endret.'},null,2));
  }finally{db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
