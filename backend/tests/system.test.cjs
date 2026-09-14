const {test,after,afterEach,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const Database=require('better-sqlite3');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-test-'));
process.env.DB_PATH=path.join(temporary,'test.db');
process.env.OFFERS_DIR=path.join(temporary,'offers');
process.env.CATEGORIES_FILE=path.join(__dirname,'../persistence/src/resources/categories.json');
process.env.SKIP_AI='true';
fs.mkdirSync(process.env.OFFERS_DIR);
// Representative old rows: same name across stores, manual priority, conflicting manual corrections.
const old=new Database(process.env.DB_PATH);
old.exec(`CREATE TABLE category_cache(product_key TEXT PRIMARY KEY,main_category TEXT,sub_category TEXT,source TEXT,confidence_main REAL,confidence_sub REAL)`);
const insert=old.prepare('INSERT INTO category_cache VALUES (?,?,?,?,?,?)');
insert.run('TINE Melk|1l|x1|meny','Meieri & egg','Melk','manual',1,1);
insert.run('tine melk|kiwi','Drikke','Juice','ai',.99,.99);
insert.run('konflikt|meny','Middag','Pasta','manual',1,1);
insert.run('konflikt|kiwi','Middag','Ris','manual',1,1);
insert.run('gammel usikker|meny','Middag','Pasta','ai',.7,.7);
old.close();
const database=require('../core/src/db/db');database.initDb();
const db=database.getDb();const categories=require('../core/src/config/categories');
const cache=require('../core/src/db/categoryCacheRepo');
const service=require('../core/src/services/categoryService').default;
const offers=require('../core/src/services/offerService').default;
const ai=require('../core/src/services/aiCategorization');
const updater=require('../core/src/services/offerUpdateService');
const id=name=>categories.getCategories().find(c=>c.name===name).id;
const lasagne={title:'  VegetarLASAGNE! ',store:'Meny',price:35,currency:'NOK',size:500,unit:'g',offerId:'one',description:'Vegetarisk ferdigrett'};
fs.writeFileSync(path.join(process.env.OFFERS_DIR,'meny_offers.json'),JSON.stringify([{...lasagne,productKey:'old',mainCategory:'old',ingredientKey:'old'}]));
afterEach(()=>{mock.restoreAll();process.env.SKIP_AI='true';delete process.env.OPENAI_API_KEY;});
after(()=>{database.closeDb();assert.equal(path.dirname(temporary),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(temporary).startsWith('ukeshandel-test-'));fs.rmSync(temporary,{recursive:true});});

test('image payload extraction supports nested Tjek image objects and direct URLs',()=>{
  const imageService=require('../persistence/src/services/imageService').default;
  assert.equal(imageService.extractFirstImageUrl({view:{url:'https://example.com/view.jpg'}}),'https://example.com/view.jpg');
  assert.equal(imageService.extractFirstImageUrl({zoom:'https://example.com/zoom.jpg'}),'https://example.com/zoom.jpg');
  assert.equal(imageService.extractFirstImageUrl({images:[{thumb:{url:'https://example.com/thumb.jpg'}}]}),'https://example.com/thumb.jpg');
  assert.equal(imageService.extractFirstImageUrl({}),null);
});

test('migration preserves manual decisions, marks conflicts and creates a backup; restart is idempotent',()=>{
  assert.equal(cache.get('tine melk').source,'manual');assert.deepEqual(cache.get('tine melk').categoryIds,[id('Melk')]);
  assert.equal(cache.get('konflikt').needsReview,true);assert.equal(cache.get('konflikt').categoryIds.length,2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM category_cache').get().n,5);
  assert.ok(fs.readdirSync(temporary).some(n=>n.includes('before-normalized')));
  const before=cache.getAll();database.initDb();assert.deepEqual(cache.getAll(),before);
});
test('fresh database and empty cache migrate without price tables',()=>{
  const fresh=new Database(':memory:');fresh.pragma('foreign_keys=ON');
  require('../core/src/db/categoryMigration').migrateCategories(fresh);
  assert.ok(fresh.prepare('SELECT count(*) AS n FROM categories').get().n>1);
  assert.equal(fresh.prepare("SELECT name FROM sqlite_master WHERE name='price_history'").get(),undefined);fresh.close();
});
test('two direct categories inherit their ancestors; title and source offer fields remain untouched',async()=>{
  service.setManualCategory('vegetarlasagne',[id('Ferdigretter'),id('Vegetar')]);
  const result=(await offers.getAllOffers())[0];
  for(const key of Object.keys(lasagne)) assert.deepEqual(result[key],lasagne[key]);
  assert.ok(!('productKey' in result));assert.ok(!('ingredientKey' in result));
  assert.deepEqual(new Set(result.categoryIds),new Set([id('Ferdigretter'),id('Vegetar')]));
  assert.ok(result.effectiveCategoryIds.includes(id('Middag')));
  assert.equal(result.normalizedName,'vegetarlasagne');
  assert.deepEqual(service.categorizeOffer({...lasagne,store:'Kiwi',size:1000}).categoryIds,result.categoryIds);
});
test('one AI request per normalized name across stores; low confidence results are reused',async()=>{
  process.env.SKIP_AI='false';process.env.OPENAI_API_KEY='test';
  const call=mock.method(ai,'batchCategorizeWithAI',async products=>{assert.equal(products.length,1);return new Map([[products[0].normalizedName,{categoryIds:[id('Ferdigretter'),id('Vegetar')],confidence:.6}]]);});
  const input=[{...lasagne,title:'NY Lasagne'},{...lasagne,title:'  ny  lasagne ',store:'Kiwi'}];
  await service.categorizeOffers(input);await service.categorizeOffers(input);
  assert.equal(call.mock.callCount(),1);assert.equal(cache.get('ny lasagne').needsReview,true);
});
test('cached migration conflicts and manual decisions never go back to AI automatically',async()=>{
  process.env.SKIP_AI='false';process.env.OPENAI_API_KEY='test';
  const call=mock.method(ai,'batchCategorizeWithAI',async()=>{throw Error('must not be called');});
  await service.categorizeOffers([{title:'konflikt'},{title:'gammel usikker'},{title:'Tine melk'}]);assert.equal(call.mock.callCount(),0);
});
test('completed AI batches survive a later network failure',async()=>{
  process.env.SKIP_AI='false';process.env.OPENAI_API_KEY='test';
  let batches=0;
  mock.method(ai,'batchCategorizeWithAI',async products=>{
    if(++batches===2) throw Error('network');
    return new Map(products.map(p=>[p.normalizedName,{categoryIds:[id('Ris')],confidence:.95}]));
  });
  const input=Array.from({length:31},(_,i)=>({title:'batch product '+i}));
  await assert.rejects(service.categorizeOffers(input),/network/);
  assert.ok(cache.get('batch product 0'));assert.equal(cache.get('batch product 30'),null);
  await service.categorizeOffers(input);
  assert.equal(batches,3);assert.ok(cache.get('batch product 30'));
});
test('invalid/missing AI answer is reviewed rather than repeatedly billed',async()=>{
  process.env.SKIP_AI='false';process.env.OPENAI_API_KEY='test';
  const call=mock.method(ai,'batchCategorizeWithAI',async()=>new Map());
  await service.categorizeOffers([{title:'missing result'}]);await service.categorizeOffers([{title:'missing result'}]);
  assert.equal(call.mock.callCount(),1);assert.equal(cache.get('missing result').needsReview,true);
});
test('AI validation rejects unknown IDs, more than three categories, duplicates and invalid confidence',()=>{
  const product=[{normalizedName:'a',title:'A'}];
  const parse=row=>ai.parseResults(JSON.stringify({results:[{normalizedName:'a',confidence:.95,...row}]}),product);
  assert.equal(parse({categoryIds:['fake']}).size,0);
  assert.equal(parse({categoryIds:[id('Ris'),id('Pasta'),id('Melk'),id('Vegetar')]}).size,0);
  assert.equal(parse({categoryIds:[id('Ris'),id('Ris')]}).size,0);
  assert.equal(parse({categoryIds:[id('Ris')],confidence:2}).size,0);
  assert.deepEqual(parse({categoryIds:[id('Middag'),id('Ferdigretter'),id('Vegetar')]}).get('a').categoryIds,[id('Ferdigretter'),id('Vegetar')]);
});
test('manual correction during an AI request wins',async()=>{
  process.env.SKIP_AI='false';process.env.OPENAI_API_KEY='test';
  mock.method(ai,'batchCategorizeWithAI',async()=>{
    service.setManualCategory('race',[id('Ris')]);return new Map([['race',{categoryIds:[id('Pasta')],confidence:.99}]]);
  });
  await service.categorizeOffers([{title:'race'}]);assert.deepEqual(cache.get('race').categoryIds,[id('Ris')]);
});
test('category rename keeps IDs; reparenting changes inheritance; cycles and unsafe deletes are rejected',()=>{
  const parent=categories.saveCategory(undefined,'Test forelder',null);
  const child=categories.saveCategory(undefined,'Test barn',parent.id);
  service.setManualCategory('testvare',[child.id]);
  categories.saveCategory(child.id,'Nytt navn',parent.id);
  assert.equal(service.categorizeOffer({title:'testvare'}).categories.find(c=>c.id===child.id).name,'Nytt navn');
  assert.throws(()=>categories.saveCategory(parent.id,parent.name,child.id),/forelder/);
  assert.throws(()=>categories.deleteCategory(parent.id),/underkategoriene/);
  categories.saveCategory(child.id,'Nytt navn',id('Middag'));
  assert.ok(service.categorizeOffer({title:'testvare'}).effectiveCategoryIds.includes(id('Middag')));
  assert.ok(!service.categorizeOffer({title:'testvare'}).effectiveCategoryIds.includes(parent.id));
  categories.deleteCategory(child.id);assert.equal(cache.get('testvare').needsReview,true);categories.deleteCategory(parent.id);
});
test('manual validation leaves saved classification unchanged on invalid input',()=>{
  service.setManualCategory('validation',[id('Ris')]);
  assert.throws(()=>service.setManualCategory('validation',['missing']));
  assert.throws(()=>service.setManualCategory('NOT normalized',[id('Ris')]));
  assert.deepEqual(cache.get('validation').categoryIds,[id('Ris')]);
});
test('fetch saves the original offer title and reports failed writes',async()=>{
  const tjek=require('../persistence/src/services/tjekApiService').default;
  mock.method(tjek,'getStoreOffers',async()=>[lasagne]);
  await offers.updateStoreOffers({name:'Meny',dealerId:'test'});
  const saved=JSON.parse(fs.readFileSync(path.join(process.env.OFFERS_DIR,'meny_offers.json')))[0];
  assert.equal(saved.title,lasagne.title);assert.ok(!('productKey' in saved));
  mock.method(require('../persistence/src/services/fileService').default,'saveJSON',()=>false);
  await assert.rejects(offers.updateStoreOffers({name:'Meny',dealerId:'test'}),/lagre/);
});
test('concurrent updates share one job and report store failures',async()=>{
  let release;const gate=new Promise(r=>{release=r;});
  mock.method(offers,'getAllOffers',async()=>[{...lasagne,normalizedName:'vegetarlasagne'}]);
  const fetch=mock.method(offers,'updateAllStoreOffersWithTracking',async()=>{await gate;return {errors:{Meny:'failed'}};});
  mock.method(service,'categorizeOffers',async()=>[]);
  const first=updater.updateOffers(),second=updater.updateOffers();assert.equal(first,second);release();
  assert.equal((await first).success,false);assert.equal(fetch.mock.callCount(),1);
});
test('failed update releases the lock',async()=>{
  const read=mock.method(offers,'getAllOffers',async()=>{throw Error('testfeil');});
  await assert.rejects(updater.updateOffers(),/testfeil/);await assert.rejects(updater.updateOffers(),/testfeil/);assert.equal(read.mock.callCount(),2);
});
test('HTTP API supports multiple category IDs and rejects the retired key contract',async()=>{
  const app=require('express')();app.use(require('express').json());app.use('/api',require('../rest/src/routes/offers').default);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  try {
    let response=await fetch(base+'/offers/categorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({normalizedName:'vegetarlasagne',categoryIds:[id('Ferdigretter'),id('Vegetar')]})});assert.equal(response.status,200);
    response=await fetch(base+'/offers');const data=await response.json();assert.ok(data.offers[0].effectiveCategoryIds.includes(id('Middag')));
    response=await fetch(base+'/offers/categorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productKey:'old'})});assert.equal(response.status,400);
    response=await fetch(base+'/categories');assert.ok((await response.json()).categories.every(c=>'parentId' in c));
  } finally {await new Promise(r=>server.close(r));}
});
