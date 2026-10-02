import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Utensils } from 'lucide-react';
import { useState, useEffect } from 'react';
import { offersApi } from '@/services/api';

export default function HomePage() {
  const [stats, setStats] = useState<{ offers: number; stores: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    offersApi.getAllOffers()
      .then(response => {
        const offers = response.offers || [];
        if (!cancelled) {
          setStats({ offers: offers.length, stores: new Set(offers.map(offer => offer.store)).size });
        }
      })
      .catch(error => console.error('Failed to fetch stats:', error));
    return () => { cancelled = true; };
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
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
                  Bla gjennom alle tilbud
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors cursor-pointer">
                  Se tilbud
                </Button>
              </CardContent>
            </Card>
          </Link>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Utensils className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Middagsplanlegger</CardTitle>
              </div>
              <CardDescription className="text-base">
                Planlegg ukens middager
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled>
                Kommer snart
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-6 rounded-lg bg-muted p-6 text-center">
          <div>
            <div className="mb-2 text-3xl font-bold text-primary">{stats?.offers ?? '…'}</div>
            <div className="text-sm text-muted-foreground">Tilbud denne uka</div>
          </div>
          <div>
            <div className="mb-2 text-3xl font-bold text-primary">{stats?.stores ?? '…'}</div>
            <div className="text-sm text-muted-foreground">Butikkjeder</div>
          </div>
        </div>
      </div>
    </div>
  );
}
