import { useState } from 'react';
import type { Category } from '../types/offer';
import { categoryPath, ancestors } from '../lib/categories';
import { Input } from './ui/input';
export default function CategoryPicker({categories,value,onChange,disabled=false}:{categories:Category[];value:string[];onChange:(ids:string[])=>void;disabled?:boolean}) {
  const [search,setSearch]=useState('');
  function toggle(id:string) {
    if(value.includes(id)) return onChange(value.filter(v=>v!==id));
    // Selecting a descendant replaces a selected ancestor. Ancestors cannot be selected redundantly.
    const next=value.filter(v=>!ancestors(id,categories).includes(v));
    if(next.length<3 && !value.some(v=>ancestors(v,categories).includes(id))) onChange([...next,id]);
  }
  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="text-sm font-medium">Velg 1–3 kategorier</legend>
    <Input aria-label="Søk i kategorier" placeholder="Søk i kategorier..." value={search} onChange={e=>setSearch(e.target.value)}/>
    <div className="max-h-48 overflow-auto border rounded p-2 space-y-1">
      {categories.filter(c=>!c.parentId).flatMap(parent => [
        <label key={parent.id} className="pt-1 flex gap-2 text-sm items-start font-medium">
          <input type="checkbox" checked={value.includes(parent.id)} onChange={()=>toggle(parent.id)} disabled={!value.includes(parent.id) && (value.some(v=>ancestors(v,categories).includes(parent.id)) || (value.length>=3 && !value.some(v=>ancestors(parent.id,categories).includes(v))))}/>
          {parent.name}
        </label>,
        ...categories.filter(c=>c.parentId===parent.id && categoryPath(c.id,categories).toLowerCase().includes(search.toLowerCase())).map(c=><label key={c.id} className="ml-4 flex gap-2 text-sm items-start">
          <input type="checkbox" checked={value.includes(c.id)} onChange={()=>toggle(c.id)} disabled={!value.includes(c.id) && (value.some(v=>ancestors(v,categories).includes(c.id)) || (value.length>=3 && !value.some(v=>ancestors(c.id,categories).includes(v))))}/>
          {c.name}
        </label>)
      ])}
    </div>
    <p className="text-xs text-muted-foreground">Foreldre arves automatisk. {value.length} direkte kategorier valgt.</p>
  </fieldset>;
}
