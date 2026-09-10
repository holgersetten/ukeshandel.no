import { useState, useEffect } from 'react';
import { offersApi } from '../services/api';
import type { CategoryHierarchy } from '../types/offer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

function CategoryManager() {
  const [categories, setCategories] = useState<CategoryHierarchy>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Underkategori state
  const [selectedMain, setSelectedMain] = useState<string>('');
  const [newSubCategory, setNewSubCategory] = useState('');
  const [renameMode, setRenameMode] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  
  // Hovedkategori state
  const [newMainCategory, setNewMainCategory] = useState('');
  const [renameMainMode, setRenameMainMode] = useState<string | null>(null);
  const [newMainName, setNewMainName] = useState('');
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await offersApi.getCategories();
      setCategories(data.categories);
    } catch (err) {
      setError('Kunne ikke hente kategorier');
      console.error('Error loading categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedMain || !newSubCategory.trim()) {
      alert('Velg hovedkategori og skriv inn navn på underkategori');
      return;
    }

    try {
      setSaving(true);
      const result = await offersApi.addSubCategory(selectedMain, newSubCategory.trim());
      alert(`✅ ${result.message}\n\n${result.note}`);
      setNewSubCategory('');
      await loadCategories();
    } catch (err: any) {
      alert(`❌ Feil: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSubCategory = async (mainCat: string, subCat: string) => {
    if (subCat === 'Annet') {
      alert('Kan ikke fjerne "Annet" kategorien');
      return;
    }

    if (!confirm(`Er du sikker på at du vil fjerne "${subCat}" fra "${mainCat}"?`)) {
      return;
    }

    try {
      setSaving(true);
      const result = await offersApi.removeSubCategory(mainCat, subCat);
      alert(`✅ ${result.message}\n\n${result.note}`);
      await loadCategories();
    } catch (err: any) {
      alert(`❌ Feil: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRenameSubCategory = async (mainCat: string, oldName: string) => {
    if (!newName.trim()) {
      alert('Skriv inn nytt navn');
      return;
    }

    try {
      setSaving(true);
      const result = await offersApi.renameSubCategory(mainCat, oldName, newName.trim());
      alert(`✅ ${result.message}\n\n${result.note}`);
      setRenameMode(null);
      setNewName('');
      await loadCategories();
    } catch (err: any) {
      alert(`❌ Feil: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMainCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMainCategory.trim()) {
      alert('Skriv inn navn på ny hovedkategori');
      return;
    }

    try {
      setSaving(true);
      const result = await offersApi.addMainCategory(newMainCategory.trim());
      alert(`✅ ${result.message}\n\n${result.note}`);
      setNewMainCategory('');
      await loadCategories();
    } catch (err: any) {
      alert(`❌ Feil: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMainCategory = async (mainCat: string) => {
    if (!confirm(`Er du sikker på at du vil fjerne "${mainCat}" og alle dens underkategorier?`)) {
      return;
    }

    try {
      setSaving(true);
      const result = await offersApi.removeMainCategory(mainCat);
      alert(`✅ ${result.message}\n\n${result.note}`);
      await loadCategories();
    } catch (err: any) {
      alert(`❌ Feil: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRenameMainCategory = async (oldName: string) => {
    if (!newMainName.trim()) {
      alert('Skriv inn nytt navn');
      return;
    }

    try {
      setSaving(true);
      const result = await offersApi.renameMainCategory(oldName, newMainName.trim());
      alert(`✅ ${result.message}\n\n${result.note}`);
      setRenameMainMode(null);
      setNewMainName('');
      await loadCategories();
    } catch (err: any) {
      alert(`❌ Feil: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <Card>
          <CardContent className="pt-6 text-center">Laster kategorier...</CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={loadCategories}>
              Prøv igjen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">🏷️ Kategoristruktur</h1>
        <p className="text-gray-600">Administrer hovedkategorier og underkategorier</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Venstre side: Legg til */}
        <Card>
          <CardHeader>
            <CardTitle>➕ Legg til hovedkategori</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddMainCategory} className="space-y-4 mb-8">
              <div className="space-y-2">
                <Label htmlFor="newMainCategory">Ny hovedkategori</Label>
                <Input
                  id="newMainCategory"
                  type="text"
                  value={newMainCategory}
                  onChange={(e) => setNewMainCategory(e.target.value)}
                  placeholder="f.eks. 'Fryste varer', 'Husholdning'"
                  disabled={saving}
                  required
                />
              </div>
              <Button 
                type="submit" 
                disabled={saving}
                className="w-full"
              >
                {saving ? 'Lagrer...' : '✅ Legg til hovedkategori'}
              </Button>
            </form>

          <hr className="my-8 border-border" />

          <div className="space-y-4">
            <h3 className="text-xl font-semibold">➕ Legg til underkategori</h3>
            <form onSubmit={handleAddSubCategory} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="selectedMain">Hovedkategori</Label>
                <select
                  id="selectedMain"
                  value={selectedMain}
                  onChange={(e) => setSelectedMain(e.target.value)}
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
                <Label htmlFor="newSubCategory">Ny underkategori</Label>
                <Input
                  id="newSubCategory"
                  type="text"
                  value={newSubCategory}
                  onChange={(e) => setNewSubCategory(e.target.value)}
                  placeholder="f.eks. 'Laks', 'Supper', 'Proteinbarer'"
                  disabled={saving}
                  required
                />
              </div>

              <Button 
                type="submit" 
                disabled={saving || !selectedMain}
                className="w-full"
              >
                {saving ? 'Lagrer...' : '✅ Legg til underkategori'}
              </Button>
            </form>

            <Badge variant="outline" className="w-full justify-start p-3 text-sm">
              Endringer lagres og gjelder umiddelbart
            </Badge>
          </div>
          </CardContent>
        </Card>

        {/* Høyre side: Eksisterende kategorier */}
        <Card>
          <CardHeader>
            <CardTitle>📋 Nåværende struktur</CardTitle>
          </CardHeader>
          <CardContent>
          
          {Object.entries(categories).map(([mainCat, subCats]) => (
            <div key={mainCat} className="mb-6 border-b border-gray-200 pb-4">
              {renameMainMode === mainCat ? (
                <div className="flex gap-2 mb-2">
                  <Input
                    type="text"
                    value={newMainName}
                    onChange={(e) => setNewMainName(e.target.value)}
                    placeholder={mainCat}
                    autoFocus
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleRenameMainCategory(mainCat)}
                    disabled={saving}
                  >
                    ✓
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setRenameMainMode(null);
                      setNewMainName('');
                    }}
                    disabled={saving}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <h3 className="flex justify-between items-center font-semibold text-lg mb-2">
                  <span>{mainCat}</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRenameMainMode(mainCat);
                        setNewMainName(mainCat);
                      }}
                      disabled={saving}
                      title="Omdøp hovedkategori"
                    >
                      ✏️
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRemoveMainCategory(mainCat)}
                      disabled={saving}
                      title="Fjern hovedkategori"
                    >
                      🗑️
                    </Button>
                  </div>
                </h3>
              )}
              <ul className="space-y-1 ml-4">
                {subCats.map((subCat) => (
                  <li key={subCat} className="flex justify-between items-center py-1">
                    {renameMode === `${mainCat}/${subCat}` ? (
                      <div className="flex gap-2 flex-1">
                        <Input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder={subCat}
                          autoFocus
                          className="flex-1 h-8 text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleRenameSubCategory(mainCat, subCat)}
                          disabled={saving}
                          className="h-8"
                        >
                          ✓
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setRenameMode(null);
                            setNewName('');
                          }}
                          disabled={saving}
                          className="h-8"
                        >
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-muted-foreground">• {subCat}</span>
                        <div className="flex gap-2">
                          {subCat !== 'Annet' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRenameMode(`${mainCat}/${subCat}`);
                                  setNewName(subCat);
                                }}
                                disabled={saving}
                                title="Omdøp"
                                className="h-7 px-2 text-xs"
                              >
                                ✏️
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveSubCategory(mainCat, subCat)}
                                disabled={saving}
                                title="Fjern"
                                className="h-7 px-2 text-xs"
                              >
                                🗑️
                              </Button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default CategoryManager;
