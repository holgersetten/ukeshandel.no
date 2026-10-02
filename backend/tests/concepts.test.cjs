const {test,after,beforeEach,afterEach,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-concepts-test-'));
process.env.DB_PATH=path.join(temporary,'test.db');process.env.OFFERS_DIR=path.join(temporary,'offers');
process.env.CATEGORIES_FILE=path.join(__dirname,'../persistence/src/resources/categories.json');
process.env.CATEGORY_MODE='legacy';process.env.SKIP_AI='true';
const database=require('../core/src/db/db');database.initDb();
const db=database.getDb();const repo=require('../core/src/db/productConceptRepo');
const service=require('../core/src/services/concepts/conceptService').default;
const ai=require('../core/src/services/concepts/conceptAI');
const identity=require('../core/src/utils/offerOccurrence');
const fixture=require('./fixtures/category-gold.v1.json');
const category=(facet,name)=>repo.getTaxonomy().find(c=>c.facet===facet&&c.name===name&&c.assignable);
const labels=c=>c.expected.map(a=>({categoryId:category(a.facet,a.name).id,facet:a.facet,relation:a.relation||''}));
const base={title:'Lam fårikålkjøtt',store:'Kiwi',source:'tjek',catalogId:'week1',offerId:'offer1',description:'Rått kjøtt av lam til fårikål',imageUrl:'https://example.com/lamb.jpg'};
beforeEach(()=>db.transaction(()=>{db.exec('DELETE FROM concept_categories; DELETE FROM concept_classifications; DELETE FROM concept_aliases; DELETE FROM product_concepts;');})());
afterEach(()=>{mock.restoreAll();process.env.SKIP_AI='true';process.env.CATEGORY_MODE='legacy';delete process.env.OPENAI_API_KEY;delete process.env.CATEGORY_MODEL;});
after(()=>database.closeDb());

test('occurrence IDs are repeatable, scoped by catalog and store, with deterministic fallbacks',()=>{
  const id=identity.offerOccurrenceId(base);
  assert.equal(identity.offerOccurrenceId({...base,price:999}),id);
  assert.notEqual(identity.offerOccurrenceId({...base,catalogId:'week2'}),id);
  assert.notEqual(identity.offerOccurrenceId({...base,store:'Meny'}),id);
  const missing={...base,offerId:null,hotspotId:'hotspot'};
  assert.equal(identity.offerOccurrenceId(missing),identity.offerOccurrenceId({...missing}));
  assert.notEqual(identity.offerOccurrenceId({...missing,hotspotId:'another'}),identity.offerOccurrenceId(missing));
  const content={...base,offerId:null};assert.equal(identity.offerOccurrenceId(content),identity.offerOccurrenceId({...content,price:15}));
  assert.notEqual(identity.offerOccurrenceId({...content,title:'Fjordland Fårikål'}),identity.offerOccurrenceId(content));
  assert.throws(()=>identity.offerOccurrenceId({...base,catalogId:null}),/katalog/);
});
test('same occurrence keeps its concept; similar titles and new catalogs never merge automatically',()=>{
  const id=repo.ensureConcept(base);assert.equal(repo.ensureConcept({...base}),id);
  assert.equal(repo.ensureConcept({...base,title:'Updated original title'}),id);
  assert.notEqual(repo.ensureConcept({...base,catalogId:'week2'}),id);
  const reordered={...base,title:'Fårikålkjøtt lam',offerId:'other'};
  const other=repo.ensureConcept(reordered);assert.notEqual(other,id);
  const link=repo.getAliases().find(a=>a.scopeKey==='offer:'+identity.offerOccurrenceId(reordered));repo.revokeAlias(link.id);
  repo.approveAlias(reordered.title,id,identity.offerOccurrenceId(reordered));assert.equal(repo.findConcept(reordered),id);
  repo.approveAlias(base.title,id);assert.equal(repo.findConcept({...base,catalogId:'week3'}),id);
});
test('explicit occurrence relinking is atomic and keeps previous manual decisions',()=>{
  const original=repo.ensureConcept(base);const target=repo.ensureConcept({...base,offerId:'target'});
  const third=repo.ensureConcept({...base,offerId:'third'});
  repo.setManual(original,labels(fixture.cases.find(c=>c.id==='raw-lamb')),[base]);
  repo.approveAlias(base.title,third);
  assert.throws(()=>repo.linkOccurrence(base,target,true));
  assert.equal(repo.findConcept(base),original);
  repo.linkOccurrence(base,target,false);
  assert.equal(repo.findConcept(base),target);
  assert.equal(repo.getClassification(original).manualLock,true);
  assert.throws(()=>repo.setManual(target,[null]),/malformed/);
});
test('parser and quality checks reject malformed evidence and omitted explicit dish tags',()=>{
  const tasks=[{conceptId:'test',input:[base]}];
  assert.equal(ai.parseConceptResults(JSON.stringify({results:[{conceptId:'test',assignments:[null],evidence:[],confidence:.9,insufficientEvidence:false}]}),tasks).size,0);
  const partial=labels(fixture.cases.find(c=>c.id==='raw-lamb')).filter(a=>a.facet!=='dish');
  const result={assignments:partial,confidence:1,insufficientEvidence:false,evidence:partial.map(a=>({categoryId:a.categoryId,inputIndex:0,field:'title',quote:base.title}))};
  assert.ok(ai.qualityReasons(result,[base],repo.getTaxonomy(),false).some(r=>r.startsWith('unresolved_dish_mention:')));
});
test('SQL enforces one product_type and one ingredient, facet matching and dish relations',()=>{
  const c=fixture.cases.find(c=>c.id==='raw-lamb');const id=repo.ensureConcept({...c.input,offerId:'sql'});
  repo.saveClassification(id,labels(c),[identity.originalInput(c.input)],'manual',null);
  const otherType=category('product_type','Ferdigretter');
  assert.throws(()=>db.prepare('INSERT INTO concept_categories VALUES (?,?,?,?)').run(id,otherType.id,'product_type',''),/UNIQUE/);
  const garlic=category('ingredient','hvitløk');assert.throws(()=>db.prepare('INSERT INTO concept_categories VALUES (?,?,?,?)').run(id,garlic.id,'ingredient',''),/UNIQUE/);
  assert.throws(()=>db.prepare('INSERT INTO concept_categories VALUES (?,?,?,?)').run(id,garlic.id,'dish','is_dish'),/FOREIGN KEY/);
  assert.throws(()=>db.prepare('UPDATE concept_categories SET relation=? WHERE concept_id=? AND facet=?').run('',id,'dish'),/CHECK/);
});
test('manual lock survives AI writes and version changes, including correction during an AI call',async()=>{
  const c=fixture.cases[0];const input=identity.originalInput({...c.input,offerId:'race'});const id=repo.ensureConcept(input);
  mock.method(ai,'requestConceptAI',async()=>{repo.setManual(id,labels(c),[input]);return new Map([[id,{assignments:[],confidence:.99,insufficientEvidence:true,evidence:[]}]]);});
  await service.classifyBatch([{conceptId:id,input:[input]}]);
  assert.equal(repo.getClassification(id).source,'manual');assert.equal(repo.getClassification(id).manualLock,true);
  process.env.CATEGORY_MODEL='different';assert.equal(repo.isStale(repo.getClassification(id)),false);
});
test('AI results become stale after model, taxonomy, prompt or meaningful input changes',()=>{
  const c=fixture.cases[0];const input=identity.originalInput({...c.input,offerId:'stale'});const id=repo.ensureConcept(input);
  repo.saveClassification(id,labels(c),[input],'ai',.95);
  assert.equal(repo.isStale(repo.getClassification(id),[input]),false);
  assert.equal(repo.isStale(repo.getClassification(id),[{...input,description:'Different original context'}]),true);
  process.env.CATEGORY_MODEL='changed';assert.equal(repo.isStale(repo.getClassification(id)),true);delete process.env.CATEGORY_MODEL;
  const before=repo.taxonomyVersion();db.prepare('UPDATE taxonomy_categories SET definition=definition || ? WHERE id=?').run(' updated',labels(c)[0].categoryId);
  assert.notEqual(repo.taxonomyVersion(),before);assert.equal(repo.isStale(repo.getClassification(id)),true);
  db.prepare('UPDATE concept_classifications SET taxonomy_version=?,prompt_version=? WHERE concept_id=?').run(repo.taxonomyVersion(),'old-prompt',id);
  assert.equal(repo.isStale(repo.getClassification(id)),true);
});
test('retry preserves original title, description, quantity and image URL and does not delete on failure',async()=>{
  const c=fixture.cases.find(c=>c.id==='raw-lamb');const input=identity.originalInput({...base,offerId:'retry',quantity:'1 kg'});const id=repo.ensureConcept(input);
  repo.saveClassification(id,labels(c),[input],'ai',.95);
  process.env.SKIP_AI='false';process.env.OPENAI_API_KEY='test';
  const call=mock.method(ai,'requestConceptAI',async tasks=>{assert.deepEqual(tasks[0].input,[input]);throw Error('network failure');});
  await assert.rejects(service.retry(id),/network failure/);
  assert.equal(call.mock.callCount(),1);assert.deepEqual(repo.getClassification(id).input,[input]);assert.deepEqual(repo.getClassification(id).assignments,labels(c).sort((a,b)=>a.categoryId.localeCompare(b.categoryId)));
});
test('ambiguous text uses image fallback; fabricated evidence and high-confidence invalid output are reviewed',async()=>{
  const input=identity.originalInput({...base,title:'BrandOnly',description:'',offerId:'vision'});const id=repo.ensureConcept(input);let calls=0;
  mock.method(ai,'requestConceptAI',async(tasks,taxonomy,image)=>{
    calls++;if(!image)return new Map([[id,{assignments:[],confidence:.99,insufficientEvidence:true,evidence:[]}]]);
    return new Map([[id,{assignments:[{categoryId:category('product_type','Ferdigretter').id,facet:'product_type',relation:''}],confidence:.99,insufficientEvidence:false,
      evidence:[{categoryId:category('product_type','Ferdigretter').id,inputIndex:0,field:'image',quote:'Ferdig middag'}]}]]);
  });
  await service.classifyBatch([{conceptId:id,input:[input]}]);assert.equal(calls,2);assert.equal(repo.getClassification(id).needsReview,false);
  const invalid={assignments:labels(fixture.cases[0]),confidence:1,insufficientEvidence:false,evidence:[]};
  assert.ok(ai.evidenceReasons(invalid,[input],false).length);
  const invalidId=repo.ensureConcept({...input,offerId:'unsupported'});
  repo.saveClassification(invalidId,invalid.assignments,[input],'ai',1,['unsupported_evidence']);
  assert.deepEqual(repo.getClassification(invalidId).assignments,[]);
  assert.equal(repo.getClassification(invalidId).needsReview,true);
});
test('concept HTTP endpoints save full input, preserve manual locks and support legacy fallback',async()=>{
  process.env.CATEGORY_MODE='concept';process.env.ADMIN_API_KEY='test-admin';
  const input=identity.originalInput(base);
  const offerService=require('../core/src/services/offerService').default;
  const cache=require('../core/src/db/categoryCacheRepo');
  cache.save(require('../core/src/utils/normalizeTitle').normalizeTitle(base.title),[category('product_type','Lammekjøtt').id],'manual',1);
  const fallback=offerService.enrich(input);
  assert.equal(fallback.classificationLayer,'legacy-fallback');assert.ok(fallback.categoryIds.length);
  mock.method(offerService,'getAllOffers',async()=>[fallback]);
  const app=require('express')();app.use(require('express').json());app.use('/api',require('../rest/src/routes/offers').default);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}/api`;const headers={'Content-Type':'application/json','x-admin-api-key':'test-admin'};
  try {
    let response=await fetch(url+'/offers/categorize',{method:'POST',headers,body:JSON.stringify({offerOccurrenceId:input.offerOccurrenceId,assignments:labels(fixture.cases.find(c=>c.id==='raw-lamb'))})});
    assert.equal(response.status,200);const id=repo.findConcept(input);const entry=repo.getClassification(id);
    assert.equal(entry.manualLock,true);assert.equal(entry.input[0].description,base.description);assert.equal(entry.input[0].imageUrl,base.imageUrl);
    response=await fetch(url+'/classifications/retry',{method:'POST',headers,body:JSON.stringify({conceptId:id})});assert.equal(response.status,400);
    response=await fetch(url+'/offers/categorize',{method:'POST',headers,body:JSON.stringify({conceptId:id,assignments:[null]})});assert.equal(response.status,400);
    assert.deepEqual(repo.getClassification(id).assignments,entry.assignments);
    assert.equal(offerService.enrich(input).classificationLayer,'concept');
    process.env.CATEGORY_MODE='legacy';assert.equal(offerService.enrich(input).classificationLayer,'legacy');
    assert.equal(cache.get(require('../core/src/utils/normalizeTitle').normalizeTitle(base.title)).source,'manual');
  }finally{await new Promise(r=>server.close(r));}
});
test('migration is additive and idempotent; legacy manual classifications are preserved and locked',()=>{
  const legacy=require('../core/src/db/categoryCacheRepo');const oldCats=require('../core/src/config/categories');
  const milk=oldCats.getLegacyCategories().find(c=>c.name==='Melk');legacy.save('legacy milk',[milk.id],'manual',1);
  // Separate in-memory database proves migration without touching application's data.
  const Database=require('better-sqlite3');const copy=new Database(':memory:');copy.pragma('foreign_keys=ON');
  require('../core/src/db/categoryMigration').migrateCategories(copy);
  copy.prepare('INSERT INTO classifications(normalized_name,source,needs_review) VALUES (?,?,0)').run('legacy milk','manual');
  copy.prepare('INSERT INTO classification_categories VALUES (?,?)').run('legacy milk',milk.id);
  const migrate=require('../core/src/db/conceptMigration').migrateConcepts;migrate(copy);migrate(copy);
  assert.equal(copy.prepare('SELECT count(*) AS n FROM classifications').get().n,1);
  assert.equal(copy.prepare('SELECT manual_lock AS lock FROM concept_classifications').get().lock,1);
  assert.equal(copy.prepare('SELECT count(*) AS n FROM product_concepts').get().n,1);assert.deepEqual(copy.pragma('foreign_key_check'),[]);copy.close();
});
