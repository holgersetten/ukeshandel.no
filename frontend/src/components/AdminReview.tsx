import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { offersApi } from '../services/api';
import type { Offer, CategoryHierarchy } from '../types/offer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FolderTree, RefreshCw, Play } from 'lucide-react';

interface HealthMetrics {
  lastUpdate: {
    timestamp: string;
    duration: number;
    durationFormatted: string;
    success: boolean;
  } | null;
  currentState: {
    totalOffers: number;
    totalProductKeys: number;
    offersPerStore: Record<string, number>;
    cacheHitRate: number;
    pendingRate: number;
    totalCached: number;
    trustedCount: number;
    pendingCount: number;
  };
  errors: Record<string, string>;
  history: any[];
}

function AdminReview() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [categories, setCategories] = useState<CategoryHierarchy>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetrics | null>(null);
  const [updating, setUpdating] = useState(false);

  const handleStoreToggle = (store: string) => {
    setSelectedStores(current => current.includes(store)
      ? current.filter(selected => selected !== store)
      : [...current, store]);
  };

  useEffect(() => {
    loadData();
    loadHealthMetrics();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [reviewData, allData, categoriesData] = await Promise.all([
        offersApi.getOffersNeedingReview(),
        offersApi.getAllOffers(),
        offersApi.getCategories()
      ]);

      setOffers(reviewData.offers || []);
      setAllOffers(allData.offers || []);
      setCategories(categoriesData.categories);

    } catch (err) {
      setError('Kunne ikke hente data. Er backend-serveren kjørende?');
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHealthMetrics = async () => {
    try {
      const metrics = await offersApi.getHealthMetrics();
      setHealthMetrics(metrics);
    } catch (err) {
      console.error('Error loading health metrics:', err);
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
      await loadHealthMetrics();
    } catch (err) {
      alert('Feil ved oppdatering: ' + (err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  const handleCategorize = async (
    offer: Offer,
    mainCategory: string,
    subCategory: string,
    ingredientKey: string
  ) => {
    if (!offer.productKey) {
      alert('Produktet mangler productKey');
      return;
    }

    try {
      setSaving(offer.productKey);

      await offersApi.categorizeOffer({
        productKey: offer.productKey,
        mainCategory,
        subCategory,
        ingredientKey
      });

      // Last begge lister på nytt slik at delte kategorirettelser vises.
      await loadData();
      await loadHealthMetrics();

    } catch (err) {
      alert('Kunne ikke lagre kategorisering');
      console.error('Error categorizing:', err);
    } finally {
      setSaving(null);
    }
  };

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

      {/* Health Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {healthMetrics ? (
          <>
            {/* Last Update Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Sist Oppdatert</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {healthMetrics.lastUpdate
                    ? new Date(healthMetrics.lastUpdate.timestamp).toLocaleString('no-NO', { dateStyle: 'short', timeStyle: 'short' })
                    : '-'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {healthMetrics.lastUpdate?.durationFormatted || '-'}
                  {healthMetrics.lastUpdate?.success ? ' ✓' : ' ✗'}
                </p>
              </CardContent>
            </Card>

            {/* Total Offers Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Lagrede tilbud</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{healthMetrics.currentState.totalOffers}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {healthMetrics.currentState.totalProductKeys || 0} unike produkter
                </p>
              </CardContent>
            </Card>

            {/* Høy AI-sikkerhet / manuell Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Høy AI-sikkerhet / manuell</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{healthMetrics.currentState.cacheHitRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {healthMetrics.currentState.trustedCount} med høy sikkerhet / manuelt rettet
                </p>
              </CardContent>
            </Card>

            {/* Trenger kontroll i cache Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Trenger kontroll i cache</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{healthMetrics.currentState.pendingRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {healthMetrics.currentState.pendingCount} produkter
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="col-span-full text-center py-8 text-sm text-muted-foreground">Laster status...</div>
        )}
      </div>

      {/* Store Overview & Handlinger */}
      {healthMetrics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          {/* Store Breakdown */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Tilbud per Butikk</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {Object.entries(healthMetrics.currentState.offersPerStore)
                  .sort(([, a], [, b]) => b - a)
                  .map(([store, count]) => (
                    <div key={store} className="text-center p-2 border rounded-md">
                      <div className="text-xs text-muted-foreground truncate">{store}</div>
                      <div className="text-lg font-bold">{count}</div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Handlinger & Errors */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Handlinger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                onClick={handleUpdate}
                disabled={updating}
                variant="outline"
                className="w-full justify-start"
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                {updating ? 'Oppdaterer...' : 'Hent og kategoriser tilbud'}
              </Button>
              <Button
                onClick={loadHealthMetrics}
                variant="outline"
                className="w-full justify-start"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Oppdater status
              </Button>

              <Separator className="my-2" />

              <Link to="/kategorier" className="block">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                >
                  <FolderTree className="h-4 w-4 mr-2" />
                  Rediger Kategorier
                </Button>
              </Link>

              {Object.keys(healthMetrics.errors).length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <h4 className="text-xs font-medium text-destructive mb-2">Feil</h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {Object.entries(healthMetrics.errors).map(([store, error]) => (
                      <div key={store}>
                        <span className="font-medium">{store}:</span> {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Separator className="my-4" />

      {/* Admin Review Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Produktkategorisering</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{offers.length} produkter trenger kontroll</p>
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
                onClick={() => setShowAllOffers(!showAllOffers)}
                variant={showAllOffers ? "default" : "outline"}
              >
                {showAllOffers ? "Vis kontrollkø" : "Vis alle"}
              </Button>
            </div>

            {/* Store Filter */}
            <div>
              <Label className="text-xs mb-2 block">Filtrer på butikk</Label>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set(allOffers.map(o => o.store).filter(Boolean))).sort().map(store => {
                  const isSelected = selectedStores.includes(store);
                  const storeLogos: Record<string, string> = {
                    'Bunnpris': 'http://localhost:5000/store_logos/bunnpris_logo.png',
                    'Rema 1000': 'http://localhost:5000/store_logos/rema_kompakt_logo.svg',
                    'Meny': 'http://localhost:5000/store_logos/meny_kompakt_logo.png',
                    'Spar': 'http://localhost:5000/store_logos/spar_kompakt_logo.png',
                    'Kiwi': 'http://localhost:5000/store_logos/kiwi_kompakt_logo.png',
                    'Obs': 'http://localhost:5000/store_logos/circular/coop_obs_circular_logo.png',
                    'Coop Extra': 'http://localhost:5000/store_logos/circular/coop_extra_circular_logo.png',
                    'Coop Mega': 'http://localhost:5000/store_logos/circular/coop_mega_circular_logo.png',
                    'Coop Prix': 'http://localhost:5000/store_logos/circular/coop_prix_circular_logo.png',
                    'Coop Marked': 'http://localhost:5000/store_logos/circular/coop_marked_circular_logo.png',
                    'Joker': 'http://localhost:5000/store_logos/joker_logo.png',
                    'Matkroken': 'http://localhost:5000/store_logos/circular/matkroken_circular_logo.png',
                  };
                  return (
                    <button
                      key={store}
                      onClick={() => handleStoreToggle(store)}
                      className={`h-8 w-8 rounded border-2 transition-all p-0.5 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                      title={store}
                    >
                      <img
                        src={storeLogos[store]}
                        alt={store}
                        className="w-full h-full object-contain"
                      />
                    </button>
                  );
                })}
                {selectedStores.length > 0 && (
                  <Button
                    onClick={() => setSelectedStores([])}
                    variant="ghost"
                    size="sm"
                  >
                    Fjern filter
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Offers Display */}
          <div>
            {showAllOffers && searchQuery.length < 2 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-3">
                  Alle tilbud ({allOffers.filter(o => selectedStores.length === 0 || selectedStores.includes(o.store)).length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {allOffers
                    .filter(o => selectedStores.length === 0 || selectedStores.includes(o.store))
                    .map((offer, idx) => (
                      <OfferReviewCard
                        key={`${offer.offerId || offer.hotspotId || offer.productKey}-${idx}`}
                        offer={offer}
                        categories={categories}
                        onCategorize={handleCategorize}
                        saving={saving === offer.productKey}
                        allowUpdate={true}
                      />
                    ))}
                </div>
              </div>
            )}

            {searchQuery.length >= 2 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-3">
                  Søkeresultater ({
                    allOffers
                      .filter(o => o.title?.toLowerCase().includes(searchQuery.toLowerCase()))
                      .filter(o => selectedStores.length === 0 || selectedStores.includes(o.store))
                      .length
                  })
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {allOffers
                    .filter(o => o.title?.toLowerCase().includes(searchQuery.toLowerCase()))
                    .filter(o => selectedStores.length === 0 || selectedStores.includes(o.store))
                    .map((offer, idx) => (
                      <OfferReviewCard
                        key={`${offer.offerId || offer.hotspotId || offer.productKey}-${idx}`}
                        offer={offer}
                        categories={categories}
                        onCategorize={handleCategorize}
                        saving={saving === offer.productKey}
                        allowUpdate={true}
                      />
                    ))}
                </div>
              </div>
            )}

            {offers.length === 0 && searchQuery.length < 2 && !showAllOffers ? (
              <div className="text-center py-12">
                <p className="text-lg font-medium mb-2">Ingen tilbud i kontrollkøen</p>
                <p className="text-sm text-muted-foreground">Bruk søk for å rette feil-kategoriseringer</p>
              </div>
            ) : offers.length > 0 && searchQuery.length < 2 && !showAllOffers ? (
              <>
                <h3 className="text-sm font-medium mb-3">
                  Til kontroll ({offers.filter(o => selectedStores.length === 0 || selectedStores.includes(o.store)).length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {offers
                    .filter(o => selectedStores.length === 0 || selectedStores.includes(o.store))
                    .map((offer, idx) => (
                      <OfferReviewCard
                        key={`${offer.offerId || offer.hotspotId || offer.productKey}-${idx}`}
                        offer={offer}
                        categories={categories}
                        onCategorize={handleCategorize}
                        saving={saving === offer.productKey}
                        allowUpdate={false}
                      />
                    ))}
                </div>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface OfferReviewCardProps {
  offer: Offer;
  categories: CategoryHierarchy;
  onCategorize: (offer: Offer, main: string, sub: string, key: string) => void;
  saving: boolean;
  allowUpdate: boolean;
}

function OfferReviewCard({ offer, categories, onCategorize, saving, allowUpdate }: OfferReviewCardProps) {
  // Pre-fyll med AI-forslag hvis de finnes
  const [mainCategory, setMainCategory] = useState(offer.mainCategory || '');
  const [subCategory, setSubCategory] = useState(offer.subCategory || '');
  const [ingredientKey, setIngredientKey] = useState(offer.ingredientKey || '');

  const subCategories = mainCategory ? categories[mainCategory] || [] : [];
  const [isEditing, setIsEditing] = useState(!allowUpdate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!mainCategory || !subCategory || !ingredientKey.trim()) {
      alert('Vennligst fyll ut alle felt');
      return;
    }

    onCategorize(offer, mainCategory, subCategory, ingredientKey.toLowerCase().trim());
    setIsEditing(false);
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        {offer.imageUrl && (
          <img
            src={offer.imageUrl}
            alt={offer.title}
            className="w-full h-48 object-cover rounded mb-3"
          />
        )}
        <div className="flex items-center gap-2 mb-2">
          <CardTitle className="text-lg flex-1">{offer.title}</CardTitle>
          {offer.isActive === false && (
            <Badge variant="destructive" className="text-xs">
              Utgått tilbud
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-muted-foreground">{offer.store}</p>
          {offer.price > 0 ? (
            <Badge variant="secondary" className="text-base font-bold">{offer.price} {offer.currency}</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Pris ikke tilgjengelig</Badge>
          )}
        </div>
        {offer.categoryConfidence !== undefined && (
          <Badge variant="outline" className="mt-2 text-xs">
            AI: {(offer.categoryConfidence * 100).toFixed(0)}%
          </Badge>
        )}
        {allowUpdate && offer.mainCategory && offer.subCategory && (
          <div className="mt-2 space-y-1">
            <Badge variant="default" className="text-xs">
              {offer.mainCategory} → {offer.subCategory}
            </Badge>
            {offer.ingredientKey && (
              <Badge variant="outline" className="text-xs ml-2">
                🔑 {offer.ingredientKey}
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>

      {!isEditing && allowUpdate ? (
        <div className="space-y-2">
          <Button
            onClick={() => setIsEditing(true)}
            className="w-full"
            variant="outline"
          >
            ✏️ Endre kategorisering
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`mainCategory-${offer.productKey}`}>Hovedkategori</Label>
            <select
              id={`mainCategory-${offer.productKey}`}
              value={mainCategory}
              onChange={(e) => {
                setMainCategory(e.target.value);
                setSubCategory(''); // Reset subCategory når main endres
              }}
              disabled={saving}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Velg kategori...</option>
              {Object.keys(categories).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`subCategory-${offer.productKey}`}>Underkategori</Label>
            <select
              id={`subCategory-${offer.productKey}`}
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              disabled={!mainCategory || saving}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Velg underkategori...</option>
              {subCategories.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`ingredientKey-${offer.productKey}`}>Ingrediens-nøkkel</Label>
            <Input
              id={`ingredientKey-${offer.productKey}`}
              type="text"
              value={ingredientKey}
              onChange={(e) => setIngredientKey(e.target.value)}
              placeholder="f.eks. 'melk', 'agurk', 'pasta'"
              disabled={saving}
              required
            />
            <small className="text-xs text-muted-foreground">Brukes til å gruppere og filtrere produkter</small>
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={saving || !mainCategory || !subCategory || !ingredientKey.trim()}
            >
              {saving ? 'Lagrer...' : '✅ Lagre'}
            </Button>
            {allowUpdate && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMainCategory(offer.mainCategory || '');
                  setSubCategory(offer.subCategory || '');
                  setIngredientKey(offer.ingredientKey || '');
                  setIsEditing(false);
                }}
                disabled={saving}
              >
                Avbryt
              </Button>
            )}
          </div>
        </form>
      )}
      </CardContent>
    </Card>
  );
}

export default AdminReview;
