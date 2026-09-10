import { Outlet, Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, Home } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const isAdminPage = location.pathname === '/admin';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Ukeshandel.no</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Oversikt over ukens dagligvaretilbud</p>
            </Link>
            <div className="flex items-center gap-2">
              {isAdminPage ? (
                <Link to="/">
                  <Button variant="outline" size="sm">
                    <Home className="h-4 w-4 mr-2" />
                    Tilbake
                  </Button>
                </Link>
              ) : (
                <Link to="/admin">
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
