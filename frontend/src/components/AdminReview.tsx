import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { offersApi } from '../services/api';
import type { Offer, Category, Assignment } from '../types/offer';
import ConceptCategoryPicker from './ConceptCategoryPicker';
import ConceptAliasManager from './ConceptAliasManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import CategoryPicker from './CategoryPicker';
import { categoryPath } from '../lib/categories';
import { FolderTree, Play } from 'lucide-react';

function AdminReview() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [conceptMode,setConceptMode]=useState(false);
  const [historicalOffers,setHistoricalOffers]=useState<Offer[]>([]);
  const [showHistory,setShowHistory]=useState(false);
  const [page,setPage]=useState(1);
  const pageSize=24;

  useEffect(() => {
    loadData();
  }, [showHistory]);
  useEffect(()=>setPage(1),[searchQuery,showAllOffers,showHistory]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [reviewData, allData, categoriesData, historical, mode] = await Promise.all([
        offersApi.getOffersNeedingReview(),
        offersApi.getAllOffers(),
        offersApi.getCategories(),
        showHistory?offersApi.getHistoricalReview():Promise.resolve({classifications:[]}), offersApi.getClassificationMode()
      ]);

      setConceptMode(mode.mode==='concept');
      const currentNames = new Set(allData.offers.map(o=>o.conceptId||o.normalizedName));
      const history: Offer[] = historical.classifications.filter(c=>!currentNames.has(c.conceptId||c.normalizedName)).map(c=>({
        ...c.input?.[0],conceptId:c.conceptId,assignments:c.assignments,manualLock:c.manualLock,stale:c.stale,classificationLayer:c.conceptId?'concept':'legacy',
        title:c.input?.[0]?.title||c.normalizedName,normalizedName:c.normalizedName,categoryIds:c.categoryIds,effectiveCategoryIds:[],categories:[],
        categorySource:c.source,categoryConfidence:c.confidence,needsReview:c.needsReview,reviewReason:c.reviewReason,
        store:'Historisk',price:0,currency:'NOK',isActive:false
      }));
      const unique = new Map(reviewData.offers.map(o=>[o.conceptId||o.offerOccurrenceId||o.normalizedName,o]));
      setOffers([...unique.values()]);
      setHistoricalOffers(history);
      setAllOffers(allData.offers || []);
      setCategories(categoriesData.categories);

    } catch (err) {
      setError('Kunne ikke hente data. Er backend-serveren kjørende?');
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!confirm('Dette vil hente nye tilbud og kjøre AI-kategorisering. Kan ta flere minutter. Fortsette?')) {
      return;
    }

    try {
      setUpdating(true);
      const result = await offersApi.updateOffers();
      alert(result.message);
      await loadData();
    } catch (err) {
      alert('Feil ved oppdatering: ' + (err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  const handleRetryAll = async () => {
    if (!confirm('Dette sender alle AI-kategoriseringer som trenger kontroll til et nytt AI-forsøk. Fortsette?')) return;
    try {
      setRetrying(true);
      const result = await offersApi.retryAllClassifications();
      alert(result.message);
      await loadData();
    } catch (err) {
      alert('Feil ved nytt AI-forsøk: ' + (err as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  const handleCategorize = async (
    offer: Offer,
    categoryIds: string[], assignments?:Assignment[]
  ) => {
    try {
      setSaving(offer.normalizedName);
      if(conceptMode) await offersApi.categorizeConcept({conceptId:offer.conceptId,offerOccurrenceId:offer.isActive===false?undefined:offer.offerOccurrenceId,assignments:assignments||[]});
      else await offersApi.categorizeOffer({normalizedName:offer.normalizedName,categoryIds});
      // Last begge lister på nytt slik at delte kategorirettelser vises.
      await loadData();

    } catch (err) {
      alert('Kunne ikke lagre kategorisering');
      console.error('Error categorizing:', err);
      throw err;
    } finally {
      setSaving(null);
    }
  };

  const searching=searchQuery.trim().length>=2;
  const source=showHistory?historicalOffers:(showAllOffers||searching?allOffers:offers);
  const filtered=searching?source.filter(o=>o.title.toLocaleLowerCase('nb-NO').includes(searchQuery.trim().toLocaleLowerCase('nb-NO'))):source;
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,pages);
  const visible=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center py-8 text-base">Laster produkter som trenger kontroll...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center py-8 text-red-600 text-sm">{error}</div>
            <div className="text-center">
              <Button onClick={loadData} className="mt-3" size="sm">
                Prøv igjen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-4">
      {/* Dashboard Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-1">Innhenting og kategorisering</h1>
        <p className="text-sm text-muted-foreground">Hent tilbud, kontroller forslag og rett kategorier.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button onClick={handleUpdate} disabled={updating}>
          <Play className="h-4 w-4 mr-2" />
          {updating ? 'Oppdaterer...' : 'Hent og kategoriser tilbud'}
        </Button>
        <Button variant="outline" onClick={handleRetryAll} disabled={retrying || updating}>
          {retrying ? 'Kategoriserer på nytt...' : 'Kjør «til kontroll» på nytt'}
        </Button>
        <Link to="/kategorier"><Button variant="outline"><FolderTree className="h-4 w-4 mr-2" />Kategorier</Button></Link>
      </div>

      {conceptMode&&<ConceptAliasManager offers={allOffers} onSaved={loadData}/>}
      {/* Admin Review Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Produktkategorisering</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{offers.length} aktuelle produkter trenger kontroll. Eldre klassifiseringer ligger i historikken.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="space-y-3 mb-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Søk etter produkt..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => {setShowHistory(false);setShowAllOffers(!showAllOffers);}}
                variant={showAllOffers ? "default" : "outline"}
              >
                {showAllOffers ? "Vis kontrollkø" : "Vis alle"}
              </Button>
              <Button variant={showHistory?'default':'outline'} onClick={()=>{setShowHistory(!showHistory);setShowAllOffers(false);}}>Historikk</Button>
            </div>

          </div>

          <div>
            <p className="text-sm mb-3">{showHistory?'Historiske klassifiseringer':searching?'Søkeresultater':showAllOffers?'Alle aktuelle tilbud':'Til kontroll'} ({filtered.length})</p>
            {visible.length===0?<p className="py-8 text-muted-foreground">Ingen produkter i denne visningen.</p>:<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {visible.map(offer=><OfferReviewCard key={offer.offerOccurrenceId||offer.conceptId||offer.normalizedName} offer={offer} categories={categories} onCategorize={handleCategorize} saving={saving===offer.normalizedName} allowUpdate={true}/>)}
            </div>}
            {pages>1&&<nav aria-label="Produktsider" className="flex items-center justify-center gap-4 mt-6">
              <Button variant="outline" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Forrige</Button>
              <span className="text-sm">Side {currentPage} av {pages}</span>
              <Button variant="outline" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Neste</Button>
            </nav>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface OfferReviewCardProps {
  offer: Offer;
  categories: Category[];
  onCategorize: (offer: Offer, ids: string[], assignments?:Assignment[]) => Promise<void>;
  saving: boolean;
  allowUpdate: boolean;
}
function OfferReviewCard({offer,categories,onCategorize,saving,allowUpdate}:OfferReviewCardProps) {
  const [ids,setIds]=useState<string[]>(offer.categoryIds);
  const concept=categories.some(c=>c.facet);
  const initialAssignments=()=>offer.assignments?.length?offer.assignments:offer.categoryIds.flatMap(id=>{const c=categories.find(c=>c.id===id);return c?.facet&&c.active!==false&&c.assignable!==false?[{categoryId:id,facet:c.facet,relation:c.facet==='dish'?'is_dish' as const:'' as const}]:[];});
  const [assignments,setAssignments]=useState<Assignment[]>(initialAssignments);
  const [editing,setEditing]=useState(false);
  useEffect(()=>setIds(offer.categoryIds),[offer.categoryIds]);
  useEffect(()=>setAssignments(initialAssignments()),[offer.assignments,offer.categoryIds,categories]);
  async function submit(e:React.FormEvent) {
    e.preventDefault();
    try {await onCategorize(offer,concept?assignments.map(a=>a.categoryId):ids,assignments);setEditing(false);} catch { /* keep the editor open */ }
  }
  return <Card className="hover:shadow-lg transition-shadow">
    <CardHeader className="pb-3">
      {offer.imageUrl && <img loading="lazy" decoding="async" src={offer.imageUrl} alt={offer.title} className="w-full h-48 object-contain rounded mb-3"/>}
      <CardTitle className="text-lg">{offer.title}</CardTitle>
      <p className="text-sm text-muted-foreground">{offer.store} {offer.price>0 ? offer.price+' '+offer.currency : ''}</p>
      {offer.isActive===false && <Badge variant="outline">Historisk kategorisering</Badge>}
      {offer.manualLock&&<Badge variant="outline">Manuelt låst</Badge>}
      {offer.stale&&<Badge variant="outline">Trenger ny AI-vurdering</Badge>}
      {offer.reviewReason && <p className="text-sm text-destructive">{offer.reviewReason}</p>}
      <div className="flex flex-wrap gap-1">{offer.categoryIds.map(id=><Badge key={id} variant="secondary">{categoryPath(id,categories)}</Badge>)}</div>
    </CardHeader>
    <CardContent>
      {editing ? <form className="space-y-3" onSubmit={submit}>
        {concept?<ConceptCategoryPicker categories={categories} value={assignments} onChange={setAssignments} disabled={saving}/>:<CategoryPicker categories={categories} value={ids} onChange={setIds} disabled={saving}/>}
        <p className="text-xs text-muted-foreground">{concept?'Rettelsen låser dette konseptet og gjelder godkjente aliaser.':'Rettelsen gjelder samme normaliserte varenavn i alle butikker.'}</p>
        <Button type="submit" disabled={saving || (concept?assignments.filter(a=>a.facet==='product_type').length!==1:ids.length<1||ids.length>3)}>{saving?'Lagrer...':'Lagre kategorier'}</Button>
        {allowUpdate && <Button type="button" variant="outline" className="ml-2" onClick={()=>{setIds(offer.categoryIds);setEditing(false);}}>Avbryt</Button>}
      </form> : <Button variant="outline" onClick={()=>setEditing(true)}>Endre kategorisering</Button>}
    </CardContent>
  </Card>;
}
export default AdminReview;
