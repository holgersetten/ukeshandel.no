import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import type { Suggestion, ProductInput } from '../core/src/services/concepts/types';

// Evaluation only: a fixed, bounded sample. Never retries production concepts.
const sample = [
  {id:'plain-chicken',offerId:'E4xEJuHY7uYnIP6Q-IqCO'},
  {id:'seasoned-chicken',offerId:'R4v3Y6fIrKwRT-YNRTPFa'},
  {id:'scampi',offerId:'41aDHOQE7zbrZBncGGSfK'},
  {id:'raw-lamb',offerId:'F4YURvpH7LVdeQCmUyoPR'},
  {id:'raw-lamb-reordered',offerId:'33_NF0b6i2UcI0Q7uEfM8'},
  {id:'sour-cream',offerId:'Y_10msKaBSASiCWm87zl7'},
  {id:'mozzarella',offerId:'zkOBCU3-ytF9OQyBQtoM2'},
  {id:'pizza-base',offerId:'uR0sxJ9OzuA6MDzE9AB4K'},
  {id:'prepared-pizza',offerId:'GcAVVHkIXB-DrhiLZbJ3q'},
  {id:'prepared-lamb',offerId:'z3aJ6f6eoK0JQzWoSOA_n'},
  {id:'dish-only-title',offerId:'vJLYVuIJLxE9_aFLXCbFU'},
  {id:'brand-only',offerId:'ad4_JjoZ9NwdNFrk0xc3Q'},
  {id:'garlic-bread',offerId:'4ksoVXXjWcRdv_OgiRI0l'},
];
const digest = (value:string) => createHash('sha256').update(value).digest('hex');
const protectedTables=['taxonomy_categories','product_concepts','concept_aliases','concept_classifications','concept_categories','classifications','classification_categories','schema_migrations'];

async function main() {
  if(!process.argv.includes('--live'))throw new Error('Bruk --live for det begrensede AI-samplet');
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY mangler');
  const sourceDir=process.env.OFFERS_DIR || path.join(__dirname,'../persistence/src/resources/offers');
  const sourceDb=process.env.DB_PATH || path.join(__dirname,'../../persistence/data/mattilbud.db');
  const production=new Database(sourceDb,{readonly:true,fileMustExist:true});
  const fingerprint=()=>digest(JSON.stringify(protectedTables.map(table=>({table,rows:production.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()}))));
  const sourceFiles=fs.readdirSync(sourceDir).filter(f=>f.endsWith('_offers.json')).sort();
  const sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,digest(fs.readFileSync(path.join(sourceDir,file),'utf8'))]));
  const before=fingerprint();const filesBefore=sourceHashes();
  const taxonomyFile=path.join(path.dirname(sourceDir),'taxonomy.v2.json');
  const taxonomyBefore=digest(fs.readFileSync(taxonomyFile,'utf8'));
  const offers:ProductInput[]=sourceFiles.flatMap(file=>JSON.parse(fs.readFileSync(path.join(sourceDir,file),'utf8')));
  const selected=sample.map(row=>{const input=offers.find(o=>o.offerId===row.offerId);if(!input)throw new Error('Sampletilbud mangler: '+row.id);return {...row,input};});
  // A fourteenth real case: a vegetable/carbohydrate raw material, selected by exact title.
  const potato=offers.find(o=>/^poteter$/iu.test(o.title));
  if(potato)selected.push({id:'potatoes',offerId:potato.offerId!,input:potato});
  assert.ok(selected.length<=14);
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-real-ai-sample-'));
  process.env.DB_PATH=path.join(temporary,'evaluation.db');process.env.OFFERS_DIR=path.join(temporary,'empty-offers');
  const database=require('../core/src/db/db') as typeof import('../core/src/db/db');
  try {
    database.initDb();
    const repo=require('../core/src/db/productConceptRepo') as typeof import('../core/src/db/productConceptRepo');
    const ai=require('../core/src/services/concepts/conceptAI') as typeof import('../core/src/services/concepts/conceptAI');
    const service=(require('../core/src/services/concepts/conceptService') as typeof import('../core/src/services/concepts/conceptService')).default;
    const identity=require('../core/src/utils/offerOccurrence') as typeof import('../core/src/utils/offerOccurrence');
    const config=require('../core/src/services/concepts/config') as typeof import('../core/src/services/concepts/config');
    const taxonomy=repo.getTaxonomy();
    const attempts:{conceptId:string;image:boolean;result?:Suggestion;error?:string}[]=[];
    const request=ai.requestConceptAI;
    ai.requestConceptAI=async(tasks,categories,image=false)=>{
      const rows=tasks.map(t=>({conceptId:t.conceptId,image}));
      attempts.push(...rows);
      try {const results=await request(tasks,categories,image);for(const row of rows)(row as typeof attempts[number]).result=results.get(row.conceptId);return results;}
      catch(error){for(const row of rows)(row as typeof attempts[number]).error=(error as Error).message.split(process.env.OPENAI_API_KEY || 'unused-secret').join('[redacted]');throw error;}
    };
    const tasks=selected.map(row=>{const input=identity.originalInput(row.input);return {conceptId:repo.ensureConcept(input),input:[input]};});
    const cases:any[]=[];
    for(let i=0;i<tasks.length;i+=10)await service.classifyBatch(tasks.slice(i,i+10));
    const describe=(labels:Suggestion['assignments'])=>labels.map(a=>({...a,name:taxonomy.find(c=>c.id===a.categoryId)?.name}));
    for(const [index,row] of selected.entries()) {
      const task=tasks[index];const entry=repo.getClassification(task.conceptId)!;
      const calls=attempts.filter(a=>a.conceptId===task.conceptId);
      const result=[...calls].reverse().find(a=>a.result)?.result;
      const chosen=describe(result?.assignments || []);
      cases.push({case:row.id,originalTitle:row.input.title,description:row.input.description || '',input:task.input[0],
        imageAttempted:calls.some(c=>c.image),imageUsed:calls.some(c=>c.image&&c.result),
        product_type:chosen.filter(a=>a.facet==='product_type'),ingredient:chosen.filter(a=>a.facet==='ingredient'),
        dish:chosen.filter(a=>a.facet==='dish'),dietary:chosen.filter(a=>a.facet==='dietary'),usage:chosen.filter(a=>a.facet==='usage'),
        confidence:entry.confidence,needsReview:entry.needsReview,reviewReasons:entry.reviewReasons,
        insufficientEvidence:result?.insufficientEvidence ?? true,evidence:result?.evidence || [],
        acceptedAssignments:describe(entry.assignments),calls:calls.map(c=>({image:c.image,error:c.error,confidence:c.result?.confidence,insufficientEvidence:c.result?.insufficientEvidence})),
      });
    }
    assert.equal(fingerprint(),before,'Produksjonsdatabasen ble endret');assert.deepEqual(sourceHashes(),filesBefore,'Tilbudsfiler ble endret');assert.equal(digest(fs.readFileSync(taxonomyFile,'utf8')),taxonomyBefore,'Taksonomien ble endret');
    const outputIndex=process.argv.indexOf('--output');
    const output=outputIndex>=0?process.argv[outputIndex+1]:path.join(__dirname,'../evaluation-results/real-offers-prompt-v7.json');
    if(!output)throw new Error('Outputfil mangler');
    const report={generatedAt:new Date().toISOString(),scope:'Existing JSON offers, real OpenAI calls, temporary SQLite; no production retry or writes',
      promptVersion:repo.promptVersion(),taxonomyVersion:repo.taxonomyVersion(),model:config.MODEL(),
      selectedCases:cases.length,explicitDietaryOffersAvailable:offers.filter(o=>/vegetar|vegansk|glutenfri/iu.test(o.title+' '+(o.description||''))).length,
      productionFingerprint:before,unchanged:{databaseRows:true,offerFiles:true,taxonomyFile:true},
      note:'Facet columns show the last model suggestion. Review-required suggestions are not accepted as active assignments by existing UniCat policy.',cases};
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({output,cases:cases.length,review:cases.filter(c=>c.needsReview).length,imageAttempted:cases.filter(c=>c.imageAttempted).length,unchanged:report.unchanged},null,2));
  } finally {
    database.closeDb();assert.equal(fingerprint(),before,'Produksjonsdatabasen ble endret');assert.deepEqual(sourceHashes(),filesBefore,'Tilbudsfiler ble endret');production.close();
  }
}
main().catch(error=>{console.error((error as Error).message.split(process.env.OPENAI_API_KEY || 'unused-secret').join('[redacted]'));process.exitCode=1;});
