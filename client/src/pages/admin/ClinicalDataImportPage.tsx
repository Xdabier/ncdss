import React, { useState, useRef } from 'react';
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
  Database,
  Syringe,
  Pill,
  Activity,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { getApi } from '../../services/api';
import { API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import * as XLSX from 'xlsx';

interface ImportResult {
  imported: {
    pathologies: number;
    symptoms: number;
    nursingInterventions: number;
    medicalInterventions: number;
  };
  errors: Array<{
    sheet: string;
    row: number;
    message: string;
  }>;
}

const EXPECTED_SHEETS = ['Pathologies', 'Symptoms', 'NursingInterventions', 'MedicalInterventions'];

export default function ClinicalDataImportPage(): React.ReactElement {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetRowCounts, setSheetRowCounts] = useState<Record<string, number>>({});

  // UI state
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Raw base64 data for upload
  const [fileBase64, setFileBase64] = useState<string>('');

  const resetState = () => {
    setFile(null);
    setSheetNames([]);
    setSheetRowCounts({});
    setParseError(null);
    setImportResult(null);
    setImportError(null);
    setFileBase64('');
    setShowConfirm(false);
  };

  const parseFile = async (selectedFile: File) => {
    resetState();
    setFile(selectedFile);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();

      // Convert to base64 for API upload
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      setFileBase64(btoa(binary));

      // Parse workbook to show preview
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      setSheetNames(workbook.SheetNames);

      // Count rows per sheet
      const counts: Record<string, number> = {};
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(sheet);
        counts[name] = data.length;
      }
      setSheetRowCounts(counts);

      // Validate expected sheets
      const missingSheets = EXPECTED_SHEETS.filter(
        (s) => !workbook.SheetNames.some((ws) => ws.toLowerCase() === s.toLowerCase())
      );
      if (missingSheets.length > 0) {
        setParseError(
          `Feuilles manquantes: ${missingSheets.join(', ')}. Le fichier doit contenir les feuilles: ${EXPECTED_SHEETS.join(', ')}`
        );
      }
    } catch (err) {
      console.error('Parse error:', err);
      setParseError('Erreur lors de la lecture du fichier. Vérifiez le format.');
    }
  };

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
      if (ext === 'xlsx') {
        parseFile(droppedFile);
      } else {
        setParseError('Format non supporté. Utilisez un fichier .xlsx');
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
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const api = await getApi();
      const response = await api.post(API_ROUTES.clinicalData.import, { file: fileBase64 });
      setImportResult(response.data);
      setShowConfirm(false);
    } catch (err: unknown) {
      console.error('Import error:', err);
      const axiosError = err as { response?: { data?: { error?: string } } };
      setImportError(axiosError.response?.data?.error || "Erreur lors de l'importation");
      setShowConfirm(false);
    } finally {
      setIsImporting(false);
    }
  };

  const canImport = file && fileBase64 && !parseError;
  const totalRows = Object.values(sheetRowCounts).reduce((sum, c) => sum + c, 0);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(CLIENT_ROUTES.admin.clinicalData)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Import de Données Cliniques</h1>
            <p className="text-gray-600 mt-1">
              Importez les pathologies, symptômes et interventions depuis un fichier Excel structuré
            </p>
          </div>
        </div>

        {/* Import Result */}
        {importResult && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <CheckCircle className="h-8 w-8 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-800 mb-3">Import terminé</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700">
                        <strong>{importResult.imported.pathologies}</strong> pathologies
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700">
                        <strong>{importResult.imported.symptoms}</strong> symptômes
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Syringe className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700">
                        <strong>{importResult.imported.nursingInterventions}</strong> int. inf.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700">
                        <strong>{importResult.imported.medicalInterventions}</strong> int. méd.
                      </span>
                    </div>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-medium text-amber-800 mb-2">
                        {importResult.errors.length} erreur{importResult.errors.length !== 1 ? 's' : ''} de validation:
                      </p>
                      <ul className="space-y-1 max-h-40 overflow-y-auto">
                        {importResult.errors.map((err, idx) => (
                          <li key={idx} className="text-xs text-amber-700 flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>
                              <strong>{err.sheet}</strong> (ligne {err.row}): {err.message}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={resetState}>
                      Importer un autre fichier
                    </Button>
                    <Button onClick={() => navigate(CLIENT_ROUTES.admin.clinicalData)}>
                      Voir les données
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!importResult && (
          <>
            {/* Expected Format Info */}
            <Card className="mb-6 border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-800 mb-2">Format attendu</h3>
                    <p className="text-sm text-blue-700 mb-2">
                      Le fichier Excel (.xlsx) doit contenir 4 feuilles:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-blue-600">
                      <div>
                        <strong>Pathologies:</strong> pathology_id, icd10_code, abcde_category, name_fr, triage_priority
                      </div>
                      <div>
                        <strong>Symptoms:</strong> pathology_id, symptom_code, symptom_fr, is_vital_sign
                      </div>
                      <div>
                        <strong>NursingInterventions:</strong> pathology_id, intervention_code, intervention_fr, priority_order
                      </div>
                      <div>
                        <strong>MedicalInterventions:</strong> pathology_id, intervention_code, intervention_fr, is_surgical, priority_order
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* File Upload */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Fichier source
                </CardTitle>
                <CardDescription>Format accepté: .xlsx</CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
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
                          {sheetNames.length} feuille{sheetNames.length !== 1 ? 's' : ''} - {totalRows} lignes au total
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
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="text-sm">{parseError}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sheet Preview */}
            {sheetNames.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Contenu du fichier</CardTitle>
                  <CardDescription>Feuilles détectées dans le fichier Excel</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {sheetNames.map((name) => {
                      const isExpected = EXPECTED_SHEETS.some((s) => s.toLowerCase() === name.toLowerCase());
                      return (
                        <div
                          key={name}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            isExpected ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isExpected ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <Info className="h-4 w-4 text-gray-400" />
                            )}
                            <span className={`text-sm font-medium ${isExpected ? 'text-green-800' : 'text-gray-600'}`}>
                              {name}
                            </span>
                          </div>
                          <Badge variant={isExpected ? 'default' : 'secondary'}>
                            {sheetRowCounts[name] || 0} lignes
                          </Badge>
                        </div>
                      );
                    })}
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
                {file
                  ? `${totalRows} lignes au total dans ${sheetNames.length} feuilles`
                  : 'Sélectionnez un fichier pour commencer'}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate(CLIENT_ROUTES.admin.clinicalData)}>
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

        {/* Confirmation Modal */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirm(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 z-10 p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-full bg-amber-100">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Confirmer l'importation</h3>
                  <p className="text-sm text-gray-500">Les données existantes seront remplacées</p>
                </div>
              </div>
              <p className="text-gray-600 mb-6">
                Cette action va <strong>remplacer toutes les données cliniques existantes</strong> (pathologies,
                symptômes et interventions) par le contenu du fichier importé. Les analyses patients seront
                recalculées.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>
                  Annuler
                </Button>
                <Button variant="destructive" className="flex-1" onClick={handleImport} disabled={isImporting}>
                  {isImporting ? 'Import...' : "Confirmer l'import"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
