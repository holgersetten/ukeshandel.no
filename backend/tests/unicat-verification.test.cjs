const {test,beforeEach,afterEach,after,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-unicat-verification-'));
process.env.DB_PATH=path.join(temporary,'verification.db');process.env.OFFERS_DIR=path.join(temporary,'offers');
process.env.CATEGORIES_FILE=path.join(__dirname,'../persistence/src/resources/categories.json');
process.env.CATEGORY_MODE='concept';process.env.SKIP_AI='false';process.env.OPENAI_API_KEY='mock-only';process.env.ADMIN_API_KEY='verification-key';
fs.mkdirSync(process.env.OFFERS_DIR);
const database=require('../core/src/db/db');database.initDb();const db=database.getDb();
const repo=require('../core/src/db/productConceptRepo');const service=require('../core/src/services/concepts/conceptService').default;
const ai=require('../core/src/services/concepts/conceptAI');const identity=require('../core/src/utils/offerOccurrence');
const offers=require('../core/src/services/offerService').default;
// Execute the actual pure frontend helper without changing its ESM package configuration.
const ts=require('typescript');const frontendModule={exports:{}};
require('node:vm').runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../frontend/src/lib/categories.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:frontendModule.exports});
const frontendCategories=frontendModule.exports;
const offersPageSource=fs.readFileSync(path.join(__dirname,'../../frontend/src/pages/OffersPage.tsx'),'utf8');
const filterStart=offersPageSource.indexOf('  const filteredOffers = offers.filter');const filterEnd=offersPageSource.indexOf('  const handleMainCategoryChange',filterStart);
assert.ok(filterStart>=0&&filterEnd>filterStart);
const frontendFilter=ts.transpileModule(offersPageSource.slice(filterStart,filterEnd)+'\nglobalThis.result=filteredOffers;',{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function filterAsFrontend(rows,main,sub='all'){const context={offers:rows,filterStore:[],searchQuery:'',selectedMainCategory:main,selectedSubCategory:sub,sortByPrice:false};require('node:vm').runInNewContext(frontendFilter,context);return context.result;}
const identityRecords=[];
const cat=(facet,name)=>{const c=repo.getTaxonomy().find(c=>c.facet===facet&&c.name===name&&c.active&&c.assignable);assert.ok(c,facet+':'+name);return c;};
const assignment=(facet,name,relation='')=>({categoryId:cat(facet,name).id,facet,relation});
const base=(title,id,extra={})=>identity.originalInput({title,store:'Meny',source:'tjek',catalogId:'verification-catalog-1',offerId:id,description:'',price:39,currency:'NOK',...extra});
const suggestion=(task,labels,insufficient=false,image=false)=>({assignments:labels,confidence:.95,insufficientEvidence:insufficient,
  evidence:labels.map(a=>({categoryId:a.categoryId,inputIndex:0,field:image?'image':'title',quote:image?'Visible package text':task.input[0].title}))});
beforeEach(()=>{db.exec('DELETE FROM concept_categories;DELETE FROM concept_classifications;DELETE FROM concept_aliases;DELETE FROM product_concepts;');process.env.SKIP_AI='false';process.env.CATEGORY_MODE='concept';process.env.OPENAI_API_KEY='mock-only';});
afterEach(()=>{mock.restoreAll();delete process.env.CATEGORY_MODEL;});
after(()=>database.closeDb());
async function withApi(run){const app=require('express')();app.use(require('express').json());app.use('/api',require('../rest/src/routes/offers').default);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{await run(`http://127.0.0.1:${server.address().port}/api`);}finally{await new Promise(r=>server.close(r));}}
const post=(url,data)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-admin-api-key':'verification-key'},body:JSON.stringify(data)});

test('full Tjek transform and JSON ingestion keep IDs on refetch and change them for the next catalog',async()=>{
  const tjek=require('../persistence/src/services/tjekApiService').default;let catalog='catalog-A';
  mock.method(tjek,'getLatestCatalog',async()=>({id:catalog,run_from:'2026-10-01',run_till:'2026-10-07'}));
  mock.method(tjek,'getCatalogHotspots',async()=>[{id:'hotspot',offer:{id:'same-source-offer',heading:'Lettrømme 0,5 %',pricing:{price:20},quantity:{size:300,unit:'g'}}}]);
  mock.method(require('../persistence/src/services/imageService').default,'enrichOffers',async input=>input);
  const store={name:'Meny',dealerId:'fixture'};
  const first=(await offers.updateStoreOffers(store))[0];const firstConcept=repo.ensureConcept(first);
  let aiCalls=0;mock.method(ai,'requestConceptAI',async tasks=>{aiCalls++;return new Map(tasks.map(t=>[t.conceptId,suggestion(t,[assignment('product_type','Rømme'),assignment('ingredient','rømme')])]));});
  await service.categorize([first]);
  const second=(await offers.updateStoreOffers(store))[0];assert.equal(first.offerOccurrenceId,second.offerOccurrenceId);assert.equal(repo.ensureConcept(second),firstConcept);
  await service.categorize([second]);assert.equal(aiCalls,1);
  repo.approveAlias(first.title,firstConcept);catalog='catalog-B';const third=(await offers.updateStoreOffers(store))[0];
  assert.notEqual(third.offerOccurrenceId,first.offerOccurrenceId);assert.equal(repo.ensureConcept(third),firstConcept);
  await service.categorize([third]);assert.equal(aiCalls,1);
  const saved=JSON.parse(fs.readFileSync(path.join(process.env.OFFERS_DIR,'meny_offers.json'),'utf8'))[0];assert.equal(saved.offerOccurrenceId,third.offerOccurrenceId);assert.equal(saved.title,first.title);assert.equal(saved.catalogId,'catalog-B');
  for(const [index,input] of [first,second,third].entries()){
    const row=offers.enrich(input);const entry=repo.getClassification(firstConcept);const describe=a=>({...a,name:repo.getTaxonomy().find(c=>c.id===a.categoryId).name});
    const alias=repo.getAliases().find(a=>a.status==='approved'&&a.scopeKey==='offer:'+input.offerOccurrenceId)||repo.getAliases().find(a=>a.status==='approved'&&a.scopeKey==='global');
    identityRecords.push({case:['same-catalog-first-fetch','same-catalog-refetch','new-catalog-approved-alias'][index],title:input.title,dataSource:'synthetic-Tjek-hotspot through real transform and JSON ingestion',ai:'mock',offerOccurrenceId:row.offerOccurrenceId,concept_id:row.conceptId,aliasUsed:alias,conceptState:index?'existing':'new',activeClassification:entry.assignments.map(describe),product_type:entry.assignments.filter(a=>a.facet==='product_type').map(describe),ingredient:entry.assignments.filter(a=>a.facet==='ingredient').map(describe),dish:[],source:entry.source,manual_lock:entry.manualLock,stale:row.stale,needs_review:row.needsReview,imageFallbackAttempted:false});
  }
});

test('sufficient one-word product text does not trigger image fallback',async()=>{
  const input=base('Kyllingfilet','clear-single-word',{imageUrl:'https://example.invalid/chicken.jpg'});const id=repo.ensureConcept(input);let imageCalls=0;
  mock.method(ai,'requestConceptAI',async(tasks,taxonomy,image)=>{if(image)imageCalls++;return new Map(tasks.map(t=>[t.conceptId,suggestion(t,[assignment('product_type','Kylling'),assignment('ingredient','kylling')])]));});
  await service.classifyBatch([{conceptId:id,input:[input]}]);assert.equal(imageCalls,0);assert.equal(repo.getClassification(id).needsReview,false);
});

test('failed image fallback flags only its task and does not abort the rest of the batch',async()=>{
  const vague=base('Ukjent vare','image-error',{imageUrl:'https://example.invalid/missing.jpg'});const clear=base('Vanlig kyllingfilet','clear',{description:'Rå kyllingfilet'});
  const tasks=[vague,clear].map(input=>({conceptId:repo.ensureConcept(input),input:[input]}));let imageCalls=0;
  mock.method(ai,'requestConceptAI',async(input,taxonomy,image)=>{if(image){imageCalls++;throw Error('image HTTP 404');}return new Map(input.map(t=>[t.conceptId,suggestion(t,t.conceptId===tasks[0].conceptId?[]:[assignment('product_type','Kylling')],t.conceptId===tasks[0].conceptId)]));});
  await service.classifyBatch(tasks);assert.equal(imageCalls,1);assert.ok(repo.getClassification(tasks[0].conceptId).reviewReasons.includes('image_unavailable_or_failed'));assert.equal(repo.getClassification(tasks[1].conceptId).needsReview,false);
});

test('the real AI adapter sends original fields and image URL and resolves readable facet keys to database IDs',async()=>{
  const input=base('Coop Scampi Hvitløk & Urter','wire',{brand:'Coop',description:'Marinerte scampi',quantity:'300 g',size:300,unit:'g',pieces:1,imageUrl:'https://example.invalid/scampi.jpg',validFrom:'2026-10-01',validTo:'2026-10-07'});
  const id=repo.ensureConcept(input);const taxonomy=repo.getTaxonomy();const keys=ai.taxonomyKeys(taxonomy);const requests=[];
  mock.method(globalThis,'fetch',async(url,options)=>{
    requests.push({url:String(url),body:JSON.parse(options.body)});
    const content={results:[{conceptId:id,productTypeKey:keys.get(cat('product_type','Scampi').id),ingredientKey:keys.get(cat('ingredient','scampi').id),dishes:[],dietaryKeys:[],usageKeys:[],confidence:.95,insufficientEvidence:false,evidence:[{categoryKey:keys.get(cat('product_type','Scampi').id),inputIndex:0,field:'title',quote:input.title},{categoryKey:keys.get(cat('ingredient','scampi').id),inputIndex:0,field:'title',quote:'Scampi'}]}]};
    return new Response(JSON.stringify({id:'mock-response',object:'chat.completion',created:0,model:'mock',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(content)}}]}),{status:200,headers:{'content-type':'application/json'}});
  });
  const tasks=[{conceptId:id,input:[input]}];
  const text=await ai.requestConceptAI(tasks,taxonomy);assert.deepEqual(text.get(id).assignments,[assignment('product_type','Scampi'),assignment('ingredient','scampi')]);
  const payload=JSON.parse(requests[0].body.messages[1].content[0].text).products[0].input[0];
  for(const field of ['title','brand','description','quantity','size','unit','pieces','store','source','catalogId','offerId','validFrom','validTo'])assert.equal(payload[field],input[field],field);
  assert.equal(requests[0].body.response_format.json_schema.strict,true);assert.ok(!requests[0].body.messages[1].content.some(c=>c.type==='image_url'));
  await ai.requestConceptAI(tasks,taxonomy,true);const image=requests[1].body.messages[1].content.find(c=>c.type==='image_url');assert.equal(image.image_url.url,input.imageUrl);
});

test('all three version dimensions make AI stale independently and never unlock manual classifications',()=>{
  const input=base('Lettrømme 0,5 %','version');const id=repo.ensureConcept(input);const labels=[assignment('product_type','Rømme')];
  repo.saveClassification(id,labels,[input],'ai',.9);
  for(const column of ['prompt_version','taxonomy_version','model']){
    const entry=repo.getClassification(id);const current=column==='prompt_version'?repo.promptVersion():column==='taxonomy_version'?repo.taxonomyVersion():require('../core/src/services/concepts/config').MODEL();
    db.prepare(`UPDATE concept_classifications SET ${column}=? WHERE concept_id=?`).run('old-verification-version',id);assert.equal(repo.isStale(repo.getClassification(id)),true,column);
    db.prepare(`UPDATE concept_classifications SET ${column}=? WHERE concept_id=?`).run(current,id);assert.equal(repo.isStale(repo.getClassification(id)),false,column);assert.deepEqual(repo.getClassification(id).assignments,entry.assignments);
  }
  repo.setManual(id,labels,[input]);process.env.CATEGORY_MODEL='another-model';
  db.prepare('UPDATE concept_classifications SET prompt_version=?,taxonomy_version=? WHERE concept_id=?').run('old-prompt','old-taxonomy',id);
  assert.equal(repo.isStale(repo.getClassification(id)),false);assert.equal(repo.saveClassification(id,[],[input],'ai',1),false);
  const call=mock.method(ai,'requestConceptAI',async()=>{throw Error('must not call AI');});
  return service.categorize([input]).then(async()=>{assert.equal(call.mock.callCount(),0);await assert.rejects(service.retry(id),/låst/);assert.equal(call.mock.callCount(),0);});
});

test('multiple dish, dietary and usage tags are accepted while product_type and ingredient remain singular',()=>{
  const input=base('Facet mechanics fixture','facets');const id=repo.ensureConcept(input);
  const labels=[assignment('product_type','Ferdigretter'),assignment('ingredient','lam'),assignment('dish','Fårikål','is_dish'),assignment('dish','Lasagne','for_dish'),assignment('dietary','Vegetar'),assignment('dietary','Glutenfri'),assignment('usage','Baking'),assignment('usage','Grilling')];
  // These labels test cardinality and SQL mechanics, not a semantic recommendation for this product.
  repo.setManual(id,labels,[input]);assert.equal(repo.getClassification(id).assignments.length,8);
  assert.throws(()=>repo.setManual(id,[...labels,assignment('product_type','Kylling')]),/requires_one_product_type/);
  assert.throws(()=>repo.setManual(id,[...labels,assignment('ingredient','kylling')]),/multiple_primary/);
  assert.throws(()=>repo.setManual(id,labels.map(a=>a.facet==='dish'?{...a,relation:''}:a)),/invalid_relation/);
  assert.equal(repo.getClassification(id).assignments.length,8);
  const emptyId=repo.ensureConcept(base('Unknown','unresolved'));assert.equal(repo.saveClassification(emptyId,[],[input],'ai',null,['insufficient_evidence']),true);assert.deepEqual(repo.getClassification(emptyId).assignments,[]);
});

test('historical review API reports stale classifications as needing review',async()=>{
  const input=base('Historisk lettrømme','history',{catalogId:'past-catalog'});const id=repo.ensureConcept(input);repo.saveClassification(id,[assignment('product_type','Rømme')],[input],'ai',.9);
  db.prepare('UPDATE concept_classifications SET prompt_version=? WHERE concept_id=?').run('old-prompt',id);
  await withApi(async url=>{const response=await fetch(url+'/classifications/review');assert.equal(response.status,200);const row=(await response.json()).classifications.find(c=>c.conceptId===id);assert.ok(row);assert.equal(row.needsReview,true);assert.equal(row.stale,true);assert.equal(row.reviewReason,'stale_classification');});
});

test('successful concept retry sends every original field, preserves concept ID, and refuses missing original input',async()=>{
  const input=base('Coop Scampi Hvitløk & Urter','retry',{brand:'Coop',description:'Marinerte scampi',quantity:'300 g',size:300,unit:'g',pieces:1,imageUrl:'https://example.invalid/scampi.jpg',validFrom:'2026-10-01',validTo:'2026-10-07'});
  const id=repo.ensureConcept(input);repo.saveClassification(id,[assignment('product_type','Scampi')],[input],'ai',.9);
  const call=mock.method(ai,'requestConceptAI',async tasks=>{assert.equal(tasks[0].conceptId,id);assert.deepEqual(tasks[0].input,[input]);return new Map(tasks.map(t=>[t.conceptId,suggestion(t,[assignment('product_type','Scampi'),assignment('ingredient','scampi')])]));});
  await withApi(async url=>{assert.equal((await post(url+'/classifications/retry',{conceptId:id})).status,200);assert.equal(call.mock.callCount(),1);assert.equal(repo.getClassification(id).conceptId,id);});
  const historical=repo.ensureConcept(base('Missing original','no-original'));repo.setManual(historical,[assignment('product_type','Rømme')]);
  db.prepare('UPDATE concept_classifications SET source=?,manual_lock=0,prompt_version=?,model=? WHERE concept_id=?').run('ai',repo.promptVersion(),require('../core/src/services/concepts/config').MODEL(),historical);
  await assert.rejects(service.retry(historical),/Original produktinformasjon mangler/);assert.equal(call.mock.callCount(),1);
});

test('the actual frontend save handler can correct a historical concept whose occurrence is no longer current',async()=>{
  const input=base('Historisk rømme','historical-save',{catalogId:'old-catalog',description:'Original historical description'});const id=repo.ensureConcept(input);const labels=[assignment('product_type','Rømme')];repo.saveClassification(id,labels,[input],'ai',.9);
  mock.method(offers,'getAllOffers',async()=>[]);
  const source=fs.readFileSync(path.join(__dirname,'../../frontend/src/components/AdminReview.tsx'),'utf8');const start=source.indexOf('  const handleCategorize = async');const end=source.indexOf('  const searching=',start);assert.ok(start>=0&&end>start);
  const code=ts.transpileModule(source.slice(start,end)+'\nglobalThis.save=handleCategorize;',{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  await withApi(async url=>{
    const context={conceptMode:true,setSaving:()=>{},loadData:async()=>{},alert:()=>{},console,offersApi:{categorizeConcept:async data=>{const response=await post(url+'/offers/categorize',data);if(!response.ok)throw Error((await response.json()).error);}}};
    require('node:vm').runInNewContext(code,context);await context.save({...input,conceptId:id,normalizedName:'historisk rømme',isActive:false},labels.map(a=>a.categoryId),labels);
    assert.equal(repo.getClassification(id).manualLock,true);assert.deepEqual(repo.getClassification(id).input,[input]);
  });
});

test('representative products pass concept lookup, shared classification, storage, offer API and frontend category inheritance',async()=>{
  const cases=[
    {id:'cream',title:'Lettrømme 0,5 %',labels:[assignment('product_type','Rømme'),assignment('ingredient','rømme')]},
    {id:'cream-variant',title:'Lettrømme 0.5 prosent',aliasOf:'cream'},
    {id:'scampi',title:'Coop Scampi Hvitløk & Urter',labels:[assignment('product_type','Scampi'),assignment('ingredient','scampi')]},
    {id:'lamb',title:'Lam fårikålkjøtt',labels:[assignment('product_type','Lammekjøtt'),assignment('ingredient','lam'),assignment('dish','Fårikål','for_dish')]},
    {id:'lamb-variant',title:'Fårikålkjøtt lam',aliasOf:'lamb'},
    {id:'prepared',title:'Fjordland Fårikål',labels:[assignment('product_type','Ferdigretter'),assignment('dish','Fårikål','is_dish')]},
    {id:'generic',title:'Fjordland',insufficient:true,labels:[]},
    {id:'chicken',title:'Kyllingfilet',labels:[assignment('product_type','Kylling'),assignment('ingredient','kylling')],imageUrl:'https://example.invalid/chicken.jpg'},
    {id:'marinated-chicken',title:'Marinert kyllingfilet hvitløk',labels:[assignment('product_type','Kylling'),assignment('ingredient','kylling')]},
    {id:'pizza',title:'Ferdigpizza',labels:[assignment('product_type','Pizza'),assignment('dish','Pizza','is_dish')]},
    {id:'vegetarian',title:'Vegetarrett glutenfri',labels:[assignment('product_type','Vegetarretter'),assignment('dietary','Vegetar'),assignment('dietary','Glutenfri')]},
    {id:'vague',title:'Ukens favoritt',insufficient:true,imageUrl:'https://example.invalid/vague.jpg',labels:[assignment('product_type','Scampi'),assignment('ingredient','scampi')]}
  ];
  const records=[];const ids=new Map();
  for(const c of cases){c.input=base(c.title,c.id,{imageUrl:c.imageUrl});if(c.aliasOf){repo.approveAlias(c.title,ids.get(c.aliasOf));c.labels=cases.find(row=>row.id===c.aliasOf).labels;}
    const previous=repo.findConcept(c.input);c.conceptId=repo.ensureConcept(c.input);c.conceptState=previous?'existing':'new';ids.set(c.id,c.conceptId);}
  const calls=[];
  mock.method(ai,'requestConceptAI',async(tasks,taxonomy,image)=>{for(const task of tasks)calls.push({conceptId:task.conceptId,image:!!image,input:task.input});return new Map(tasks.map(task=>{const c=cases.find(c=>c.conceptId===task.conceptId);return [task.conceptId,suggestion(task,c.insufficient&&!image?[]:c.labels,c.insufficient&&!image,!!image)];}));});
  await service.categorize(cases.map(c=>c.input));
  assert.equal(ids.get('cream'),ids.get('cream-variant'));assert.equal(ids.get('lamb'),ids.get('lamb-variant'));assert.notEqual(ids.get('generic'),ids.get('prepared'));assert.notEqual(ids.get('chicken'),ids.get('marinated-chicken'));
  const taxonomy=repo.getTaxonomy();const raw=cases.map(c=>offers.enrich(c.input));mock.method(offers,'getAllOffers',async()=>raw);
  await withApi(async url=>{
    const response=await fetch(url+'/offers');assert.equal(response.status,200);const data=await response.json();assert.equal(data.offers.length,cases.length);
    for(const c of cases){const row=data.offers.find(o=>o.offerOccurrenceId===c.input.offerOccurrenceId);const entry=repo.getClassification(c.conceptId);assert.equal(row.conceptId,c.conceptId);assert.equal(row.needsReview,service.read(c.input).needsReview);
      for(const a of entry.assignments){assert.ok(row.effectiveCategoryIds.includes(a.categoryId));for(const parent of frontendCategories.ancestors(a.categoryId,taxonomy)){assert.ok(row.effectiveCategoryIds.includes(parent));const filtered=filterAsFrontend(data.offers,parent,a.categoryId);assert.ok(filtered.some(o=>o.offerOccurrenceId===row.offerOccurrenceId));}}
      const scope='offer:'+c.input.offerOccurrenceId;const alias=repo.getAliases().find(a=>a.status==='approved'&&a.scopeKey===scope)||repo.getAliases().find(a=>a.status==='approved'&&a.scopeKey==='global'&&a.normalizedTitle===require('../core/src/utils/normalizeTitle').normalizeTitle(c.title));
      const describe=a=>({...a,name:taxonomy.find(t=>t.id===a.categoryId).name});
      records.push({case:c.id,title:c.title,dataSource:'synthetic-fixture',ai:'mock',offerOccurrenceId:row.offerOccurrenceId,concept_id:c.conceptId,aliasUsed:alias,conceptState:c.conceptState,activeClassification:entry.assignments.map(describe),product_type:entry.assignments.filter(a=>a.facet==='product_type').map(describe),ingredient:entry.assignments.filter(a=>a.facet==='ingredient').map(describe),dish:entry.assignments.filter(a=>a.facet==='dish').map(describe),source:entry.source,manual_lock:entry.manualLock,stale:row.stale,needs_review:row.needsReview,reviewReason:row.reviewReason,imageFallbackAttempted:calls.some(call=>call.conceptId===c.conceptId&&call.image),classificationLayer:row.classificationLayer});
    }
    assert.equal(records.find(r=>r.case==='generic').needs_review,true);assert.equal(records.find(r=>r.case==='vague').imageFallbackAttempted,true);assert.equal(records.find(r=>r.case==='chicken').imageFallbackAttempted,false);
    assert.ok(!records.find(r=>r.case==='scampi').ingredient.some(a=>a.name==='hvitløk'));
    const locked=ids.get('lamb');assert.equal((await post(url+'/offers/categorize',{conceptId:locked,assignments:cases.find(c=>c.id==='lamb').labels})).status,200);
    assert.equal((await post(url+'/classifications/retry',{conceptId:locked})).status,400);assert.equal(repo.getClassification(locked).manualLock,true);
    records.push({...records.find(r=>r.case==='lamb'),case:'lamb-after-manual-lock',source:'manual',manual_lock:true,stale:service.read(cases.find(c=>c.id==='lamb').input).stale,needs_review:service.read(cases.find(c=>c.id==='lamb').input).needsReview});
  });
  const report={generatedAt:new Date().toISOString(),scope:'isolated SQLite and original source-shaped fixtures; no production writes or external AI requests',promptVersion:repo.promptVersion(),taxonomyVersion:repo.taxonomyVersion(),cases:[...identityRecords,...records]};
  fs.writeFileSync(path.join(__dirname,'../evaluation-results/unicat-mechanics.json'),JSON.stringify(report,null,2)+'\n');
});
