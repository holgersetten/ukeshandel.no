import * as repo from '../../db/productConceptRepo';
import * as ai from './conceptAI';
import { originalInput, classificationInputHash } from '../../utils/offerOccurrence';
import { normalizeTitle } from '../../utils/normalizeTitle';
import type { ProductInput, Assignment } from './types';
import { MODEL } from './config';

export function contextConflict(input:ProductInput[],known:ProductInput[]):boolean {
  const brands=new Set([...input,...known].map(o=>normalizeTitle(o.brand || '')).filter(Boolean));
  return brands.size>1;
}

class ConceptService {
  private running:Promise<void>|null=null;
  read(offer:ProductInput) {
    const input=originalInput(offer); const conceptId=repo.findConcept(input);
    if (!conceptId) return null;
    const entry=repo.getClassification(conceptId);
    const categories=repo.getTaxonomy(); const byId=new Map(categories.map(c=>[c.id,c]));
    const ids=entry?.assignments.map(a=>a.categoryId) || []; const inherited=new Set<string>();
    for(const id of ids) {let current:string|null=id;const visited=new Set<string>();while(current){if(visited.has(current))throw new Error('Taksonomisyklus');visited.add(current);inherited.add(current);current=byId.get(current)?.parentId || null;}}
    const reasons=[...(entry?.reviewReasons || [])];
    if (entry && contextConflict([input],entry.input)) reasons.push('alias_context_conflict');
    if (entry?.assignments.some(a=>!byId.get(a.categoryId)?.active)) reasons.push('retired_category');
    const stale=entry ? repo.isStale(entry) : true;
    return {conceptId,offerOccurrenceId:input.offerOccurrenceId,normalizedName:normalizeTitle(offer.title),
      categoryIds:ids,effectiveCategoryIds:[...inherited],categories:categories.filter(c=>inherited.has(c.id)),
      assignments:entry?.assignments || [],categorySource:entry?.source || 'unknown',categoryConfidence:entry?.confidence ?? null,
      needsReview:!entry || entry.needsReview || stale || !!reasons.length,reviewReason:reasons.join(', ') || (stale?'stale_classification':null),
      stale,manualLock:entry?.manualLock || false,promptVersion:entry?.promptVersion || null,taxonomyVersion:entry?.taxonomyVersion || null,model:entry?.model || null,
      usable:!!entry && ids.length>0 && !reasons.includes('alias_context_conflict') && !entry.reviewReasons.includes('legacy_taxonomy_conflict')};
  }
  async categorize(offers:ProductInput[]) {
    while(this.running)await this.running;
    this.running=this.run(offers);
    try {await this.running;} finally {this.running=null;}
  }
  private async run(offers:ProductInput[]) {
    const tasks=new Map<string,ProductInput[]>();
    for(const offer of offers) {
      let input:ProductInput;try{input=originalInput(offer);}catch{continue;}
      const id=repo.ensureConcept(input);const list=tasks.get(id)||[];
      if(!list.some(o=>o.offerOccurrenceId===input.offerOccurrenceId))list.push(input);
      tasks.set(id,list);
    }
    if((process.env.SKIP_AI || '').toLowerCase()==='true' || !process.env.OPENAI_API_KEY)return;
    const pending=[...tasks].filter(([id,input])=>{const entry=repo.getClassification(id);return !entry?.manualLock && (!entry || repo.isStale(entry,input));});
    for(let i=0;i<pending.length;i+=10) {
      const batch=pending.slice(i,i+10).map(([conceptId,input])=>({conceptId,input}));
      await this.classifyBatch(batch);
    }
  }
  async classifyBatch(tasks:ai.AITask[]) {
    const taxonomy=repo.getTaxonomy();
    const versions={promptVersion:repo.promptVersion(),taxonomyVersion:repo.taxonomyVersion(),model:MODEL()};
    const textResults=await ai.requestConceptAI(tasks,taxonomy);
    for(const task of tasks) {
      if(repo.getClassification(task.conceptId)?.manualLock)continue;
      let result=textResults.get(task.conceptId);let usedImage=false;const reasons:string[]=[];
      if(tasks.length>1 && (!result || (!result.insufficientEvidence && ai.qualityReasons(result,task.input,taxonomy,false).length))) {
        // One bounded, isolated retry for incomplete batch output. Keep the full original input.
        try {result=(await ai.requestConceptAI([task],taxonomy)).get(task.conceptId);}catch {reasons.push('isolated_retry_failed');}
      }
      if(result?.insufficientEvidence || (!result && ai.textNeedsImage(task.input,taxonomy))) {
        if(task.input.some(o=>o.imageUrl && /^https?:\/\//i.test(o.imageUrl))) {
          try {result=(await ai.requestConceptAI([task],taxonomy,true)).get(task.conceptId);usedImage=true;}
          catch {reasons.push('image_unavailable_or_failed');}
        } else reasons.push('missing_image_for_ambiguous_text');
      }
      if(!result)reasons.push('invalid_or_missing_ai_result');
      if(result)reasons.push(...ai.qualityReasons(result,task.input,taxonomy,usedImage));
      const previous=repo.getClassification(task.conceptId);
      if(previous && contextConflict(task.input,previous.input))reasons.push('alias_context_conflict');
      repo.saveClassification(task.conceptId,result?.assignments || [],task.input,'ai',result?.confidence ?? null,reasons,versions);
    }
  }
  async retry(conceptId:string) {
    while(this.running)await this.running;
    const entry=repo.getClassification(conceptId);
    if(!entry)throw new Error('Ukjent klassifisering');
    if(entry.manualLock)throw new Error('Manuell klassifisering er låst');
    if(!entry.input.length)throw new Error('Original produktinformasjon mangler. Tilfør grunnlag før retry.');
    if((process.env.SKIP_AI || '').toLowerCase()==='true' || !process.env.OPENAI_API_KEY)throw new Error('AI-kategorisering er ikke konfigurert');
    this.running=this.classifyBatch([{conceptId,input:entry.input}]);
    try {await this.running;}finally{this.running=null;}
  }
  async retryAll() {
    const candidates=repo.allClassifications().filter(c=>!c.manualLock && c.input.length && (c.needsReview||repo.isStale(c)));
    for(const c of candidates)await this.retry(c.conceptId);
    return candidates.length;
  }
  manual(conceptId:string,assignments:Assignment[],input?:ProductInput[]) {return repo.setManual(conceptId,assignments,input);}
  getPendingCount(){return repo.allClassifications().filter(c=>c.needsReview||repo.isStale(c)).length;}
  inputHash(input:ProductInput[]){return classificationInputHash(input);}
}
export default new ConceptService();
