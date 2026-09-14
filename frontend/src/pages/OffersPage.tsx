import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbSeparator, BreadcrumbPage, BreadcrumbLink } from '@/components/ui/breadcrumb';
import { OfferGrid } from '@/components/grocery/offer-grid';
import { Search, ChevronRight, Home, ArrowDownUp, Store as StoreIcon } from 'lucide-react';
import { offersApi } from '../services/api';
import { ancestors, categoryPath, offerIdentity } from '../lib/categories';
import type { Offer, Category } from '../types/offer';

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const STORE_LOGOS: Record<string, string> = {
  'Bunnpris': `${API_ORIGIN}/store_logos/bunnpris_logo.png`,
  'Rema 1000': `${API_ORIGIN}/store_logos/rema_kompakt_logo.svg`,
  'Meny': `${API_ORIGIN}/store_logos/meny_kompakt_logo.png`,
  'Spar': `${API_ORIGIN}/store_logos/spar_kompakt_logo.png`,
  'Kiwi': `${API_ORIGIN}/store_logos/kiwi_kompakt_logo.png`,
  'Obs': `${API_ORIGIN}/store_logos/circular/coop_obs_circular_logo.png`,
  'Coop Extra': `${API_ORIGIN}/store_logos/circular/coop_extra_circular_logo.png`,
  'Coop Mega': `${API_ORIGIN}/store_logos/circular/coop_mega_circular_logo.png`,
  'Coop Prix': `${API_ORIGIN}/store_logos/circular/coop_prix_circular_logo.png`,
  'Coop Marked': `${API_ORIGIN}/store_logos/circular/coop_marked_circular_logo.png`,
  'Joker': `${API_ORIGIN}/store_logos/joker_logo.png`,
  'Matkroken': `${API_ORIGIN}/store_logos/circular/matkroken_circular_logo.png`,
};

export default function OffersPage() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryList, setCategories] = useState<Category[]>([]);
  const categories: Record<string,string[]> = Object.fromEntries(categoryList.filter(c=>!c.parentId).map(root=>[root.id,categoryList.filter(c=>ancestors(c.id,categoryList).includes(root.id)).map(c=>c.id)]));
  const categoryLabel = (id:string) => id === 'uncategorized' ? 'Ukategorisert' : categoryList.find(c=>c.id===id)?.name || id;
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderText, setPlaceholderText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [sortByPrice, setSortByPrice] = useState(false);
  const [filterStore, setFilterStore] = useState<string[]>([]);
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [showStoreFilter, setShowStoreFilter] = useState(false);

  const stores = Array.from(new Set(offers.map(o => o.store))).sort();

  const placeholders = [
    'laksefilet',
    'kyllingkjøttdeig',
    'melk',
    'brød',
    'ost',
    'yoghurt',
    'epler',
    'banan',
    'ketchup',
    'pasta'
  ];

  useEffect(() => {
    fetchOffers();
    fetchCategories();
  }, []);

  // Typing animation for placeholder
  useEffect(() => {
    const currentWord = placeholders[placeholderIndex];
    let currentCharIndex = 0;
    
    if (isTyping) {
      const typeInterval = setInterval(() => {
        if (currentCharIndex <= currentWord.length) {
          setPlaceholderText(currentWord.slice(0, currentCharIndex));
          currentCharIndex++;
        } else {
          clearInterval(typeInterval);
          setTimeout(() => setIsTyping(false), 2000);
        }
      }, 150);
      return () => clearInterval(typeInterval);
    } else {
      currentCharIndex = currentWord.length;
      const deleteInterval = setInterval(() => {
        if (currentCharIndex >= 0) {
          setPlaceholderText(currentWord.slice(0, currentCharIndex));
          currentCharIndex--;
        } else {
          clearInterval(deleteInterval);
          setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
          setIsTyping(true);
        }
      }, 75);
      return () => clearInterval(deleteInterval);
    }
  }, [placeholderIndex, isTyping]);

  const getTopOffers = () => {
    let topOffers = offers
      .filter(offer => offer.originalPrice && offer.price)
      .map(offer => ({
        ...offer,
        discountPercent: Math.round(((offer.originalPrice! - offer.price) / offer.originalPrice!) * 100)
      }));

    if (filterStore.length > 0) {
      topOffers = topOffers.filter(offer => filterStore.includes(offer.store));
    }

    topOffers = topOffers.sort((a, b) => b.discountPercent - a.discountPercent);

    if (sortByPrice) {
      topOffers = topOffers.sort((a, b) => a.price - b.price);
    }

    return topOffers.slice(0, 10);
  };

  const fetchOffers = async () => {
    try {
      setLoading(true);
      const data = await offersApi.getAllOffers();
      
      setOffers(data.offers || []);
    } catch (err) {
      console.error('Error fetching offers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await offersApi.getCategories();
      setCategories(data.categories);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const filteredOffers = offers.filter(offer => {
    if(filterStore.length && !filterStore.includes(offer.store)) return false;
    if(searchQuery) {
      const query=searchQuery.toLowerCase();
      return [offer.title,offer.description,offer.store,...offer.categories.map(c=>c.name)].some(text=>text?.toLowerCase().includes(query));
    }
    if(selectedMainCategory==='uncategorized') return !offer.categoryIds.length;
    return !!selectedMainCategory && offer.effectiveCategoryIds.includes(selectedMainCategory) &&
      (selectedSubCategory==='all' || offer.effectiveCategoryIds.includes(selectedSubCategory));
  }).sort((a,b)=>sortByPrice ? a.price-b.price : 0);

  const handleMainCategoryChange = (category: string) => {
    setShowRecommendations(false);
    setShowAllOffers(false);
    setSearchQuery('');
    if (selectedMainCategory === category) {
      setSelectedMainCategory('');
      setSelectedSubCategory('all');
    } else {
      setSelectedMainCategory(category);
      setSelectedSubCategory('all');
    }
  };

  const getCategoriesSorted = () => {
    if (!categories) return [];
    
    const categoryPriority = [
      'Middag',
      'Frukt & grønt',
      'Kjøtt',
      'Kylling og fjærkre',
      'Fisk & skalldyr',
      'Meieri & egg',
      'Brød',
      'Pålegg & frokost',
      'Tilbehør',
      'Drikke',
      'Snacks, godteri & sjokolade',
      'Ost',
      'Dessert og iskrem',
      'Baking',
      'Barneprodukter',
      'Dyr',
      'Personlige artikler',
      'Hus & hjem',
      'Blomster og planter',
      'Ukategorisert'
    ];

    const allCategories = [...Object.keys(categories), 'uncategorized'];
    
    return allCategories.sort((a, b) => {
      const indexA = categoryPriority.indexOf(categoryLabel(a));
      const indexB = categoryPriority.indexOf(categoryLabel(b));
      
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      return categoryLabel(a).localeCompare(categoryLabel(b), 'nb-NO');
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm font-medium">Laster tilbud...</div>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0">
            <Card>
              <CardContent className="p-4">
                {/* Navigasjon */}
                <div className="mb-4">
                  <Link
                    to="/"
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-md transition-all duration-200 cursor-pointer text-foreground hover:bg-muted hover:translate-x-0.5"
                  >
                    <Home className="h-4 w-4" />
                    Hjem
                  </Link>
                </div>

                <Separator className="my-4" />

                {/* Ukens tilbud */}
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Ukens tilbud</h3>
                  <button
                    onClick={() => {
                      setShowRecommendations(true);
                      setShowAllOffers(false);
                      setSelectedMainCategory('');
                      setSelectedSubCategory('all');
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all duration-200 cursor-pointer ${
                      showRecommendations
                        ? 'bg-foreground text-background font-medium shadow-sm'
                        : 'text-foreground hover:bg-muted hover:translate-x-0.5'
                    }`}
                  >
                    Beste tilbud
                  </button>
                  <button
                    onClick={() => {
                      setShowAllOffers(true);
                      setShowRecommendations(false);
                      setSelectedMainCategory('');
                      setSelectedSubCategory('all');
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all duration-200 cursor-pointer mt-1 ${
                      showAllOffers
                        ? 'bg-foreground text-background font-medium shadow-sm'
                        : 'text-foreground hover:bg-muted hover:translate-x-0.5'
                    }`}
                  >
                    Alle tilbud
                  </button>
                </div>

                <Separator className="my-4" />

                {/* Kategorier */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Kategorier</h3>
                  <div className="space-y-1">
                    {getCategoriesSorted().slice(0, showAllCategories ? undefined : 7).map(cat => {
                      const isMainSelected = selectedMainCategory === cat;
                      const subCats = categories?.[cat] || [];
                      return (
                        <div key={cat}>
                          <button
                            onClick={() => handleMainCategoryChange(cat)}
                            className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all duration-200 cursor-pointer ${
                              isMainSelected
                                ? 'bg-foreground text-background font-medium shadow-sm'
                                : 'text-foreground hover:bg-muted hover:translate-x-0.5'
                            }`}
                          >
                            {categoryLabel(cat)}
                          </button>
                          {subCats.length > 0 && (
                            <div className={`ml-4 mt-1 space-y-1 subcategory-container ${
                              isMainSelected ? 'subcategory-expanded' : 'subcategory-collapsed'
                            }`}>
                              {subCats.map(subCat => (
                                <button
                                  key={subCat}
                                  onClick={() => setSelectedSubCategory(subCat)}
                                  className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-all duration-200 cursor-pointer ${
                                    selectedSubCategory === subCat
                                      ? 'bg-muted text-foreground font-medium'
                                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'
                                  }`}
                                >
                                  {categoryPath(subCat,categoryList).split(' → ').slice(1).join(' → ')}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    
                    {getCategoriesSorted().length > 7 && (
                      <button
                        onClick={() => setShowAllCategories(!showAllCategories)}
                        className="w-full text-left px-3 py-2 text-sm rounded-md transition-all duration-200 cursor-pointer mt-2 text-foreground hover:bg-muted hover:translate-x-0.5"
                      >
                        {showAllCategories ? '↑ Vis færre' : '↓ Vis flere...'}
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Breadcrumbs */}
            {(selectedMainCategory || showRecommendations || showAllOffers) && (
              <Breadcrumb className="mb-4">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink 
                      className="flex items-center gap-1 cursor-pointer hover:underline"
                      onClick={() => navigate('/')}
                    >
                      <Home className="h-3.5 w-3.5" />
                      Hjem
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator>
                    <ChevronRight className="h-4 w-4" />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    {selectedMainCategory ? (
                      <BreadcrumbLink 
                        className="cursor-pointer hover:underline"
                        onClick={() => {
                          setSelectedMainCategory('');
                          setSelectedSubCategory('all');
                          setShowRecommendations(false);
                          setShowAllOffers(false);
                        }}
                      >
                        Tilbud
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>
                        {showRecommendations ? 'Beste tilbud' : showAllOffers ? 'Alle tilbud' : 'Tilbud'}
                      </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {selectedMainCategory && (
                    <>
                      <BreadcrumbSeparator>
                        <ChevronRight className="h-4 w-4" />
                      </BreadcrumbSeparator>
                      <BreadcrumbItem>
                        {selectedSubCategory !== 'all' ? (
                          <BreadcrumbLink 
                            className="cursor-pointer hover:underline"
                            onClick={() => {
                              setSelectedSubCategory('all');
                            }}
                          >
                            {categoryLabel(selectedMainCategory)}
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage>{categoryLabel(selectedMainCategory)}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                    </>
                  )}
                  {selectedMainCategory && selectedSubCategory !== 'all' && (
                    <>
                      <BreadcrumbSeparator>
                        <ChevronRight className="h-4 w-4" />
                      </BreadcrumbSeparator>
                      <BreadcrumbItem>
                        <BreadcrumbPage>{categoryLabel(selectedSubCategory)}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            )}

            {/* Search and Filters */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={placeholderText ? `Søk etter ${placeholderText}` : 'Søk etter'}
                  className="pl-10 h-11 placeholder:text-muted-foreground/50"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value) {
                      setSelectedMainCategory('');
                      setSelectedSubCategory('all');
                      setShowRecommendations(false);
                      setShowAllOffers(false);
                    }
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortByPrice(!sortByPrice)}
                  className={`h-8 text-xs gap-1.5 cursor-pointer ${
                    sortByPrice 
                      ? 'bg-zinc-200 hover:bg-zinc-200' 
                      : ''
                  }`}
                >
                  <ArrowDownUp className="h-3.5 w-3.5" />
                  Pris
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowStoreFilter(!showStoreFilter)}
                  className={`h-8 text-xs gap-1.5 cursor-pointer ${
                    filterStore.length > 0 
                      ? 'bg-zinc-200 hover:bg-zinc-200' 
                      : ''
                  }`}
                >
                  <StoreIcon className="h-3.5 w-3.5" />
                  Butikker
                </Button>
              </div>
            </div>

            {/* Butikk-filter */}
            <div 
              className={`transition-all duration-300 ease-in-out ${
                showStoreFilter ? 'max-h-20 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0 pointer-events-none'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setFilterStore([])}  
                  className={`flex items-center justify-center h-12 w-12 rounded-lg border transition-all hover:shadow-md hover:scale-105 cursor-pointer ${
                    filterStore.length === 0
                      ? 'border-primary bg-primary/10 shadow-sm opacity-100'
                      : filterStore.length > 0
                      ? 'border-border bg-background hover:border-primary/50 opacity-40 hover:opacity-70'
                      : 'border-border bg-background hover:border-primary/50 opacity-100'
                  }`}
                  title="Alle butikker"
                >
                  <StoreIcon className="h-6 w-6 text-foreground" />
                </button>
                {stores.map(store => {
                  const isSelected = filterStore.includes(store);
                  const hasSelection = filterStore.length > 0;
                  return (
                    <button
                      key={store}
                      onClick={() => {
                        if (isSelected) {
                          setFilterStore(filterStore.filter(s => s !== store));
                        } else {
                          setFilterStore([...filterStore, store]);
                        }
                      }}
                      className={`flex items-center justify-center h-12 w-12 rounded-lg border transition-all hover:shadow-md hover:scale-105 p-1.5 cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-sm opacity-100'
                          : hasSelection
                          ? 'border-border bg-background hover:border-primary/50 opacity-40 hover:opacity-70'
                          : 'border-border bg-background hover:border-primary/50 opacity-100'
                      }`}
                      title={store}
                    >
                      <img 
                        src={STORE_LOGOS[store]} 
                        alt={store}
                        className="h-full w-full object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator className="my-3" />

            {/* Stats */}
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="secondary" className="text-xs font-medium px-3 py-1.5">
                {showAllOffers ? offers.filter(o => filterStore.length === 0 || filterStore.includes(o.store)).length : filteredOffers.length} tilbud
              </Badge>
            </div>

            {/* Tilbudsgrid */}
            {showRecommendations ? (
              <OfferGrid 
                offers={getTopOffers().map(offer => ({
                  id: offerIdentity(offer),
                  category: offer.categoryIds.map(id=>categoryLabel(id)).join(' · '),
                  title: offer.title,
                  price: offer.price,
                  originalPrice: offer.originalPrice,
                  currency: offer.currency || 'kr',
                  imageUrl: offer.imageUrl || '/placeholder.svg',
                  store: offer.store,
                  storeLogo: STORE_LOGOS[offer.store],
                  validUntil: offer.validTo,
                  description: offer.description,
                  quantity: offer.quantity
                }))} 
              />
            ) : showAllOffers ? (
              <OfferGrid 
                offers={offers
                  .filter(offer => filterStore.length === 0 || filterStore.includes(offer.store))
                  .sort((a, b) => sortByPrice ? a.price - b.price : 0)
                  .map(offer => ({
                    id: offerIdentity(offer),
                  category: offer.categoryIds.map(id=>categoryLabel(id)).join(' · '),
                    title: offer.title,
                    price: offer.price,
                    originalPrice: offer.originalPrice,
                    currency: offer.currency || 'kr',
                    imageUrl: offer.imageUrl || '/placeholder.svg',
                    store: offer.store,
                    storeLogo: STORE_LOGOS[offer.store],
                    validUntil: offer.validTo,
                    description: offer.description,
                    quantity: offer.quantity
                  }))} 
              />
            ) : searchQuery || selectedMainCategory ? (
              <OfferGrid 
                offers={filteredOffers.map(offer => ({
                  id: offerIdentity(offer),
                  category: offer.categoryIds.map(id=>categoryLabel(id)).join(' · '),
                  title: offer.title,
                  price: offer.price,
                  originalPrice: offer.originalPrice,
                  currency: offer.currency || 'kr',
                  imageUrl: offer.imageUrl || '/placeholder.svg',
                  store: offer.store,
                  storeLogo: STORE_LOGOS[offer.store],
                  validUntil: offer.validTo,
                  description: offer.description,
                  quantity: offer.quantity
                }))} 
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Velg en kategori</h3>
                <p className="text-sm text-muted-foreground mt-1">Velg en kategori fra menyen til venstre for å se tilbud</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
