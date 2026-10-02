import { Outlet, Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, Home } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const isAdminPage = location.pathname === '/admin';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-zinc-200 bg-transparent text-[#181A18]">
        <div className="container mx-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="flex flex-col items-start text-left hover:opacity-80 transition-opacity">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Ukeshandel.no</h1>
            </Link>
            <div className="flex items-center justify-self-end gap-2">
              {isAdminPage ? (
                <Link to="/">
                  <Button variant="outline" size="sm" className="h-8 w-8 border-zinc-200 bg-transparent p-0 text-primary hover:bg-secondary sm:w-auto sm:px-3">
                    <Home className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Tilbake</span>
                  </Button>
                </Link>
              ) : (
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="h-8 w-8 border-zinc-200 bg-transparent p-0 text-primary hover:bg-secondary sm:w-auto sm:px-3">
                    <Settings className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Admin</span>
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
