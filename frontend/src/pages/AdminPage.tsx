import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';
import AdminReview from '../components/AdminReview';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="h-5 w-5 text-foreground" />
              <h2 className="text-xl font-semibold text-foreground">Admin Tilgang</h2>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Passord</label>
              <Input
                type="password"
                placeholder="Skriv inn passord..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password === 'a') {
                    setIsAuthenticated(true);
                  }
                }}
                className="h-11"
              />
            </div>
            <Button
              onClick={() => {
                if (password === 'a') {
                  setIsAuthenticated(true);
                } else {
                  alert('Feil passord!');
                }
              }}
              className="w-full"
            >
              Logg inn
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full"
            >
              Avbryt
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <AdminReview />
    </div>
  );
}
