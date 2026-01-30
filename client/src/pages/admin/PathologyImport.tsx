import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  X,
  ArrowLeft,
  Loader2,
  Info,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { getApi } from '../../services/api';
import { API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import * as XLSX from 'xlsx';

interface ParsedRow {
  name: string;
  category: string;
  primaryOrientation?: string;
  secondaryOrientation?: string;
  [key: string]: string | undefined;
}

interface ColumnMapping {
  name: string;
  category: string;
  primaryOrientation: string;
  secondaryOrientation: string;
}

type ImportMode = 'replace' | 'add';

const DEFAULT_MAPPING: ColumnMapping = {
  name: '',
  category: '',
  primaryOrientation: '',
  secondaryOrientation: '',
};

export default function PathologyImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(DEFAULT_MAPPING);
  const [previewData, setPreviewData] = useState<ParsedRow[]>([]);

  // UI state
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('add');
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const resetState = () => {
    setFile(null);
    setRawData([]);
    setColumns([]);
    setColumnMapping(DEFAULT_MAPPING);
    setPreviewData([]);
    setParseError(null);
    setImportResult(null);
    setImportError(null);
  };

  const parseFile = useCallback(async (selectedFile: File) => {
    resetState();
    setFile(selectedFile);
    setParseError(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, {
        defval: '',
        raw: false,
      });

      if (jsonData.length === 0) {
        setParseError('Le fichier est vide ou ne contient pas de données valides');
        return;
      }

      // Get columns from first row
      const cols = Object.keys(jsonData[0]);
      setColumns(cols);
      setRawData(jsonData);

      // Auto-detect column mapping
      const autoMapping: ColumnMapping = { ...DEFAULT_MAPPING };
      const lowerCols = cols.map((c) => c.toLowerCase());

      // Try to find name column
      const namePatterns = ['nom', 'name', 'motif', 'pathologie', 'pathology', 'complaint'];
      for (const pattern of namePatterns) {
        const idx = lowerCols.findIndex((c) => c.includes(pattern));
        if (idx !== -1) {
          autoMapping.name = cols[idx];
          break;
        }
      }

      // Try to find category column
      const categoryPatterns = ['categorie', 'category', 'catégorie', 'type'];
      for (const pattern of categoryPatterns) {
        const idx = lowerCols.findIndex((c) => c.includes(pattern));
        if (idx !== -1) {
          autoMapping.category = cols[idx];
          break;
        }
      }

      // Try to find orientation columns
      const orientationPatterns = ['orientation', 'orient'];
      for (const pattern of orientationPatterns) {
        const idx = lowerCols.findIndex(
          (c) => c.includes(pattern) && (c.includes('prim') || c.includes('1') || !c.includes('second'))
        );
        if (idx !== -1) {
          autoMapping.primaryOrientation = cols[idx];
          break;
        }
      }
      for (const pattern of orientationPatterns) {
        const idx = lowerCols.findIndex((c) => c.includes(pattern) && (c.includes('second') || c.includes('2')));
        if (idx !== -1) {
          autoMapping.secondaryOrientation = cols[idx];
          break;
        }
      }

      // If no name found, use first column
      if (!autoMapping.name && cols.length > 0) {
        autoMapping.name = cols[0];
      }

      setColumnMapping(autoMapping);
    } catch (err) {
      console.error('Parse error:', err);
      setParseError('Erreur lors de la lecture du fichier. Vérifiez le format.');
    }
  }, []);

  // Update preview when mapping changes
  React.useEffect(() => {
    if (rawData.length === 0 || !columnMapping.name) {
      setPreviewData([]);
      return;
    }

    const mapped: ParsedRow[] = rawData.slice(0, 10).map((row) => ({
      name: row[columnMapping.name] || '',
      category: columnMapping.category ? row[columnMapping.category] || '' : '',
      primaryOrientation: columnMapping.primaryOrientation ? row[columnMapping.primaryOrientation] || '' : '',
      secondaryOrientation: columnMapping.secondaryOrientation ? row[columnMapping.secondaryOrientation] || '' : '',
    }));

    setPreviewData(mapped);
  }, [rawData, columnMapping]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const ext = droppedFile.name.split('.').pop()?.toLowerCase();
      if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
        parseFile(droppedFile);
      } else {
        setParseError('Format non supporté. Utilisez .xlsx, .xls ou .csv');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      parseFile(selectedFile);
    }
  };

  const handleImport = async () => {
    if (importMode === 'replace' && !showConfirmReplace) {
      setShowConfirmReplace(true);
      return;
    }

    if (!columnMapping.name) {
      setImportError('Veuillez mapper la colonne "Nom" au minimum');
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const api = await getApi();

      // Map all data
      const pathologies = rawData
        .map((row) => ({
          name: row[columnMapping.name] || '',
          category: columnMapping.category ? row[columnMapping.category] || 'Non classé' : 'Non classé',
          primaryOrientation: columnMapping.primaryOrientation ? row[columnMapping.primaryOrientation] : undefined,
          secondaryOrientation: columnMapping.secondaryOrientation ? row[columnMapping.secondaryOrientation] : undefined,
        }))
        .filter((p) => p.name.trim() !== '');

      if (pathologies.length === 0) {
        setImportError('Aucune donnée valide à importer');
        setIsImporting(false);
        return;
      }

      // The API /import endpoint replaces all data
      // For "add" mode, we would need to create individually, but for simplicity
      // we'll use the import endpoint which replaces everything
      if (importMode === 'replace') {
        const response = await api.post(API_ROUTES.pathologies.import, { pathologies });
        setImportResult({ imported: response.data.imported, errors: 0 });
      } else {
        // Add mode: create each pathology individually
        let imported = 0;
        let errors = 0;

        for (const p of pathologies) {
          try {
            await api.post(API_ROUTES.pathologies.create, p);
            imported++;
          } catch {
            errors++;
          }
        }

        setImportResult({ imported, errors });
      }

      setShowConfirmReplace(false);
    } catch (err: unknown) {
      console.error('Import error:', err);
      const axiosError = err as { response?: { data?: { error?: string } } };
      setImportError(axiosError.response?.data?.error || "Erreur lors de l'import");
    } finally {
      setIsImporting(false);
    }
  };

  const canImport = file && columnMapping.name && rawData.length > 0;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(CLIENT_ROUTES.admin.pathologies)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Import de Pathologies</h1>
            <p className="text-gray-600 mt-1">Importez des motifs de consultation depuis un fichier Excel</p>
          </div>
        </div>

        {/* Import Result */}
        {importResult && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                  <h3 className="font-semibold text-green-800">Import terminé</h3>
                  <p className="text-green-700">
                    {importResult.imported} motif{importResult.imported !== 1 ? 's' : ''} importé
                    {importResult.imported !== 1 ? 's' : ''}
                    {importResult.errors > 0 && `, ${importResult.errors} erreur${importResult.errors !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" onClick={resetState}>
                    Importer un autre fichier
                  </Button>
                  <Button onClick={() => navigate(CLIENT_ROUTES.admin.pathologies)}>Voir la liste</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!importResult && (
          <>
            {/* File Upload */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Fichier source
                </CardTitle>
                <CardDescription>Formats acceptés: .xlsx, .xls, .csv</CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    isDragOver
                      ? 'border-blue-500 bg-blue-50'
                      : file
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-4">
                      <FileSpreadsheet className="h-10 w-10 text-green-600" />
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">{rawData.length} lignes trouvées</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          resetState();
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600 mb-2">Glissez-déposez votre fichier ici</p>
                      <p className="text-sm text-gray-500">ou cliquez pour sélectionner</p>
                    </>
                  )}
                </div>

                {parseError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    {parseError}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Column Mapping */}
            {columns.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Mapping des colonnes</CardTitle>
                  <CardDescription>Associez les colonnes du fichier aux champs requis</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        Nom du motif <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={columnMapping.name}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, name: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une colonne" />
                        </SelectTrigger>
                        <SelectContent>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Catégorie</Label>
                      <Select
                        value={columnMapping.category || 'none'}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, category: v === 'none' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une colonne" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Non mappé --</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Orientation primaire</Label>
                      <Select
                        value={columnMapping.primaryOrientation || 'none'}
                        onValueChange={(v) =>
                          setColumnMapping({ ...columnMapping, primaryOrientation: v === 'none' ? '' : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une colonne" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Non mappé --</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Orientation secondaire</Label>
                      <Select
                        value={columnMapping.secondaryOrientation || 'none'}
                        onValueChange={(v) =>
                          setColumnMapping({ ...columnMapping, secondaryOrientation: v === 'none' ? '' : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une colonne" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Non mappé --</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Preview */}
            {previewData.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Aperçu des données</CardTitle>
                  <CardDescription>
                    Premières {previewData.length} lignes sur {rawData.length}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Nom</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Catégorie</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Orientation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {previewData.map((row, idx) => (
                          <tr key={idx} className={row.name ? '' : 'bg-red-50'}>
                            <td className="px-3 py-2">
                              {row.name || <span className="text-red-500 text-xs">Vide</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{row.category || '-'}</td>
                            <td className="px-3 py-2">
                              {row.primaryOrientation && (
                                <Badge variant="outline" className="mr-1">
                                  {row.primaryOrientation}
                                </Badge>
                              )}
                              {row.secondaryOrientation && (
                                <Badge variant="secondary">{row.secondaryOrientation}</Badge>
                              )}
                              {!row.primaryOrientation && !row.secondaryOrientation && '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Import Options */}
            {canImport && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Options d'import</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        id="mode-add"
                        name="import-mode"
                        checked={importMode === 'add'}
                        onChange={() => setImportMode('add')}
                        className="mt-1"
                      />
                      <label htmlFor="mode-add" className="cursor-pointer">
                        <p className="font-medium">Ajouter aux données existantes</p>
                        <p className="text-sm text-gray-500">Les nouveaux motifs seront ajoutés à la liste existante</p>
                      </label>
                    </div>

                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        id="mode-replace"
                        name="import-mode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="mt-1"
                      />
                      <label htmlFor="mode-replace" className="cursor-pointer">
                        <p className="font-medium text-amber-700">Remplacer toutes les données</p>
                        <p className="text-sm text-gray-500">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          Attention: Cette action supprimera tous les motifs existants
                        </p>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Import Error */}
            {importError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                {importError}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Info className="h-4 w-4" />
                {rawData.length > 0
                  ? `${rawData.filter((r) => r[columnMapping.name]?.trim()).length} motifs valides à importer`
                  : 'Sélectionnez un fichier pour commencer'}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate(CLIENT_ROUTES.admin.pathologies)}>
                  Annuler
                </Button>
                <Button onClick={handleImport} disabled={!canImport || isImporting}>
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Importer
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Replace Confirmation Modal */}
        {showConfirmReplace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirmReplace(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 z-10 p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-full bg-amber-100">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Confirmer le remplacement</h3>
                  <p className="text-sm text-gray-500">Cette action est irréversible</p>
                </div>
              </div>
              <p className="text-gray-600 mb-6">
                Vous êtes sur le point de <strong>supprimer tous les motifs existants</strong> et de les remplacer par
                les {rawData.filter((r) => r[columnMapping.name]?.trim()).length} motifs du fichier importé.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirmReplace(false)}>
                  Annuler
                </Button>
                <Button variant="destructive" className="flex-1" onClick={handleImport} disabled={isImporting}>
                  {isImporting ? 'Import...' : 'Confirmer le remplacement'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
