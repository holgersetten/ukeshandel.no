import { useEffect,useState } from 'react';
import axios from 'axios';
import type { Category, Facet } from '../types/offer';
import { facetLabels } from './ConceptCategoryPicker';
import { offersApi } from '../services/api';
import { categoryPath,ancestors } from '../lib/categories';
import { Card,CardHeader,CardTitle,CardContent } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
export function CategoryTree({categories,selected,onChoose}:{categories:Category[];selected:string;onChoose:(id:string)=>void}) {
  const branch=(parentId:string|null):React.ReactNode=>categories.filter(c=>c.parentId===parentId)
    .sort((a,b)=>a.name.localeCompare(b.name,'nb')).map(c=><div key={c.id} className="space-y-1">
      <button className={`block w-full text-left rounded p-2 hover:bg-muted ${selected===c.id?'bg-muted font-semibold':''}`} onClick={()=>onChoose(c.id)}>
        {c.name}{c.facet&&<span className="ml-2 text-xs text-muted-foreground">{facetLabels[c.facet]}</span>}
        {c.active===false?<span className="ml-2 text-xs">Inaktiv · historikk</span>:c.assignable===false&&<span className="ml-2 text-xs">Kun navigasjon</span>}
      </button>
      {categories.some(child=>child.parentId===c.id)&&<div className="ml-4 border-l pl-2 space-y-1">{branch(c.id)}</div>}
    </div>);
  return <>{branch(null)}</>;
}
export default function CategoryManager() {
  const [categories,setCategories]=useState<Category[]>([]);
  const [selected,setSelected]=useState<string>('');
  const [name,setName]=useState('');
  const [parentId,setParentId]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [facet,setFacet]=useState<Facet>('product_type');const [definition,setDefinition]=useState('');const [assignable,setAssignable]=useState(true);
  const concept=categories.some(c=>c.facet);
  const historical=categories.find(c=>c.id===selected)?.active===false;
  const load=async()=>setCategories((await offersApi.getCategories()).categories);
  useEffect(()=>{load().catch(()=>setError('Kunne ikke hente kategorier'));},[]);
  function choose(id:string) {const c=categories.find(c=>c.id===id);setSelected(id);setName(c?.name || '');setParentId(c?.parentId || '');setFacet(c?.facet||'product_type');setDefinition(c?.definition||'');setAssignable(c?.assignable!==false);}
  async function save(remove=false) {
    setBusy(true);setError('');
    try {
      if(remove) await offersApi.deleteCategory(selected);
      else await offersApi.saveCategory({id:selected || undefined,name,parentId:parentId || null,...(concept?{facet,definition,assignable}:{})});
      await load();choose('');
    } catch(e) {setError(axios.isAxiosError(e) ? e.response?.data?.error || e.message : 'Kunne ikke lagre');}
    finally {setBusy(false);}
  }
  return <div className="space-y-4">
    <h1 className="text-2xl font-bold">Kategorier</h1>
    <p className="text-sm text-muted-foreground">{concept?'Én produkttype, valgfri primær ingrediens og flere retts-, kostholds- og brukstags.':'En vare kan ha flere direkte kategorier.'} Foreldre følger automatisk med.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="grid md:grid-cols-2 gap-4">
      <Card><CardHeader><CardTitle>Kategorioversikt</CardTitle></CardHeader><CardContent className="space-y-1">
        <Button variant="outline" onClick={()=>choose('')}>Ny kategori</Button>
        <CategoryTree categories={categories.filter(c=>!concept||c.facet)} selected={selected} onChoose={choose}/>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{selected?'Rediger kategori':'Ny kategori'}</CardTitle></CardHeader><CardContent>
        <form className="space-y-4" onSubmit={e=>{e.preventDefault();void save();}}>
          {historical&&<p className="text-sm text-muted-foreground">Inaktiv kategori. Beholdes for historikk og kan ikke velges ved nye klassifiseringer.</p>}
          <fieldset disabled={historical} className="space-y-4">
          {concept&&<><label className="block">Facet<select className="block border rounded p-2 w-full bg-background" disabled={!!selected} value={facet} onChange={e=>{setFacet(e.target.value as Facet);setParentId('');}}>{Object.entries(facetLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="block">Definisjon<Input value={definition} onChange={e=>setDefinition(e.target.value)} maxLength={2000}/></label><label className="flex gap-2"><input type="checkbox" checked={assignable} onChange={e=>setAssignable(e.target.checked)}/>Kan velges direkte på varer</label></>}
          <label className="block">Navn<Input value={name} onChange={e=>setName(e.target.value)} required maxLength={120}/></label>
          <label className="block">Forelder<select className="block border rounded p-2 w-full bg-background" value={parentId} onChange={e=>setParentId(e.target.value)}>
            <option value="">Ingen (hovedkategori)</option>
            {categories.filter(c=>c.id!==selected && c.active!==false&&(!concept||c.facet===facet)&& !ancestors(c.id,categories).includes(selected)).map(c=><option key={c.id} value={c.id}>{categoryPath(c.id,categories)}</option>)}
          </select></label>
          <Button disabled={busy || !name.trim()} type="submit">Lagre</Button>
          {selected && <Button className="ml-2" variant="destructive" type="button" disabled={busy} onClick={()=>{if(confirm((concept?'Deaktivere':'Slette')+' kategorien? Berørte varer vises til kontroll.')) void save(true);}}>{concept?'Deaktiver':'Slett'}</Button>}
          <p className="text-sm text-muted-foreground">Flytt eller slett underkategorier før du sletter en forelder.</p>
          </fieldset>
        </form>
      </CardContent></Card>
    </div>
  </div>;
}
