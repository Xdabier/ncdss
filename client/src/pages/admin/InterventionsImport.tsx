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
  Stethoscope,
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
import * as XLSX from 'xlsx';

interface ParsedRow {
  pathologyName: string;
  abcdeCategory: string;
  severitySigns: string[];
  nursingInterventions: string[];
  medicalInterventions: string[];
  dosageFormulas: string;
  orientation: string;
  isSAUV: boolean;
  [key: string]: string | string[] | boolean | undefined;
}

interface ColumnMapping {
  pathologyName: string;
  abcdeCategory: string;
  severitySigns: string;
  nursingInterventions: string;
  medicalInterventions: string;
  dosageFormulas: string;
  orientation: string;
}

type ImportMode = 'replace' | 'add';

const DEFAULT_MAPPING: ColumnMapping = {
  pathologyName: '',
  abcdeCategory: '',
  severitySigns: '',
  nursingInterventions: '',
  medicalInterventions: '',
  dosageFormulas: '',
  orientation: '',
};

const ABCDE_MAPPING: Record<string, string> = {
  'airway': 'A',
  'breathing': 'B',
  'circulation': 'C',
  'disability': 'D',
  'exposure': 'E',
  'general': 'GENERAL',
  'générale': 'GENERAL',
  'a': 'A',
  'b': 'B',
  'c': 'C',
  'd': 'D',
  'e': 'E',
};

export default function InterventionsImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
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
    setSheetNames([]);
    setSelectedSheet('');
    setWorkbook(null);
    setRawData([]);
    setColumns([]);
    setColumnMapping(DEFAULT_MAPPING);
    setPreviewData([]);
    setParseError(null);
    setImportResult(null);
    setImportError(null);
  };

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const worksheet = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, {
      defval: '',
      raw: false,
    });

    if (jsonData.length === 0) {
      setParseError('La feuille sélectionnée est vide');
      return;
    }

    const cols = Object.keys(jsonData[0]);
    setColumns(cols);
    setRawData(jsonData);

    // Auto-detect column mapping
    const autoMapping: ColumnMapping = { ...DEFAULT_MAPPING };
    const lowerCols = cols.map((c) => c.toLowerCase());

    // Pathology name
    const namePatterns = ['patholog', 'nom', 'name', 'titre', 'title'];
    for (const pattern of namePatterns) {
      const idx = lowerCols.findIndex((c) => c.includes(pattern));
      if (idx !== -1) {
        autoMapping.pathologyName = cols[idx];
        break;
      }
    }

    // ABCDE Category
    const categoryPatterns = ['categori', 'category', 'abcde', 'type'];
    for (const pattern of categoryPatterns) {
      const idx = lowerCols.findIndex((c) => c.includes(pattern));
      if (idx !== -1) {
        autoMapping.abcdeCategory = cols[idx];
        break;
      }
    }

    // Severity signs
    const severityPatterns = ['signe', 'gravit', 'severity', 'sign', 'symptom'];
    for (const pattern of severityPatterns) {
      const idx = lowerCols.findIndex((c) => c.includes(pattern));
      if (idx !== -1) {
        autoMapping.severitySigns = cols[idx];
        break;
      }
    }

    // Nursing interventions
    const nursingPatterns = ['infirm', 'nursing', 'nurse', 'ide'];
    for (const pattern of nursingPatterns) {
      const idx = lowerCols.findIndex((c) => c.includes(pattern));
      if (idx !== -1) {
        autoMapping.nursingInterventions = cols[idx];
        break;
      }
    }

    // Medical interventions
    const medicalPatterns = ['médic', 'medic', 'medical', 'doctor', 'physician'];
    for (const pattern of medicalPatterns) {
      const idx = lowerCols.findIndex((c) => c.includes(pattern));
      if (idx !== -1) {
        autoMapping.medicalInterventions = cols[idx];
        break;
      }
    }

    // Dosage
    const dosagePatterns = ['dosage', 'dose', 'posolog'];
    for (const pattern of dosagePatterns) {
      const idx = lowerCols.findIndex((c) => c.includes(pattern));
      if (idx !== -1) {
        autoMapping.dosageFormulas = cols[idx];
        break;
      }
    }

    // Orientation
    const orientationPatterns = ['orient', 'destination', 'service'];
    for (const pattern of orientationPatterns) {
      const idx = lowerCols.findIndex((c) => c.includes(pattern));
      if (idx !== -1) {
        autoMapping.orientation = cols[idx];
        break;
      }
    }

    // If no pathology name found, use first column
    if (!autoMapping.pathologyName && cols.length > 0) {
      autoMapping.pathologyName = cols[0];
    }

    setColumnMapping(autoMapping);
    setParseError(null);
  };

  const parseFile = useCallback(async (selectedFile: File) => {
    resetState();
    setFile(selectedFile);
    setParseError(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      setWorkbook(wb);

      // Get all sheet names
      const sheets = wb.SheetNames;
      setSheetNames(sheets);

      // Auto-select first sheet or try to find a relevant one
      let selectedSheetName = sheets[0];

      // Try to find ABCDE-related sheets
      const abcdeSheets = sheets.filter((s) => {
        const lower = s.toLowerCase();
        return ['airway', 'breathing', 'circulation', 'disability', 'exposure', 'general', 'générale', 'abcde'].some(
          (term) => lower.includes(term)
        );
      });

      if (abcdeSheets.length > 0) {
        selectedSheetName = abcdeSheets[0];
      }

      setSelectedSheet(selectedSheetName);
      parseSheet(wb, selectedSheetName);
    } catch (err) {
      console.error('Parse error:', err);
      setParseError('Erreur lors de la lecture du fichier. Vérifiez le format.');
    }
  }, []);

  // Re-parse when sheet changes
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      parseSheet(workbook, sheetName);
    }
  };

  // Parse text to array (handles newlines, semicolons, and pipes)
  const parseToArray = (text: string): string[] => {
    if (!text) return [];
    return text
      .split(/[\n;|]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  // Normalize ABCDE category
  const normalizeCategory = (category: string): string => {
    if (!category) return 'GENERAL';
    const lower = category.toLowerCase().trim();
    return ABCDE_MAPPING[lower] || category.toUpperCase();
  };

  // Update preview when mapping changes
  React.useEffect(() => {
    if (rawData.length === 0 || !columnMapping.pathologyName) {
      setPreviewData([]);
      return;
    }

    const mapped: ParsedRow[] = rawData.slice(0, 10).map((row) => ({
      pathologyName: row[columnMapping.pathologyName] || '',
      abcdeCategory: normalizeCategory(columnMapping.abcdeCategory ? row[columnMapping.abcdeCategory] : ''),
      severitySigns: parseToArray(columnMapping.severitySigns ? row[columnMapping.severitySigns] : ''),
      nursingInterventions: parseToArray(columnMapping.nursingInterventions ? row[columnMapping.nursingInterventions] : ''),
      medicalInterventions: parseToArray(columnMapping.medicalInterventions ? row[columnMapping.medicalInterventions] : ''),
      dosageFormulas: columnMapping.dosageFormulas ? row[columnMapping.dosageFormulas] || '' : '',
      orientation: columnMapping.orientation ? row[columnMapping.orientation] || '' : '',
      isSAUV: (columnMapping.orientation ? row[columnMapping.orientation] || '' : '').toLowerCase().includes('sauv'),
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

    if (!columnMapping.pathologyName) {
      setImportError('Veuillez mapper la colonne "Nom de la pathologie" au minimum');
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const api = await getApi();

      // Map all data
      const interventions = rawData
        .map((row) => ({
          pathologyName: row[columnMapping.pathologyName] || '',
          abcdeCategory: normalizeCategory(columnMapping.abcdeCategory ? row[columnMapping.abcdeCategory] : ''),
          severitySigns: parseToArray(columnMapping.severitySigns ? row[columnMapping.severitySigns] : ''),
          nursingInterventions: parseToArray(columnMapping.nursingInterventions ? row[columnMapping.nursingInterventions] : ''),
          medicalInterventions: parseToArray(columnMapping.medicalInterventions ? row[columnMapping.medicalInterventions] : ''),
          dosageFormulas: columnMapping.dosageFormulas ? row[columnMapping.dosageFormulas] || '' : '',
          orientation: columnMapping.orientation ? row[columnMapping.orientation] || '' : '',
          isSAUV: (columnMapping.orientation ? row[columnMapping.orientation] || '' : '').toLowerCase().includes('sauv'),
        }))
        .filter((p) => p.pathologyName.trim() !== '');

      if (interventions.length === 0) {
        setImportError('Aucune donnée valide à importer');
        setIsImporting(false);
        return;
      }

      if (importMode === 'replace') {
        // The API /import endpoint replaces all data
        const response = await api.post(API_ROUTES.interventions.import, { interventions });
        setImportResult({ imported: response.data.imported, errors: 0 });
      } else {
        // Add mode: create each intervention individually
        let imported = 0;
        let errors = 0;

        for (const intervention of interventions) {
          try {
            await api.post(API_ROUTES.interventions.create, intervention);
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

  const canImport = file && columnMapping.pathologyName && rawData.length > 0;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/interventions')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Import de Pathologies Cliniques</h1>
            <p className="text-gray-600 mt-1">Importez des interventions ABCDE depuis un fichier Excel</p>
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
                    {importResult.imported} pathologie{importResult.imported !== 1 ? 's' : ''} importée
                    {importResult.imported !== 1 ? 's' : ''}
                    {importResult.errors > 0 && `, ${importResult.errors} erreur${importResult.errors !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" onClick={resetState}>
                    Importer un autre fichier
                  </Button>
                  <Button onClick={() => navigate('/admin/interventions')}>Voir la liste</Button>
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
                        <p className="text-sm text-gray-500">
                          {sheetNames.length} feuille{sheetNames.length !== 1 ? 's' : ''} - {rawData.length} lignes
                        </p>
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

            {/* Sheet Selection */}
            {sheetNames.length > 1 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Feuille à importer</CardTitle>
                  <CardDescription>Sélectionnez la feuille contenant les données</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {sheetNames.map((sheet) => (
                      <button
                        key={sheet}
                        onClick={() => handleSheetChange(sheet)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          selectedSheet === sheet
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {sheet}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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
                        Nom de la pathologie <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={columnMapping.pathologyName}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, pathologyName: v })}
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
                      <Label>Catégorie ABCDE</Label>
                      <Select
                        value={columnMapping.abcdeCategory || 'none'}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, abcdeCategory: v === 'none' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une colonne" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Non mappé (défaut: GENERAL) --</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Signes de gravité</Label>
                      <Select
                        value={columnMapping.severitySigns || 'none'}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, severitySigns: v === 'none' ? '' : v })}
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
                      <p className="text-xs text-gray-500">Séparés par ; ou | ou saut de ligne</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Interventions infirmières</Label>
                      <Select
                        value={columnMapping.nursingInterventions || 'none'}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, nursingInterventions: v === 'none' ? '' : v })}
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
                      <Label>Interventions médicales</Label>
                      <Select
                        value={columnMapping.medicalInterventions || 'none'}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, medicalInterventions: v === 'none' ? '' : v })}
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
                      <Label>Formules de dosage</Label>
                      <Select
                        value={columnMapping.dosageFormulas || 'none'}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, dosageFormulas: v === 'none' ? '' : v })}
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

                    <div className="space-y-2 md:col-span-2">
                      <Label>Orientation</Label>
                      <Select
                        value={columnMapping.orientation || 'none'}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, orientation: v === 'none' ? '' : v })}
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
                      <p className="text-xs text-gray-500">
                        Si contient "SAUV", la pathologie sera marquée comme critique
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Preview */}
            {previewData.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="h-5 w-5" />
                    Aperçu des données
                  </CardTitle>
                  <CardDescription>
                    Premières {previewData.length} lignes sur {rawData.length}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Pathologie</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Catégorie</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Signes</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-500">Int. Inf.</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-500">Int. Méd.</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Orientation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {previewData.map((row, idx) => (
                          <tr key={idx} className={row.pathologyName ? '' : 'bg-red-50'}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {row.pathologyName || <span className="text-red-500 text-xs">Vide</span>}
                                {row.isSAUV && (
                                  <Badge variant="destructive" className="text-xs">SAUV</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline">{row.abcdeCategory}</Badge>
                            </td>
                            <td className="px-3 py-2 text-gray-600 max-w-xs truncate">
                              {row.severitySigns?.length > 0 ? row.severitySigns.slice(0, 2).join(', ') : '-'}
                              {(row.severitySigns?.length || 0) > 2 && ' ...'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-blue-600">{row.nursingInterventions?.length || 0}</span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-purple-600">{row.medicalInterventions?.length || 0}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{row.orientation || '-'}</td>
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
                        <p className="text-sm text-gray-500">Les nouvelles pathologies seront ajoutées à la liste existante</p>
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
                          Attention: Cette action supprimera toutes les pathologies existantes
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
                  ? `${rawData.filter((r) => r[columnMapping.pathologyName]?.trim()).length} pathologies valides à importer`
                  : 'Sélectionnez un fichier pour commencer'}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate('/admin/interventions')}>
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
                Vous êtes sur le point de <strong>supprimer toutes les pathologies existantes</strong> et de les remplacer par
                les {rawData.filter((r) => r[columnMapping.pathologyName]?.trim()).length} pathologies du fichier importé.
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
