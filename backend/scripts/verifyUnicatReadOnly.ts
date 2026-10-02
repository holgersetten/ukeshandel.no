import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import config from '../rest/src/config';
import { hashInput,offerOccurrenceId } from '../core/src/utils/offerOccurrence';
import { normalizeTitle } from '../core/src/utils/normalizeTitle';

// Read-only audit: never imports initDb, calls AI, fetches Tjek, or invokes a mutation endpoint.
async function main(){
  const origin=(process.env.UNICAT_VERIFY_ORIGIN||'http://localhost:5000').replace(/\/+$/,'');
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'Kun localhost kan verifiseres med dette scriptet');
  const db=new Database(config.dbPath,{readonly:true,fileMustExist:true});
  const fingerprint=()=>hashInput(['product_concepts','concept_aliases','concept_classifications','concept_categories','taxonomy_categories','classifications','classification_categories','categories','schema_migrations'].map(table=>({table,rows:db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()})));
  const sourceHashes=()=>Object.fromEntries(fs.readdirSync(config.offersDir).filter(f=>f.endsWith('.json')).sort().map(f=>[f,hashInput(fs.readFileSync(path.join(config.offersDir,f),'utf8'))]));
  const beforeDb=fingerprint();const beforeFiles=sourceHashes();
  const taxonomyFile=path.join(path.dirname(config.categoriesFile),'taxonomy.v2.json');const beforeTaxonomy=hashInput(fs.readFileSync(taxonomyFile,'utf8'));
  try {
    const endpoint=async(route:string)=>{const response=await fetch(origin+route);assert.equal(response.status,200,route);return response.json() as Promise<any>;};
    const [first,second,categories,review,historical,mode]=await Promise.all(['/api/offers','/api/offers','/api/categories','/api/offers/review','/api/classifications/review','/api/classification-mode'].map(endpoint));
    assert.equal(first.count,first.offers.length);assert.equal(first.count,second.count);
    const secondIds=new Set(second.offers.map((o:any)=>o.offerOccurrenceId));
    const aliases=db.prepare('SELECT id,normalized_title AS normalizedTitle,scope_key AS scopeKey,concept_id AS conceptId,status FROM concept_aliases').all() as any[];
    const categoryById=new Map<string,any>(categories.categories.map((c:any)=>[c.id,c]));
    const ancestors=(id:string):string[]=>{const result:string[]=[];const seen=new Set<string>();let parent=categoryById.get(id)?.parentId;while(parent){assert.ok(!seen.has(parent),'Syklus');seen.add(parent);result.push(parent);parent=categoryById.get(parent)?.parentId;}return result;};
    const issues:any[]=[];
    for(const offer of first.offers){
      assert.equal(offer.offerOccurrenceId,offerOccurrenceId(offer),'Ustabil forekomst-ID: '+offer.title);assert.ok(secondIds.has(offer.offerOccurrenceId));
      if(!offer.conceptId)issues.push({title:offer.title,issue:'No conceptId; legacy fallback only'});
      for(const id of offer.categoryIds)for(const parent of ancestors(id))if(!offer.effectiveCategoryIds.includes(parent))issues.push({title:offer.title,issue:'Missing inherited category',category:id,parent});
      if(offer.stale&&!offer.needsReview)issues.push({title:offer.title,issue:'Stale offer missing review status'});
      for(const a of offer.assignments||[])if(categoryById.get(a.categoryId)?.facet!==a.facet)issues.push({title:offer.title,issue:'Assignment facet mismatch'});
    }
    assert.equal(review.offers.length,first.offers.filter((o:any)=>o.needsReview).length);
    assert.ok(historical.classifications.every((c:any)=>c.needsReview),'Historikk har feil review-status');
    const targets:{case:string;exact:(o:any)=>boolean;related?:(o:any)=>boolean}[]=[
      {case:'Lettrømme 0,5 %',exact:o=>normalizeTitle(o.title)==='lettrømme 0 5',related:o=>/lettrømme/i.test(o.title)},
      {case:'Navnevariant av lettrømme',exact:o=>normalizeTitle(o.title)==='lettrømme 0 5 prosent'},
      {case:'Coop Scampi Hvitløk & Urter',exact:o=>/scampi.*hvitløk/i.test(o.title),related:o=>/coop scampi/i.test(o.title)},
      {case:'Lam fårikålkjøtt',exact:o=>normalizeTitle(o.title)==='lam fårikålkjøtt'},
      {case:'Fårikålkjøtt lam',exact:o=>normalizeTitle(o.title)==='fårikålkjøtt lam'},
      {case:'Fjordland Fårikål',exact:o=>normalizeTitle(o.title)==='fjordland fårikål',related:o=>normalizeTitle(o.title)==='fårikål'},
      {case:'Generisk Fjordland',exact:o=>normalizeTitle(o.title)==='fjordland'},
      {case:'Vanlig kyllingfilet',exact:o=>normalizeTitle(o.title)==='kyllingfilet'},
      {case:'Marinert kyllingfilet',exact:o=>/marinert.*kyllingfilet|kyllingfilet.*marinert/i.test(o.title),related:o=>/kyllingfilet.*hvitløk/i.test(o.title)},
      {case:'Ferdigpizza',exact:o=>/pizza/i.test(o.title)&&!/bunn|topping/i.test(o.title)},
      {case:'Vegetarvare',exact:o=>/vegetar|vegansk|plantebasert/i.test(o.title)},
      {case:'Svært vag tittel',exact:o=>/^(ukens favoritt|utvalgte varer|diverse|ukjent tilbud)$/i.test(o.title)}
    ];
    const records=targets.map(target=>{
      const exact=first.offers.find(target.exact);const offer=exact||(target.related?first.offers.find(target.related):null);
      if(!offer)return {case:target.case,match:'not-found-in-current-offers',dataSource:'real-stored-offers',offerOccurrenceId:null,concept_id:null,aliasUsed:null,conceptState:null,activeClassification:null,product_type:null,ingredient:null,dish:null,source:null,manual_lock:null,stale:null,needs_review:null,imageFallbackAttempted:null};
      const entry=db.prepare('SELECT source,manual_lock,input_json,prompt_version,taxonomy_version,model,needs_review FROM concept_classifications WHERE concept_id=?').get(offer.conceptId) as any;
      const local=aliases.find(a=>a.status==='approved'&&a.scopeKey==='offer:'+offer.offerOccurrenceId);
      const alias=local||aliases.find(a=>a.status==='approved'&&a.scopeKey==='global'&&a.normalizedTitle===normalizeTitle(offer.title));
      const describe=(a:any)=>({...a,name:categoryById.get(a.categoryId)?.name||null});
      return {case:target.case,match:exact?'current-title-match':'related-only-not-the-requested-exact-product',observedTitle:offer.title,store:offer.store,dataSource:'real-stored-offers',
        offerOccurrenceId:offer.offerOccurrenceId,concept_id:offer.conceptId,aliasUsed:alias||null,conceptState:'existing; read-only audit creates nothing',
        activeClassification:{layer:offer.classificationLayer,displayedCategories:offer.categoryIds.map((id:string)=>({id,name:categoryById.get(id)?.name})),conceptAssignments:(offer.assignments||[]).map(describe)},
        product_type:(offer.assignments||[]).filter((a:any)=>a.facet==='product_type').map(describe),ingredient:(offer.assignments||[]).filter((a:any)=>a.facet==='ingredient').map(describe),dish:(offer.assignments||[]).filter((a:any)=>a.facet==='dish').map(describe),
        source:offer.categorySource,manual_lock:offer.manualLock,stale:offer.stale,needs_review:offer.needsReview,reviewReason:offer.reviewReason,
        storedClassificationSource:entry?.source,storedOriginalInputCount:entry?JSON.parse(entry.input_json).length:0,
        imageFallbackAttempted:null,imageFallbackAttemptedInThisReadOnlyAudit:false,imageFallbackNote:'Historical attempts are not persisted; cannot infer them from imageUrl'};
    });
    let frontend:any;try{const response=await fetch('http://localhost:5173');frontend={status:response.status,htmlHasRoot:(await response.text()).includes('id="root"'),interactiveBrowserTest:false};}catch(error){frontend={reachable:false,error:(error as Error).message,interactiveBrowserTest:false};}
    const afterDb=fingerprint();const afterFiles=sourceHashes();const afterTaxonomy=hashInput(fs.readFileSync(taxonomyFile,'utf8'));
    assert.equal(beforeDb,afterDb,'Databaseinnhold endret under audit');assert.deepEqual(beforeFiles,afterFiles,'Tilbudsfiler endret');assert.equal(beforeTaxonomy,afterTaxonomy,'Taksonomifil endret');
    const report={generatedAt:new Date().toISOString(),scope:'GET endpoints and readonly SQLite; no source refetch, AI call, classification write or alias approval',
      mode,offers:first.count,uniqueOccurrences:secondIds.size,uniqueConcepts:new Set(first.offers.map((o:any)=>o.conceptId)).size,
      identities:{allRepeatedIdsStable:true,usingCatalogId:first.offers.filter((o:any)=>o.catalogId).length,usingPeriodFallback:first.offers.filter((o:any)=>!o.catalogId).length},
      review:{offers:review.count,uniqueConcepts:new Set(review.offers.map((o:any)=>o.conceptId)).size,stale:review.offers.filter((o:any)=>o.stale).length,manualLocked:review.offers.filter((o:any)=>o.manualLock).length},
      classificationLayers:first.offers.reduce((a:any,o:any)=>{a[o.classificationLayer]=(a[o.classificationLayer]||0)+1;return a;},{}),
      frontend,issues,cases:records,unchanged:{databaseRows:beforeDb===afterDb,offerFiles:true,taxonomyFile:true},databaseContentHash:afterDb,offerFileHashes:afterFiles};
    const output=path.join(__dirname,'../evaluation-results/unicat-live-readonly.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({output,offers:report.offers,identities:report.identities,review:report.review,issues,unchanged:report.unchanged,frontend},null,2));
    if(issues.length)process.exitCode=1;
  }finally{db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
