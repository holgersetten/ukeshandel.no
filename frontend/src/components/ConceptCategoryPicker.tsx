import type { Category, Assignment, Facet } from '../types/offer';
import { categoryPath } from '../lib/categories';
export const facetLabels:Record<Facet,string>={product_type:'Produkttype',ingredient:'Primær ingrediens',dish:'Rett',dietary:'Kosthold',usage:'Bruksområde'};
export default function ConceptCategoryPicker({categories,value,onChange,disabled}:{categories:Category[];value:Assignment[];onChange:(value:Assignment[])=>void;disabled?:boolean}) {
  return <div className="space-y-3">{(Object.keys(facetLabels) as Facet[]).map(facet=><fieldset key={facet} disabled={disabled} className="space-y-1">
    <legend className="font-medium">{facetLabels[facet]}</legend>
    <select className="w-full border rounded p-2 bg-background" value="" onChange={e=>{const id=e.target.value;if(!id)return;const next=value.filter(a=>a.categoryId!==id && (!(facet==='product_type'||facet==='ingredient')||a.facet!==facet));onChange([...next,{categoryId:id,facet,relation:facet==='dish'?'is_dish':''}]);}}>
      <option value="">{facet==='product_type'?'Velg én produkttype':'Legg til (valgfritt)'}</option>
      {categories.filter(c=>c.facet===facet&&c.assignable!==false&&c.active!==false).sort((a,b)=>categoryPath(a.id,categories).localeCompare(categoryPath(b.id,categories),'nb')).map(c=><option key={c.id} value={c.id}>{categoryPath(c.id,categories)}</option>)}
    </select>
    {value.filter(a=>a.facet===facet).map(a=><div key={a.categoryId} className="flex gap-2 items-center text-sm"><span className="flex-1">{categoryPath(a.categoryId,categories)}</span>{facet==='dish'&&<select className="border rounded p-1 bg-background" value={a.relation} onChange={e=>onChange(value.map(v=>v.categoryId===a.categoryId?{...v,relation:e.target.value as Assignment['relation']}:v))}><option value="is_dish">Er retten</option><option value="for_dish">Til retten</option></select>}<button type="button" className="underline" onClick={()=>onChange(value.filter(v=>v.categoryId!==a.categoryId))}>Fjern</button></div>)}
  </fieldset>)}</div>;
}
