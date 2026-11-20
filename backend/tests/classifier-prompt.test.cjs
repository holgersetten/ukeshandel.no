const {test,beforeEach,afterEach,after,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-prompt-tests-'));
process.env.DB_PATH=path.join(temporary,'prompt.db');process.env.OFFERS_DIR=path.join(temporary,'offers');
process.env.CATEGORIES_FILE=path.join(__dirname,'../persistence/src/resources/categories.json');
process.env.CATEGORY_MODE='concept';process.env.SKIP_AI='true';process.env.OPENAI_API_KEY='mock-only';
const database=require('../core/src/db/db');database.initDb();const db=database.getDb();
const repo=require('../core/src/db/productConceptRepo');const ai=require('../core/src/services/concepts/conceptAI');
const service=require('../core/src/services/concepts/conceptService').default;
const identity=require('../core/src/utils/offerOccurrence');const fixture=require('./fixtures/category-gold.v2.json');
const category=(facet,name)=>{const c=repo.getTaxonomy().find(c=>c.active&&c.assignable&&c.facet===facet&&c.name===name);assert.ok(c,facet+':'+name);return c;};
const assignments=labels=>labels.map(a=>({categoryId:category(a.facet,a.name).id,facet:a.facet,relation:a.relation||''}));
const base=(title,id,extra={})=>identity.originalInput({title,store:'Meny',source:'tjek',catalogId:'prompt-test',offerId:id,...extra});
const suggestion=(input,labels,extra={})=>({assignments:labels,confidence:.98,insufficientEvidence:false,
  evidence:labels.map(a=>({categoryId:a.categoryId,inputIndex:0,field:'title',quote:input.title})),...extra});
beforeEach(()=>db.exec('DELETE FROM concept_categories;DELETE FROM concept_classifications;DELETE FROM concept_aliases;DELETE FROM product_concepts;'));
afterEach(()=>mock.restoreAll());after(()=>database.closeDb());

test('request transmits all active definitions and explicit hierarchy, selects only allowed keys, and preserves original metadata',async()=>{
  const input=base('Coop SCAMPI — Hvitløk & Urter','wire',{description:'Marinerte SCAMPI',brand:'Coop',quantity:'300 g',size:300,unit:'g',pieces:1,price:49,currency:'NOK',imageUrl:'https://example.invalid/scampi.jpg',validFrom:'2026-10-01',validTo:'2026-10-07'});
  const taxonomy=repo.getTaxonomy();const keys=ai.taxonomyKeys(taxonomy);const labels=assignments(fixture.cases.find(c=>c.id==='seasoned-scampi').expected);const captured=[];
  // Change only this request's taxonomy context to prove definitions are not copied from a parallel list.
  taxonomy.find(c=>c.id===labels[0].categoryId).definition='Request-specific definition: scampi is the product, garlic is flavor.';
  mock.method(globalThis,'fetch',async(url,options)=>{
    const body=JSON.parse(options.body);captured.push(body);
    const result={conceptId:'wire',productTypeKey:keys.get(labels[0].categoryId),ingredientKey:keys.get(labels[1].categoryId),dishes:[],dietaryKeys:[],usageKeys:[],confidence:.98,insufficientEvidence:false,
      evidence:labels.map(a=>({categoryKey:keys.get(a.categoryId),inputIndex:0,field:'title',quote:input.title}))};
    return new Response(JSON.stringify({id:'mock',object:'chat.completion',choices:[{finish_reason:'stop',message:{content:JSON.stringify({results:[result]})}}]}),{headers:{'content-type':'application/json'}});
  });
  const result=await ai.requestConceptAI([{conceptId:'wire',input:[input]}],taxonomy);
  assert.deepEqual(result.get('wire').assignments,labels);
  const body=captured[0];const payload=JSON.parse(body.messages[1].content[0].text);
  assert.equal(body.messages[0].content,ai.SYSTEM_PROMPT);assert.equal(payload.mode,'text-only');
  assert.equal(payload.categories.length,256);assert.ok(payload.categories.every(c=>typeof c.definition==='string'&&Object.hasOwn(c,'parentKey')));
  for(const c of taxonomy.filter(c=>c.active)){
    const sent=payload.categories.find(row=>row.id===keys.get(c.id));assert.equal(sent.definition,c.definition);assert.equal(sent.parentKey,c.parentId?keys.get(c.parentId):null);
  }
  const schema=body.response_format.json_schema.schema.properties.results.items.properties;
  const choiceKeys=[...schema.productTypeKey.enum,...schema.ingredientKey.enum,...schema.dishes.items.properties.categoryKey.enum,...schema.dietaryKeys.items.enum,...schema.usageKeys.items.enum].filter(Boolean);
  assert.equal(choiceKeys.length,249);
  for(const c of taxonomy.filter(c=>!c.active||!c.assignable))assert.ok(!choiceKeys.includes(keys.get(c.id)));
  for(const key of ['title','description','brand','quantity','size','unit','pieces','price','currency','store','source','catalogId','offerId','validFrom','validTo'])assert.equal(payload.products[0].input[0][key],input[key]);
  assert.equal(payload.products[0].input[0].imageAvailable,true);assert.equal(payload.products[0].input[0].imageAttached,false);
  assert.ok(!Object.hasOwn(payload.products[0].input[0],'normalizedName'));assert.ok(!body.messages[1].content.some(c=>c.type==='image_url'));
  await ai.requestConceptAI([{conceptId:'wire',input:[input]}],taxonomy,true);
  const imagePayload=JSON.parse(captured[1].messages[1].content[0].text);assert.equal(imagePayload.mode,'image-fallback');assert.equal(imagePayload.products[0].input[0].imageAttached,true);
  assert.equal(captured[1].messages[1].content.find(c=>c.type==='image_url').image_url.url,input.imageUrl);
});

test('gold v2 covers A–J, respects all facets, and forbids flavor ingredients and automatic dish/usage tags',()=>{
  assert.equal(fixture.cases.length,29);
  for(const c of fixture.cases){
    const labels=assignments(c.expected);assert.deepEqual(repo.assignmentReasons(labels),c.expectedReview?['requires_one_product_type']:[],c.id);
    for(const a of c.forbidden||[])assert.ok(!labels.some(selected=>selected.categoryId===category(a.facet,a.name).id),c.id);
  }
  for(const id of ['prepared-lamb','raw-lamb','raw-lamb-reordered','sour-cream','seasoned-scampi','prepared-pizza','pizza-base','plain-mozzarella','garlic-flavor','generic-two-words'])assert.ok(fixture.cases.some(c=>c.id===id));
  assert.deepEqual(assignments(fixture.cases.find(c=>c.id==='raw-lamb').expected),assignments(fixture.cases.find(c=>c.id==='raw-lamb-reordered').expected));
  assert.ok(fixture.cases.find(c=>c.id==='prepared-lamb').expected.every(a=>a.facet!=='ingredient'));
  const mozzarella=fixture.cases.find(c=>c.id==='plain-mozzarella');assert.ok(mozzarella.expected.every(a=>a.facet!=='dish'));
});

test('low confidence and missing confidence produce review; high confidence cannot override unsupported evidence',()=>{
  const input=base('Lettrømme 0,5 %','confidence');const labels=assignments(fixture.cases[0].expected);
  for(const [id,extra,reason] of [['low',{confidence:.82},'low_confidence'],['missing',{confidence:null},'missing_confidence'],['unsupported',{confidence:1,evidence:[]},'unsupported_category:']]){
    const actual={...input,offerId:id};const conceptId=repo.ensureConcept(actual);const result=suggestion(actual,labels,extra);const reasons=ai.qualityReasons(result,[actual],repo.getTaxonomy(),false);
    assert.ok(reasons.some(r=>r.startsWith(reason)),id);repo.saveClassification(conceptId,result.assignments,[actual],'ai',result.confidence,reasons);
    assert.equal(repo.getClassification(conceptId).needsReview,true);assert.deepEqual(repo.getClassification(conceptId).assignments,[]);
  }
});

test('exact source evidence and genuinely attached images are required',()=>{
  const input=base('COOP SCAMPI','evidence',{imageUrl:'https://example.invalid/scampi.jpg'});const labels=assignments([{facet:'product_type',name:'Scampi'}]);
  const result=suggestion(input,labels);assert.deepEqual(ai.evidenceReasons(result,[input],false),[]);
  result.evidence[0].quote='Coop Scampi';assert.ok(ai.evidenceReasons(result,[input],false).some(r=>r.startsWith('unsupported_category:')));
  result.evidence[0]={categoryId:labels[0].categoryId,inputIndex:0,field:'image',quote:'Visible scampi package'};
  assert.ok(ai.evidenceReasons(result,[input],false).length);assert.deepEqual(ai.evidenceReasons(result,[input],true),[]);
  assert.ok(ai.evidenceReasons(result,[{...input,imageUrl:'file:///not-attached.jpg'}],true).length);
  result.evidence[0].inputIndex=1;assert.ok(ai.evidenceReasons(result,[input],true).length);
});

test('dish omission checks distinguish explicit preparation from flavor, negation and optional recipe use',()=>{
  const labels=assignments([{facet:'product_type',name:'Kjeks'}]);
  for(const [title,description] of [['Kjeks med pizzasmak',''],['Kjeks med smak av pizza',''],['Kjeks','Serveringsforslag: pizza'],['Kjeks','Kan brukes til pizza'],['Kjeks','Ikke til pizza']]){
    const input=base(title,title,{description});assert.ok(!ai.qualityReasons(suggestion(input,labels),[input],repo.getTaxonomy(),false).some(r=>r.startsWith('unresolved_dish_mention:')),title+description);
  }
  for(const c of fixture.cases.filter(c=>['raw-lamb','pizza-base','prepared-pizza'].includes(c.id))){
    const input=identity.originalInput(c.input);const partial=assignments(c.expected).filter(a=>a.facet!=='dish');
    assert.ok(ai.qualityReasons(suggestion(input,partial),[input],repo.getTaxonomy(),false).some(r=>r.startsWith('unresolved_dish_mention:')),c.id);
  }
});

test('known product with empty optional facets is accepted; inactive and navigation-only types never become assignments',()=>{
  const input=base('Kjeks med hvitløkssmak','optional');const labels=assignments([{facet:'product_type',name:'Kjeks'}]);
  const result=suggestion(input,labels);assert.deepEqual(ai.qualityReasons(result,[input],repo.getTaxonomy(),false),[]);
  const id=repo.ensureConcept(input);repo.saveClassification(id,labels,[input],'ai',.98);assert.equal(repo.getClassification(id).needsReview,false);
  for(const categoryId of ['0b085c562c2b1e7631968593','337163b6701297e4e3de0559']){
    const other=repo.ensureConcept({...input,offerId:categoryId});repo.saveClassification(other,[{categoryId,facet:'product_type',relation:''}],[input],'ai',1);
    assert.equal(repo.getClassification(other).needsReview,true);assert.deepEqual(repo.getClassification(other).assignments,[]);
  }
});

test('generic two-word text requests image, clear flavored scampi does not; an image failure preserves review without crashing',async()=>{
  const generic=base('Toro Original','generic',{imageUrl:'https://example.invalid/toro.jpg'});const scampi=base('Coop Scampi Hvitløk & Urter','scampi',{imageUrl:'https://example.invalid/scampi.jpg'});
  const tasks=[generic,scampi].map(input=>({conceptId:repo.ensureConcept(input),input:[input]}));const calls=[];
  mock.method(ai,'requestConceptAI',async(batch,taxonomy,image)=>{
    for(const t of batch)calls.push({id:t.conceptId,image:!!image});
    if(image)throw Error('image download failed');
    return new Map(batch.map(t=>[t.conceptId,t.input[0].title==='Toro Original'?suggestion(t.input[0],[],{confidence:.25,insufficientEvidence:true}):suggestion(t.input[0],assignments(fixture.cases.find(c=>c.id==='seasoned-scampi').expected))]));
  });
  await service.classifyBatch(tasks);
  assert.equal(calls.filter(c=>c.id===tasks[0].conceptId&&c.image).length,1);assert.equal(calls.filter(c=>c.id===tasks[1].conceptId&&c.image).length,0);
  const vague=repo.getClassification(tasks[0].conceptId);assert.equal(vague.needsReview,true);assert.ok(vague.reviewReasons.includes('image_unavailable_or_failed'));
  assert.equal(vague.confidence,.25);assert.equal(repo.getClassification(tasks[1].conceptId).needsReview,false);
});

test('new prompt version makes old AI stale without changing taxonomy, assignments or manual locks',()=>{
  const input=base('Lettrømme 0,5 %','version');const labels=assignments(fixture.cases[0].expected);const id=repo.ensureConcept(input);
  repo.saveClassification(id,labels,[input],'ai',.98);
  db.prepare('UPDATE concept_classifications SET prompt_version=? WHERE concept_id=?').run('concept-classification-v4:evidence-v2',id);
  const taxonomy=repo.taxonomyVersion();const before=repo.getClassification(id);assert.equal(repo.isStale(before),true);
  assert.equal(repo.promptVersion(),'concept-classification-v7:evidence-v3');assert.equal(repo.taxonomyVersion(),taxonomy);assert.deepEqual(repo.getClassification(id),before);
  repo.setManual(id,labels,[input]);const manual=repo.getClassification(id);
  assert.equal(repo.isStale(manual),false);assert.equal(repo.saveClassification(id,[],[input],'ai',1),false);assert.deepEqual(repo.getClassification(id),manual);
});
