import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Utensils, Tags, Store, Construction, ArrowRight } from 'lucide-react';
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
    <main className="flex flex-1 flex-col">
      <div className="container mx-auto px-4 py-4 sm:py-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="mt-6 mb-12 w-full text-center text-[clamp(2.5rem,9.8vw,6rem)] font-bold leading-[1.05] tracking-tight text-[#181A18] sm:mt-8 sm:mb-16">
          Ukens<br />dagligvaretilbud
        </h2>
        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          <Link
            to="/tilbud"
            className="group block rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
          >
            <Card className="flex h-full flex-col border-zinc-200 bg-white text-[#181A18] transition-[border-color,box-shadow] group-hover:border-primary group-hover:shadow-md group-active:border-tertiary group-active:shadow-none motion-reduce:transition-none">
              <CardHeader className="p-5 pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2">
                    <ShoppingCart className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl sm:text-2xl">Tilbud</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="mt-auto p-5 pt-0 text-left">
                <span className="flex min-h-11 items-center justify-between gap-3 text-base font-medium">
                  <span>Bla gjennom alle tilbud</span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
                </span>
              </CardContent>
            </Card>
          </Link>
          <Card className="relative flex h-full flex-col overflow-hidden bg-white text-[#181A18]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 bottom-3 h-5 w-36 -rotate-[30deg]"
              style={{ backgroundImage: 'repeating-linear-gradient(135deg, #facc15 0px, #facc15 12px, #1C1C1C 12px, #1C1C1C 24px)' }}
            />
            <CardHeader className="p-5 pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg">
                  <Utensils className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl sm:text-2xl">Middagsplanlegger</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="mt-auto p-5 pt-0 text-left">
              <div className="flex min-h-11 items-center">
              <Button variant="secondary" className="h-11 bg-secondary text-[#181A18] disabled:opacity-100" disabled>
                <Construction className="h-4 w-4 text-primary" aria-hidden="true" />
                Kommer snart
              </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>



      <section aria-label="Tilbud og butikkjeder">
        <div className="mx-auto grid w-full max-w-md grid-cols-1 items-start gap-8 px-4 py-10 sm:gap-10 sm:py-12">
          <div className="text-center">
            <div className="flex flex-col items-center gap-3">
              <Tags className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="text-3xl font-bold leading-tight text-[#181A18]">{stats?.offers ?? '…'}</div>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">Tilbud denne uka</div>
          </div>
          <div className="text-center">
            <div className="flex flex-col items-center gap-3">
              <Store className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="text-3xl font-bold leading-tight text-[#181A18]">{stats?.stores ?? '…'}</div>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">Butikkjeder</div>
          </div>
        </div>

      </section>
      <picture className="block w-full">
        <source media="(min-width: 768px)" srcSet="/images/landing_1_pc.png" />
        <img
          src="/images/landing_1_mobile.png"
          alt="Handlepose med ferske grønnsaker og brød på kjøkkenbenken"
          loading="lazy"
          className="h-48 w-full object-cover object-[center_70%] sm:h-64 md:h-80 md:object-center"
        />
      </picture>
      <footer className="mt-auto border-t border-zinc-200 bg-transparent px-4 py-4 text-center text-sm text-[#181A18]">
        2026 @ SETTEN
      </footer>
    </main>
  );
}
