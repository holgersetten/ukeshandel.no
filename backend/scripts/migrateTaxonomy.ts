import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import config from '../rest/src/config';
import { migrateTaxonomyV22, rollbackTaxonomyV22, classificationSnapshot } from '../core/src/db/taxonomyMigration';
import { hashInput } from '../core/src/utils/offerOccurrence';

async function main() {
  const preview = process.argv.includes('--preview');
  const rollback = process.argv.includes('--rollback');
  if ([preview,rollback,process.argv.includes('--apply')].filter(Boolean).length !== 1) throw new Error('Bruk --preview, --apply eller --rollback');
  const temporary = preview ? fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-taxonomy-preview-')) : null;
  const target = temporary ? path.join(temporary,'preview.db') : config.dbPath;
  if (preview) {
    const original = new Database(config.dbPath,{readonly:true,fileMustExist:true});
    try { await original.backup(target); } finally { original.close(); }
  }
  const db = new Database(target,{fileMustExist:true});
  db.pragma('foreign_keys=ON');
  try {
    const before = classificationSnapshot(db);
    const result = rollback ? rollbackTaxonomyV22(db) : migrateTaxonomyV22(db);
    const after = classificationSnapshot(db);
    if (hashInput(before) !== hashInput(after)) throw new Error('Klassifiseringer ble endret');
    const report:Record<string,unknown> = {...result};
    delete report.beforeTaxonomy;
    const manual = (before.concepts as {source:string}[]).filter(c=>c.source==='manual').length;
    const legacyManual = (before.legacy as {source:string}[]).filter(c=>c.source==='manual').length;
    console.log(JSON.stringify({mode:preview?'preview':rollback?'rollback':'applied',...report,
      manualRowsVerified:manual,legacyManualRowsVerified:legacyManual,
      integrity:db.pragma('integrity_check'),foreignKeys:db.pragma('foreign_key_check'),
      ...(rollback?{restart:'Sett TAXONOMY_VERSION=taxonomy-v2.1 før omstart for å beholde tilbakeføringen.'}:{}),
    },null,2));
  } finally { db.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
