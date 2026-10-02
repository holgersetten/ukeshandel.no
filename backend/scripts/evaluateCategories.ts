import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function main() {
  const live=process.argv.includes('--live');
  if(!live && !process.argv.includes('--validate'))throw new Error('Bruk --validate (offline) eller --live (AI-evaluering)');
  if(live&&!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY mangler');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ukeshandel-eval-'));
  // Never open or mutate the application's database during evaluation.
  process.env.DB_PATH=path.join(temporary,'evaluation.db');
  process.env.OFFERS_DIR=path.join(temporary,'empty-offers');
  const database=require('../core/src/db/db') as typeof import('../core/src/db/db');
  try {
    database.initDb();
    const repo=require('../core/src/db/productConceptRepo') as typeof import('../core/src/db/productConceptRepo');
    const service=(require('../core/src/services/concepts/conceptService') as typeof import('../core/src/services/concepts/conceptService')).default;
    const identity=require('../core/src/utils/offerOccurrence') as typeof import('../core/src/utils/offerOccurrence');
    const config=require('../core/src/services/concepts/config') as typeof import('../core/src/services/concepts/config');
    const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../tests/fixtures/category-gold.v1.json'),'utf8'));
    const taxonomy=repo.getTaxonomy();
    const categoryId=(a:any)=>{
      const matches=taxonomy.filter(c=>c.facet===a.facet&&c.name===a.name&&c.assignable&&c.active);
      if(matches.length!==1)throw new Error('Fasitkategori er tvetydig eller mangler: '+JSON.stringify(a));
      return matches[0].id;
    };
    const prepared=fixture.cases.map((c:any)=>({...c,input:identity.originalInput(c.input),
      expected:c.expected.map((a:any)=>({categoryId:categoryId(a),facet:a.facet,relation:a.relation||''})),
      forbidden:(c.forbidden||[]).map((a:any)=>categoryId(a))}));
    const results:any[]=[];
    if(live) {
      const tasks=prepared.map((c:any)=>({conceptId:repo.ensureConcept(c.input),input:[c.input]}));
      await service.classifyBatch(tasks);
      for(const [index,c] of prepared.entries()) {
        const result=repo.getClassification(tasks[index].conceptId)!;
        const key=(a:any)=>[a.categoryId,a.facet,a.relation].join('|');
        const expected=new Set<string>(c.expected.map(key));const actual=new Set<string>(result.assignments.map(key));
        const exact=expected.size===actual.size&&[...expected].every(k=>actual.has(k));
        const forbidden=result.assignments.some(a=>c.forbidden.includes(a.categoryId));
        const productTypeCorrect=c.expectedReview ? result.needsReview :
          c.expected.filter((a:any)=>a.facet==='product_type').every((a:any)=>actual.has(key(a)));
        results.push({id:c.id,passed:c.expectedReview ? result.needsReview&&!result.assignments.length : exact&&!forbidden&&!result.needsReview,
          productTypeCorrect,needsReview:result.needsReview,reasons:result.reviewReasons,
          actual:result.assignments.map(a=>({...a,name:taxonomy.find(t=>t.id===a.categoryId)?.name})),expected:c.expected});
      }
    }
    // Identity is deterministic; semantic equality takes explicit approval, never fuzzy merging.
    const identityResults=fixture.identityPairs.map((pair:any)=>{
      const left=prepared.find((c:any)=>c.id===pair.left);const right=prepared.find((c:any)=>c.id===pair.right);
      const leftId=repo.ensureConcept(left.input);const rightId=repo.ensureConcept(right.input);
      const initiallySeparate=leftId!==rightId;
      let approvedLinkWorks=true;
      if(pair.sameConcept) {
        repo.revokeAlias((repo.getAliases() as any[]).find(a=>a.scopeKey==='offer:'+right.input.offerOccurrenceId&&a.status==='approved').id);
        repo.approveAlias(right.input.title,leftId,right.input.offerOccurrenceId);
        approvedLinkWorks=repo.findConcept(right.input)===leftId;
      }
      return {...pair,passed:initiallySeparate&&approvedLinkWorks};
    });
    const perFacet=Object.fromEntries(['product_type','ingredient','dish','dietary','usage'].map(facet=>{
      let tp=0,fp=0,fn=0;const key=(a:any)=>[a.categoryId,a.relation].join('|');
      for(const row of results){const expected=new Set(row.expected.filter((a:any)=>a.facet===facet).map(key));const actual=new Set(row.actual.filter((a:any)=>a.facet===facet).map(key));for(const k of actual)expected.has(k)?tp++:fp++;for(const k of expected)if(!actual.has(k))fn++;}
      return [facet,{truePositives:tp,falsePositives:fp,falseNegatives:fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null}];
    }));
    const report={datasetVersion:fixture.version,mode:live?'live-ai':'fixture-validation-only',
      promptVersion:repo.promptVersion(),taxonomyVersion:repo.taxonomyVersion(),model:live?config.MODEL():null,
      fixtureCases:prepared.length,identityResults,results,
      metrics:live?{exactAccuracy:results.filter(r=>r.passed).length/results.length,
        productTypeAccuracy:results.filter(r=>r.productTypeCorrect).length/results.length,
        reviewRate:results.filter(r=>r.needsReview).length/results.length,perFacet}:null};
    const outputIndex=process.argv.indexOf('--output');
    if(outputIndex>=0){if(!process.argv[outputIndex+1])throw new Error('Outputfil mangler');fs.writeFileSync(process.argv[outputIndex+1],JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify(report,null,2));
    if(identityResults.some((r:any)=>!r.passed)||(live&&results.some(r=>!r.passed)))process.exitCode=1;
  }finally{database.closeDb();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
