const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const Database=require('better-sqlite3');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-taxonomy-tests-'));
process.env.TAXONOMY_VERSION='taxonomy-v2.1';process.env.CATEGORY_MODE='concept';
process.env.SKIP_AI='true';process.env.ADMIN_API_KEY='taxonomy-test';
process.env.CATEGORIES_FILE=path.join(__dirname,'../persistence/src/resources/categories.json');
process.env.OFFERS_DIR=path.join(temporary,'empty-offers');process.env.DB_PATH=path.join(temporary,'initial.db');
const config=require('../rest/src/config').default;
const database=require('../core/src/db/db');
const repo=require('../core/src/db/productConceptRepo');
const service=require('../core/src/services/concepts/conceptService').default;
const migration=require('../core/src/db/taxonomyMigration');
const taxonomyService=require('../core/src/services/concepts/taxonomyService');
const categories=require('../core/src/config/categories');
const cache=require('../core/src/db/categoryCacheRepo');
const v21=require('../persistence/src/resources/taxonomy.v2.1.json');
const v22=require('../persistence/src/resources/taxonomy.v2.json');
let db;let number=0;
beforeEach(()=>{config.dbPath=path.join(temporary,`case-${++number}.db`);database.initDb();db=database.getDb();});
afterEach(()=>{database.closeDb();process.env.TAXONOMY_VERSION='taxonomy-v2.1';});
const ids={whale:'aac1bf3cd5fe54e4db47fb70',fishMeals:'79dea43fa90cc953b6917927',fish:'99aba2f3d448a08d731e25e2',
  meat:'3e9b08a1a6ecfe971622242b',ready:'855f97b2c5713d5e40f27fd0',dinner:'78832e2ffd8b08d963edf826',pizza:'0b085c562c2b1e7631968593'};
function classify(categoryId,source='manual') {
  const input={title:'Historical '+categoryId,description:'Original product details',store:'Meny',source:'tjek',catalogId:'old-catalog',offerId:source+categoryId,imageUrl:'https://example.invalid/product.jpg'};
  const conceptId=repo.ensureConcept(input);
  repo.saveClassification(conceptId,[{categoryId,facet:'product_type',relation:''}],[input],source,source==='ai'?.9:null);
  return {input,conceptId};
}
async function withApi(run) {
  const app=require('express')();app.use(require('express').json());app.use('/api',require('../rest/src/routes/offers').default);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try {await run(`http://127.0.0.1:${server.address().port}/api`);} finally {await new Promise(resolve=>server.close(resolve));}
}

test('v2.2 seed matches the approved diff, preserving every existing ID, name, definition and facet',()=>{
  assert.equal(v21.version,'taxonomy-v2.1');assert.equal(v22.version,'taxonomy-v2.2');
  assert.equal(v21.categories.length,241);assert.equal(v22.categories.length,269);
  assert.equal(v22.categories.filter(c=>c.active).length,256);
  assert.equal(v22.categories.filter(c=>c.active&&c.assignable).length,249);
  assert.equal(v22.categories.filter(c=>c.active&&!c.assignable).length,7);
  for(const old of v21.categories){const current=v22.categories.find(c=>c.id===old.id);assert.ok(current);for(const key of ['id','name','facet','definition'])assert.equal(current[key],old[key]);}
  const retired=v22.categories.filter(c=>!c.active);assert.equal(retired.length,13);assert.ok(retired.every(c=>!c.assignable));
  const newTypes=['smor','margarin','syltetoy','honning','linser','bonner','middagskit','pizzabunn','suppeblanding','fiskekaker','fiskepinner','torket_frukt'].map(k=>'product_type_v22_'+k);
  const newIngredients=['kal','blomkal','purre','kalrot','sopp','orret','hyse','tunfisk','havregryn','kokosmelk','margarin','creme_fraiche','soyasaus','kraft_buljong'].map(k=>'ingredient_v22_'+k);
  assert.deepEqual(v22.categories.filter(c=>!v21.categories.some(old=>old.id===c.id)).map(c=>c.id).sort(),[...newTypes,...newIngredients,'dish_v22_sushi','usage_v22_mellommaaltid'].sort());
  assert.deepEqual(v22.categories.filter(c=>c.facet==='dish').map(c=>c.id).sort(),[...v21.categories.filter(c=>c.facet==='dish').map(c=>c.id),'dish_v22_sushi'].sort());
});

test('migration preserves all classification columns and assignments, creates a usable v2.1 backup and is idempotent',()=>{
  const affected=v22.categories.filter(c=>v21.categories.some(old=>old.id===c.id)&&(c.active===false||!c.assignable||[ids.whale,ids.fishMeals].includes(c.id)))
    .filter(c=>v21.categories.find(old=>old.id===c.id).assignable);
  for(const c of affected){classify(c.id);classify(c.id,'ai');cache.save('legacy '+c.id,[c.id],'manual',1);}
  const before=migration.classificationSnapshot(db);const report=migration.migrateTaxonomyV22(db);
  assert.deepEqual(migration.classificationSnapshot(db),before);
  assert.equal(report.afterCount,269);assert.equal(report.classificationsUnchanged,true);assert.ok(fs.existsSync(report.backup));
  const backup=new Database(report.backup,{readonly:true,fileMustExist:true});
  try {assert.equal(migration.taxonomyRows(backup).length,241);assert.deepEqual(migration.classificationSnapshot(backup),before);assert.equal(backup.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(migration.TAXONOMY_MIGRATION),undefined);}finally{backup.close();}
  const rows=migration.taxonomyRows(db);assert.equal(migration.migrateTaxonomyV22(db).alreadyApplied,true);assert.deepEqual(migration.taxonomyRows(db),rows);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.deepEqual(db.pragma('integrity_check'),[{integrity_check:'ok'}]);
});

test('parent moves change only inherited categories, preserving direct assignments and manual rows',()=>{
  const whale=classify(ids.whale);const fish=classify(ids.fishMeals);
  assert.ok(service.read(whale.input).effectiveCategoryIds.includes(ids.fish));
  assert.ok(!service.read(fish.input).effectiveCategoryIds.includes(ids.ready));
  const before=migration.classificationSnapshot(db);migration.migrateTaxonomyV22(db);
  const whaleAfter=service.read(whale.input);const fishAfter=service.read(fish.input);
  assert.deepEqual(whaleAfter.categoryIds,[ids.whale]);assert.deepEqual(fishAfter.categoryIds,[ids.fishMeals]);
  assert.deepEqual(new Set(whaleAfter.effectiveCategoryIds),new Set([ids.whale,ids.meat]));
  assert.deepEqual(new Set(fishAfter.effectiveCategoryIds),new Set([ids.fishMeals,ids.ready,ids.dinner]));
  assert.deepEqual(new Set(categories.withAncestors([ids.whale])),new Set([ids.whale,ids.meat]));
  assert.deepEqual(new Set(categories.withAncestors([ids.fishMeals])),new Set([ids.fishMeals,ids.ready,ids.dinner]));
  assert.deepEqual(migration.classificationSnapshot(db),before);
});

test('taxonomy version makes existing AI stale, leaves manual locks intact and never invokes AI',()=>{
  const ai=classify(ids.whale,'ai');const manual=classify(ids.pizza);
  const aiEntry=repo.getClassification(ai.conceptId);const manualEntry=repo.getClassification(manual.conceptId);
  assert.equal(repo.isStale(aiEntry),false);const oldVersion=repo.taxonomyVersion();
  migration.migrateTaxonomyV22(db);
  assert.notEqual(repo.taxonomyVersion(),oldVersion);assert.ok(repo.taxonomyVersion().startsWith('taxonomy-v2.2:'));
  assert.equal(repo.isStale(repo.getClassification(ai.conceptId)),true);
  assert.equal(repo.isStale(repo.getClassification(manual.conceptId)),false);
  assert.deepEqual(repo.getClassification(ai.conceptId),aiEntry);assert.deepEqual(repo.getClassification(manual.conceptId),manualEntry);
  assert.equal(repo.saveClassification(manual.conceptId,[{categoryId:ids.ready,facet:'product_type',relation:''}],[manual.input],'ai',.99),false);
  assert.deepEqual(repo.getClassification(manual.conceptId),manualEntry);
});

test('retained legacy fallback also inherits the current parents without changing either set of assignments',()=>{
  const offers=require('../core/src/services/offerService').default;
  const normalize=require('../core/src/utils/normalizeTitle').normalizeTitle;
  const rows=[classify(ids.whale),classify(ids.fishMeals)];
  for(const row of rows){
    cache.save(normalize(row.input.title),repo.getClassification(row.conceptId).assignments.map(a=>a.categoryId),'manual',1);
    db.prepare('UPDATE concept_classifications SET needs_review=1,review_reasons_json=? WHERE concept_id=?').run('["legacy_taxonomy_conflict"]',row.conceptId);
  }
  const before=migration.classificationSnapshot(db);migration.migrateTaxonomyV22(db);
  const whale=offers.enrich(rows[0].input);const fish=offers.enrich(rows[1].input);
  assert.equal(whale.classificationLayer,'legacy-fallback');assert.equal(fish.classificationLayer,'legacy-fallback');
  assert.deepEqual(whale.categoryIds,[ids.whale]);assert.deepEqual(fish.categoryIds,[ids.fishMeals]);
  assert.deepEqual(new Set(whale.effectiveCategoryIds),new Set([ids.whale,ids.meat]));
  assert.deepEqual(new Set(fish.effectiveCategoryIds),new Set([ids.fishMeals,ids.ready,ids.dinner]));
  assert.deepEqual(migration.classificationSnapshot(db),before);
});

test('retired manual assignments remain visible in admin history but cannot be assigned or edited anew',async()=>{
  const manual=classify(ids.pizza);const before=repo.getClassification(manual.conceptId);
  migration.migrateTaxonomyV22(db);
  await withApi(async url=>{
    const categoryResponse=await fetch(url+'/categories');const taxonomy=(await categoryResponse.json()).categories;
    const pizza=taxonomy.find(c=>c.id===ids.pizza);assert.equal(pizza.active,false);assert.equal(pizza.assignable,false);assert.equal(pizza.name,'Pizza');
    const reviewResponse=await fetch(url+'/classifications/review');const row=(await reviewResponse.json()).classifications.find(c=>c.conceptId===manual.conceptId);
    assert.ok(row);assert.equal(row.manualLock,true);assert.equal(row.source,'manual');assert.equal(row.stale,false);assert.equal(row.needsReview,true);assert.equal(row.reviewReason,'retired_category');assert.deepEqual(row.assignments,before.assignments);
    const response=await fetch(url+'/offers/categorize',{method:'POST',headers:{'Content-Type':'application/json','x-admin-api-key':'taxonomy-test'},body:JSON.stringify({conceptId:manual.conceptId,assignments:before.assignments})});assert.equal(response.status,400);
  });
  assert.deepEqual(repo.getClassification(manual.conceptId),before);
  assert.throws(()=>taxonomyService.saveTaxonomyCategory(ids.pizza,{name:'Pizza',parentId:ids.dinner,assignable:true}),/Inaktiv/);
});

test('normal admin deactivation also preserves manual rows and derives review status on read',()=>{
  const manual=classify(ids.whale);const before=migration.classificationSnapshot(db);
  taxonomyService.retireTaxonomyCategory(ids.whale);
  assert.deepEqual(migration.classificationSnapshot(db),before);
  assert.equal(repo.classificationReview(repo.getClassification(manual.conceptId)).reviewReason,'retired_category');
  assert.equal(service.read(manual.input).manualLock,true);assert.equal(service.read(manual.input).needsReview,true);
  assert.ok(repo.assignmentReasons([{categoryId:ids.whale,facet:'product_type',relation:''}]).includes('invalid_category'));
});

test('rollback restores v2.1 taxonomy and versions without rewriting classifications; opt-out survives restart',()=>{
  const ai=classify(ids.whale,'ai');classify(ids.pizza);
  const taxonomy=migration.taxonomyRows(db);const before=migration.classificationSnapshot(db);
  migration.migrateTaxonomyV22(db);migration.rollbackTaxonomyV22(db);
  assert.deepEqual(migration.taxonomyRows(db),taxonomy);assert.deepEqual(migration.classificationSnapshot(db),before);
  assert.equal(repo.isStale(repo.getClassification(ai.conceptId)),false);
  database.initDb();assert.deepEqual(migration.taxonomyRows(db),taxonomy);
  delete process.env.TAXONOMY_VERSION;database.initDb();assert.equal(migration.taxonomyRows(db).length,269);
});

test('rollback refuses to remove new assignments or overwrite taxonomy edits',()=>{
  migration.migrateTaxonomyV22(db);const manual=classify('product_type_v22_smor');
  const before=migration.classificationSnapshot(db);
  assert.throws(()=>migration.rollbackTaxonomyV22(db),/tatt i bruk/);assert.deepEqual(migration.classificationSnapshot(db),before);
  assert.equal(repo.getClassification(manual.conceptId).manualLock,true);
  db.prepare('UPDATE taxonomy_categories SET definition=definition || ? WHERE id=?').run(' changed',ids.whale);
  assert.throws(()=>migration.rollbackTaxonomyV22(db),/endret etter migreringen/);
});

test('migration refuses to silently overwrite a customized v2.1 taxonomy',()=>{
  db.prepare('UPDATE taxonomy_categories SET definition=definition || ? WHERE id=?').run(' custom',ids.whale);
  const before=migration.taxonomyRows(db);
  assert.throws(()=>migration.migrateTaxonomyV22(db),/avviker fra v2.1/);assert.deepEqual(migration.taxonomyRows(db),before);
  assert.equal(db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(migration.TAXONOMY_MIGRATION),undefined);
});
