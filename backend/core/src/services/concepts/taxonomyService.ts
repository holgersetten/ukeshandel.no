import { randomUUID } from 'crypto';
import { getDb } from '../../db/db';
import { getTaxonomy } from '../../db/productConceptRepo';
import type { Facet } from './types';

export function saveTaxonomyCategory(id:string|undefined,body:{name:unknown;parentId:unknown;facet?:unknown;definition?:unknown;assignable?:unknown}) {
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>120)throw new Error('Ugyldig kategorinavn');
  const all=getTaxonomy();const old=all.find(c=>c.id===id);
  if(id&&!old)throw new Error('Ukjent taksonomikategori');
  const facet=(body.facet || old?.facet || 'product_type') as Facet;
  if(!['product_type','ingredient','dish','dietary','usage'].includes(facet))throw new Error('Ugyldig facet');
  const parent=body.parentId as string|null;
  if(parent!==null&&typeof parent!=='string')throw new Error('Ugyldig forelder');
  const key=id||randomUUID();
  if(parent) {
    const p=all.find(c=>c.id===parent);
    if(!p||!p.active||p.facet!==facet)throw new Error('Forelderen må være aktiv og ha samme facet');
    let current:string|null=parent;const seen=new Set<string>();
    while(current){if(current===key||seen.has(current))throw new Error('Syklus i kategorihierarkiet');seen.add(current);current=all.find(c=>c.id===current)?.parentId||null;}
  }
  if(all.some(c=>c.id!==key&&c.active&&c.facet===facet&&c.parentId===parent&&c.name.toLocaleLowerCase('nb-NO')===(body.name as string).trim().toLocaleLowerCase('nb-NO')))throw new Error('Kategorien finnes allerede');
  if(old&&facet!==old.facet)throw new Error('Opprett ny kategori ved endring av facet; eksisterende ID bevarer betydningen');
  const definition=body.definition ?? old?.definition ?? '';
  if(typeof definition!=='string'||definition.length>2000)throw new Error('Ugyldig definisjon');
  const assignable=body.assignable ?? old?.assignable ?? true;
  if(typeof assignable!=='boolean')throw new Error('Ugyldig valgbarhet');
  getDb().prepare(`INSERT INTO taxonomy_categories(id,name,parent_id,facet,definition,assignable) VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id,definition=excluded.definition,assignable=excluded.assignable`)
    .run(key,body.name.trim(),parent,facet,definition,Number(assignable));
  return getTaxonomy().find(c=>c.id===key)!;
}
export function retireTaxonomyCategory(id:string) {
  const all=getTaxonomy();if(!all.some(c=>c.id===id&&c.active))throw new Error('Ukjent aktiv kategori');
  if(all.some(c=>c.parentId===id&&c.active))throw new Error('Flytt eller deaktiver underkategoriene først');
  getDb().transaction(()=>{
    getDb().prepare('UPDATE taxonomy_categories SET active=0 WHERE id=?').run(id);
    getDb().prepare("UPDATE concept_classifications SET needs_review=1,review_reasons_json='[\"retired_category\"]' WHERE concept_id IN (SELECT concept_id FROM concept_categories WHERE category_id=?)").run(id);
  })();
}
