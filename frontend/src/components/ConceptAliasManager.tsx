import { useEffect,useState } from 'react';
import type { Offer } from '../types/offer';
import { offersApi } from '../services/api';
import { Button } from './ui/button';
export default function ConceptAliasManager({offers,onSaved}:{offers:Offer[];onSaved:()=>Promise<void>}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof offersApi.getConcepts>>|null>(null);
  const [open,setOpen]=useState(false);
  const [occurrence,setOccurrence]=useState('');const [target,setTarget]=useState('');const [global,setGlobal]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const load=()=>offersApi.getConcepts().then(setData);
  useEffect(()=>{if(open)void load().catch(()=>setError('Kunne ikke hente konsepter'));},[open]);
  async function save(){setBusy(true);setError('');try{await offersApi.linkOffer({offerOccurrenceId:occurrence,conceptId:target,approveGlobal:global});await load();await onSaved();}catch(e){setError(e instanceof Error?e.message:'Kunne ikke koble alias');}finally{setBusy(false);}}
  return <details onToggle={e=>setOpen(e.currentTarget.open)} className="border rounded p-4 mb-4"><summary className="cursor-pointer font-medium">Koble titler til samme produktkonsept</summary>{open&&<><p className="text-sm my-3">Velg en konkret vare og konseptet den skal dele klassifisering med. Koblingen krever din vurdering.</p>
    <div className="space-y-3"><select className="w-full border rounded p-2 bg-background" value={occurrence} onChange={e=>setOccurrence(e.target.value)}><option value="">Velg tilbudsforekomst</option>{offers.filter(o=>o.offerOccurrenceId).map(o=><option key={o.offerOccurrenceId} value={o.offerOccurrenceId}>{o.title} — {o.store}</option>)}</select>
    <select className="w-full border rounded p-2 bg-background" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Velg eksisterende konsept</option>{data?.concepts.map(c=><option key={c.id} value={c.id}>{c.canonicalName} ({c.id.slice(-8)})</option>)}</select>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={global} onChange={e=>setGlobal(e.target.checked)}/>Godkjenn også eksakt tittel som alias for fremtidige tilbud</label>
    {error&&<p role="alert" className="text-destructive">{error}</p>}<Button disabled={busy||!target||!occurrence} onClick={()=>void save()}>Godkjenn kobling</Button>
    <details><summary>Godkjente globale aliaser</summary>{data?.aliases.filter(a=>a.status==='approved'&&a.scopeKey==='global').map(a=><div key={a.id} className="flex justify-between text-sm py-1"><span>{a.normalizedTitle}</span><button className="underline" onClick={()=>void offersApi.revokeAlias(a.id).then(load).then(onSaved).catch(()=>setError('Kunne ikke trekke tilbake alias'))}>Trekk tilbake</button></div>)}</details>
    </div></>}</details>;
}
