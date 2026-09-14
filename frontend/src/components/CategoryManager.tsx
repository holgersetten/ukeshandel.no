import { useEffect,useState } from 'react';
import axios from 'axios';
import type { Category } from '../types/offer';
import { offersApi } from '../services/api';
import { categoryPath,ancestors } from '../lib/categories';
import { Card,CardHeader,CardTitle,CardContent } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
export default function CategoryManager() {
  const [categories,setCategories]=useState<Category[]>([]);
  const [selected,setSelected]=useState<string>('');
  const [name,setName]=useState('');
  const [parentId,setParentId]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const load=async()=>setCategories((await offersApi.getCategories()).categories);
  useEffect(()=>{load().catch(()=>setError('Kunne ikke hente kategorier'));},[]);
  function choose(id:string) {const c=categories.find(c=>c.id===id);setSelected(id);setName(c?.name || '');setParentId(c?.parentId || '');}
  async function save(remove=false) {
    setBusy(true);setError('');
    try {
      if(remove) await offersApi.deleteCategory(selected);
      else await offersApi.saveCategory({id:selected || undefined,name,parentId:parentId || null});
      await load();choose('');
    } catch(e) {setError(axios.isAxiosError(e) ? e.response?.data?.error || e.message : 'Kunne ikke lagre');}
    finally {setBusy(false);}
  }
  return <div className="space-y-4">
    <h1 className="text-2xl font-bold">Kategorier</h1>
    <p className="text-sm text-muted-foreground">En vare kan ha flere direkte kategorier. Foreldre følger automatisk med.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="grid md:grid-cols-2 gap-4">
      <Card><CardHeader><CardTitle>Kategorioversikt</CardTitle></CardHeader><CardContent className="space-y-1">
        <Button variant="outline" onClick={()=>choose('')}>Ny kategori</Button>
        {categories.filter(c => !c.parentId).sort((a,b)=>a.name.localeCompare(b.name,'nb')).map(parent => <div key={parent.id} className="space-y-1">
          <button className={`block w-full text-left rounded p-2 hover:bg-muted font-semibold ${selected===parent.id?'bg-muted':''}`} onClick={()=>choose(parent.id)}>{parent.name}</button>
          <div className="ml-4 border-l pl-2 space-y-1">
            {categories.filter(c => c.parentId === parent.id).sort((a,b)=>a.name.localeCompare(b.name,'nb')).map(child => <button key={child.id} className={`block w-full text-left rounded p-1.5 text-sm hover:bg-muted ${selected===child.id?'bg-muted font-semibold':''}`} onClick={()=>choose(child.id)}>↳ {child.name}</button>)}
          </div>
        </div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{selected?'Rediger kategori':'Ny kategori'}</CardTitle></CardHeader><CardContent>
        <form className="space-y-4" onSubmit={e=>{e.preventDefault();void save();}}>
          <label className="block">Navn<Input value={name} onChange={e=>setName(e.target.value)} required maxLength={120}/></label>
          <label className="block">Forelder<select className="block border rounded p-2 w-full bg-background" value={parentId} onChange={e=>setParentId(e.target.value)}>
            <option value="">Ingen (hovedkategori)</option>
            {categories.filter(c=>c.id!==selected && !ancestors(c.id,categories).includes(selected)).map(c=><option key={c.id} value={c.id}>{categoryPath(c.id,categories)}</option>)}
          </select></label>
          <Button disabled={busy || !name.trim()} type="submit">Lagre</Button>
          {selected && <Button className="ml-2" variant="destructive" type="button" disabled={busy} onClick={()=>{if(confirm('Slette kategorien? Berørte varer merkes for kontroll.')) void save(true);}}>Slett</Button>}
          <p className="text-sm text-muted-foreground">Flytt eller slett underkategorier før du sletter en forelder.</p>
        </form>
      </CardContent></Card>
    </div>
  </div>;
}
