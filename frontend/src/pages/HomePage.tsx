import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Tags } from 'lucide-react';
import { useState, useEffect } from 'react';
import { offersApi } from '@/services/api';

export default function HomePage() {
  const [totalOffers, setTotalOffers] = useState<number | null>(null);
  const [storeCount, setStoreCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await offersApi.getAllOffers();
        const offers = response.offers || [];
        setTotalOffers(offers.length);
        
        // Count unique stores
        const uniqueStores = new Set(offers.map((offer) => offer.store));
        setStoreCount(uniqueStores.size);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tight text-foreground mb-4">
            Ukens dagligvaretilbud
          </h1>
          <p className="text-xl text-muted-foreground">
            Finn tilbud fra dagligvarebutikkene
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 gap-6 mb-12">
          <Link to="/tilbud" className="cursor-pointer">
            <Card className="h-full hover:shadow-lg transition-shadow group">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                    <ShoppingCart className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Tilbud</CardTitle>
                </div>
                <CardDescription className="text-base">
                  Bla gjennom alle tilbud fra Kiwi, Meny, Rema 1000, Spar, Bunnpris, og alle Coop-butikkene
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors cursor-pointer">
                  Se tilbud
                </Button>
              </CardContent>
            </Card>
          </Link>

        </div>

        {/* Stats Section */}
        <div className="bg-muted rounded-lg p-8 text-center">
          <h2 className="text-2xl font-semibold mb-4">Hvorfor Ukeshandel.no?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-3xl font-bold text-primary mb-2">{totalOffers ?? '...'}</div>
              <div className="text-sm text-muted-foreground">Tilbud denne uka</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">{storeCount ?? '...'}</div>
              <div className="text-sm text-muted-foreground">Butikkjeder</div>
            </div>
            <div>
              <div className="flex items-center justify-center mb-2">
                <Tags className="h-8 w-8 text-primary" />
              </div>
              <div className="text-sm text-muted-foreground">Tilbud sortert etter kategori</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
