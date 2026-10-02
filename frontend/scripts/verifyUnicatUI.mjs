import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reportPath=path.join(root,'../backend/evaluation-results/unicat-mechanics.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
const taxonomy=JSON.parse(fs.readFileSync(path.join(root,'../backend/persistence/src/resources/taxonomy.v2.json'),'utf8')).categories;
const server=await createServer({root,configFile:path.join(root,'vite.config.ts'),server:{middlewareMode:true},
  plugins:[{name:'verification-only-export',enforce:'pre',transform(code,id){
    // Expose the existing nested component in memory only; no application source is rewritten.
    if(id.replaceAll('\\','/').endsWith('/src/components/AdminReview.tsx'))return code+'\nexport { OfferReviewCard };';
  }}]});
try {
  const {OfferGrid}=await server.ssrLoadModule('/src/components/grocery/offer-grid.tsx');
  const {default:Picker}=await server.ssrLoadModule('/src/components/ConceptCategoryPicker.tsx');
  const {OfferReviewCard}=await server.ssrLoadModule('/src/components/AdminReview.tsx');
  const cases=report.cases.filter(c=>c.dataSource==='synthetic-fixture'&&c.case!=='lamb-after-manual-lock');
  assert.equal(cases.length,12);
  const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
  const grid=renderToStaticMarkup(React.createElement(OfferGrid,{offers:cases.map(c=>({id:c.offerOccurrenceId,title:c.title,price:39,currency:'NOK',imageUrl:'',store:'Meny'}))}));
  for(const c of cases)assert.ok(grid.includes(escape(c.title.toLowerCase())),c.title+' must render');
  const lamb=report.cases.find(c=>c.case==='lamb');
  const picker=renderToStaticMarkup(React.createElement(Picker,{categories:taxonomy,value:lamb.activeClassification,onChange:()=>{}}));
  for(const label of ['Produkttype','Primær ingrediens','Rett','Kosthold','Bruksområde'])assert.ok(picker.includes(label),label);
  assert.ok(picker.includes('value="is_dish"'));assert.ok(picker.includes('value="for_dish"'));
  const offer=c=>({title:c.title,normalizedName:c.title.toLowerCase(),conceptId:c.concept_id,offerOccurrenceId:c.offerOccurrenceId,assignments:c.activeClassification,categoryIds:c.activeClassification.map(a=>a.categoryId),effectiveCategoryIds:[],categories:[],categorySource:c.source,categoryConfidence:null,needsReview:c.needs_review,reviewReason:c.reviewReason||null,manualLock:c.manual_lock,stale:c.stale,store:'Meny',price:39,currency:'NOK'});
  const props=c=>({offer:offer(c),categories:taxonomy,onCategorize:async()=>{},saving:false,allowUpdate:true});
  const manual=renderToStaticMarkup(React.createElement(OfferReviewCard,props(report.cases.find(c=>c.case==='lamb-after-manual-lock'))));
  assert.ok(manual.includes('Manuelt låst'));assert.ok(!manual.includes('<fieldset'),'Editors must remain closed initially');
  const staleProps=props(cases[0]);staleProps.offer.stale=true;staleProps.offer.needsReview=true;staleProps.offer.reviewReason='stale_classification';
  const stale=renderToStaticMarkup(React.createElement(OfferReviewCard,staleProps));assert.ok(stale.includes('Trenger ny AI-vurdering'));assert.ok(stale.includes('stale_classification'));
  const vague=renderToStaticMarkup(React.createElement(OfferReviewCard,props(cases.find(c=>c.case==='generic'))));assert.ok(vague.includes('insufficient_evidence'));
  const output={generatedAt:new Date().toISOString(),method:'Actual Vite SSR-loaded frontend components with fixture props; no interactive browser automation',checks:{twelveOffersRender:true,fiveFacetsRender:true,bothDishRelationsRender:true,manualLockBadge:true,staleBadge:true,reviewReason:true,editorsClosedInitially:true},interactiveBrowserTest:false};
  fs.writeFileSync(path.join(root,'../backend/evaluation-results/unicat-ui-render.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output,null,2));
}finally{await server.close();}
