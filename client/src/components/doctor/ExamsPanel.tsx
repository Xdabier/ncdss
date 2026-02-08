import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { getApi } from '../../services/api';
import {
  ComplementaryExam,
  ExamType,
  ExamStatus,
  ExamPriority,
  ExamSource,
  API_ROUTES,
} from '@ncdss/shared';
import {
  FlaskConical,
  Plus,
  X,
  RefreshCw,
  Edit3,
  Ban,
  CheckCircle,
  Clock,
  AlertTriangle,
  Zap,
  ClipboardList,
} from 'lucide-react';
import { formatDateTime } from '../../utils/dateUtils';

// ============================================================================
// French Labels
// ============================================================================

const examTypeLabels: Record<ExamType, string> = {
  [ExamType.IMAGING]: 'Imagerie',
  [ExamType.BLOOD_WORK]: 'Bilan sanguin',
  [ExamType.SAMPLE]: 'Prélèvement',
  [ExamType.OTHER]: 'Autre',
};

const examTypeColors: Record<ExamType, string> = {
  [ExamType.IMAGING]: 'bg-purple-100 text-purple-800',
  [ExamType.BLOOD_WORK]: 'bg-blue-100 text-blue-800',
  [ExamType.SAMPLE]: 'bg-orange-100 text-orange-800',
  [ExamType.OTHER]: 'bg-gray-100 text-gray-800',
};

const examStatusLabels: Record<ExamStatus, string> = {
  [ExamStatus.REQUESTED]: 'Demandé',
  [ExamStatus.IN_PROGRESS]: 'En cours',
  [ExamStatus.COMPLETED]: 'Terminé',
  [ExamStatus.CANCELLED]: 'Annulé',
};

const examStatusColors: Record<ExamStatus, string> = {
  [ExamStatus.REQUESTED]: 'bg-yellow-100 text-yellow-800',
  [ExamStatus.IN_PROGRESS]: 'bg-blue-100 text-blue-800',
  [ExamStatus.COMPLETED]: 'bg-green-100 text-green-800',
  [ExamStatus.CANCELLED]: 'bg-red-100 text-red-800',
};

// ============================================================================
// Props
// ============================================================================

interface ExamsPanelProps {
  patientId: string;
  aiRecommendedTests?: string[];
}

// ============================================================================
// AI Quick-Order Popover
// ============================================================================

interface AIQuickOrderProps {
  testName: string;
  patientId: string;
  onSuccess: () => void;
  onClose: () => void;
}

function AIQuickOrderPopover({ testName, patientId, onSuccess, onClose }: AIQuickOrderProps) {
  const [examType, setExamType] = useState<ExamType | ''>('');
  const [priority, setPriority] = useState<ExamPriority>(ExamPriority.NORMAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!examType) {
      setError("Sélectionnez un type d'examen");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.exams.create, {
        patientId,
        examName: testName,
        examType,
        priority,
        source: ExamSource.AI_RECOMMENDATION,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de la demande');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold">Demander l'examen</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="p-2 bg-blue-50 rounded text-sm font-medium text-blue-900">
            {testName}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label className="text-xs">Type d'examen *</Label>
            <Select value={examType} onValueChange={(v) => setExamType(v as ExamType)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(examTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Priorité</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                size="sm"
                variant={priority === ExamPriority.NORMAL ? 'default' : 'outline'}
                onClick={() => setPriority(ExamPriority.NORMAL)}
                className="flex-1"
              >
                Normal
              </Button>
              <Button
                type="button"
                size="sm"
                variant={priority === ExamPriority.URGENT ? 'destructive' : 'outline'}
                onClick={() => setPriority(ExamPriority.URGENT)}
                className="flex-1"
              >
                Urgent
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              Demander
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Exam Request Modal
// ============================================================================

interface ExamRequestModalProps {
  patientId: string;
  onClose: () => void;
  onSuccess: () => void;
  editExam?: ComplementaryExam | null;
}

function ExamRequestModal({ patientId, onClose, onSuccess, editExam }: ExamRequestModalProps) {
  const [examName, setExamName] = useState(editExam?.examName || '');
  const [examType, setExamType] = useState<ExamType | ''>(editExam?.examType as ExamType || '');
  const [priority, setPriority] = useState<ExamPriority>(
    (editExam?.priority as ExamPriority) || ExamPriority.NORMAL
  );
  const [notes, setNotes] = useState(editExam?.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!examName.trim()) {
      setError("Le nom de l'examen est requis");
      return;
    }
    if (!examType) {
      setError("Le type d'examen est requis");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();

      if (editExam) {
        await api.put(API_ROUTES.exams.update(editExam.id), {
          examName: examName.trim(),
          examType,
          priority,
          notes: notes.trim() || undefined,
        });
      } else {
        await api.post(API_ROUTES.exams.create, {
          patientId,
          examName: examName.trim(),
          examType,
          priority,
          source: ExamSource.DOCTOR,
          notes: notes.trim() || undefined,
        });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {editExam ? "Modifier l'examen" : 'Demander un examen'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="examName">Nom de l'examen *</Label>
            <Input
              id="examName"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="Ex: Radio thorax, NFS, ECG..."
              className="mt-1"
            />
          </div>

          <div>
            <Label>Type d'examen *</Label>
            <Select value={examType} onValueChange={(v) => setExamType(v as ExamType)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sélectionner le type..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(examTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Priorité</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                size="sm"
                variant={priority === ExamPriority.NORMAL ? 'default' : 'outline'}
                onClick={() => setPriority(ExamPriority.NORMAL)}
                className="flex-1"
              >
                Normal
              </Button>
              <Button
                type="button"
                size="sm"
                variant={priority === ExamPriority.URGENT ? 'destructive' : 'outline'}
                onClick={() => setPriority(ExamPriority.URGENT)}
                className="flex-1"
              >
                Urgent
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="examNotes">Notes (optionnel)</Label>
            <textarea
              id="examNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instructions complémentaires..."
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : editExam ? (
                'Enregistrer'
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Demander
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// ExamsPanel Component
// ============================================================================

export function ExamsPanel({ patientId, aiRecommendedTests }: ExamsPanelProps) {
  const [exams, setExams] = useState<ComplementaryExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editingExam, setEditingExam] = useState<ComplementaryExam | null>(null);
  const [aiQuickOrder, setAiQuickOrder] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.exams.byPatient(patientId));
      setExams(response.data);
    } catch (err: any) {
      console.error('Error loading exams:', err);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Check if an AI test is already requested
  const isTestAlreadyRequested = (testName: string): boolean => {
    const normalizedTest = testName.toLowerCase().trim();
    return exams.some(
      (exam) =>
        exam.examName.toLowerCase().trim() === normalizedTest &&
        exam.status !== ExamStatus.CANCELLED
    );
  };

  // Cancel exam handler
  const handleCancelExam = async (examId: string) => {
    setActionLoading(`cancel-${examId}`);
    try {
      const api = await getApi();
      await api.put(API_ROUTES.exams.updateStatus(examId), {
        status: ExamStatus.CANCELLED,
      });
      await loadExams();
    } catch (err: any) {
      console.error('Error cancelling exam:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const activeExams = exams.filter((e) => e.status !== ExamStatus.CANCELLED);
  const filteredAiTests = aiRecommendedTests?.filter(Boolean) || [];

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-gray-500" />
              Examens complémentaires
              {activeExams.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {activeExams.length}
                </Badge>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setShowRequestModal(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Demander
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* AI Recommended Exams Section */}
          {filteredAiTests.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <FlaskConical className="h-4 w-4 text-blue-500" />
                Examens recommandés par l'IA
              </div>
              <div className="space-y-1.5">
                {filteredAiTests.map((test, index) => {
                  const alreadyRequested = isTestAlreadyRequested(test);
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-100"
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-sm text-blue-900">{test}</span>
                      </div>
                      {alreadyRequested ? (
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Déjà demandé
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                          onClick={() => setAiQuickOrder(test)}
                        >
                          Demander
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ordered Exams List */}
          {loading ? (
            <div className="flex justify-center py-4">
              <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : exams.length === 0 ? (
            <p className="text-gray-500 text-sm italic text-center py-4">
              Aucun examen demandé
            </p>
          ) : (
            <div className="space-y-3">
              {filteredAiTests.length > 0 && exams.length > 0 && (
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  Examens demandés
                  <Badge variant="secondary" className="text-xs">
                    {exams.length}
                  </Badge>
                </div>
              )}
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className={`p-3 rounded-lg border ${
                    exam.status === ExamStatus.CANCELLED
                      ? 'border-red-200 bg-red-50 opacity-75'
                      : exam.status === ExamStatus.COMPLETED
                        ? 'border-green-200 bg-green-50'
                        : exam.priority === ExamPriority.URGENT
                          ? 'border-red-200 bg-red-50'
                          : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className={`font-medium ${
                          exam.status === ExamStatus.CANCELLED
                            ? 'text-gray-500 line-through'
                            : 'text-gray-900'
                        }`}
                      >
                        {exam.examName}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            examTypeColors[exam.examType as ExamType]
                          }`}
                        >
                          {examTypeLabels[exam.examType as ExamType] || exam.examType}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            examStatusColors[exam.status as ExamStatus]
                          }`}
                        >
                          {examStatusLabels[exam.status as ExamStatus] || exam.status}
                        </span>
                        {exam.priority === ExamPriority.URGENT && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            <AlertTriangle className="h-3 w-3 mr-0.5" />
                            Urgent
                          </span>
                        )}
                        {exam.source === ExamSource.AI_RECOMMENDATION && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                            <Zap className="h-3 w-3 mr-0.5" />
                            IA
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {exam.notes && (
                    <p className="text-sm text-gray-600 mt-2 italic">{exam.notes}</p>
                  )}

                  {/* Results for completed exams */}
                  {exam.status === ExamStatus.COMPLETED && exam.results && (
                    <div className="mt-2 p-2 bg-white rounded border border-green-200">
                      <p className="text-xs font-medium text-green-700 mb-1">Résultats :</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{exam.results}</p>
                    </div>
                  )}

                  {/* Meta info */}
                  <div className="text-xs text-gray-400 mt-2">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {exam.requestedByName || 'Médecin'} - {formatDateTime(exam.requestedAt)}
                  </div>

                  {/* Action buttons for REQUESTED exams */}
                  {exam.status === ExamStatus.REQUESTED && (
                    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-200">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingExam(exam);
                          setShowRequestModal(true);
                        }}
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => handleCancelExam(exam.id)}
                        disabled={actionLoading === `cancel-${exam.id}`}
                      >
                        {actionLoading === `cancel-${exam.id}` ? (
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Ban className="h-3 w-3 mr-1" />
                        )}
                        Annuler
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exam Request Modal */}
      {showRequestModal && (
        <ExamRequestModal
          patientId={patientId}
          editExam={editingExam}
          onClose={() => {
            setShowRequestModal(false);
            setEditingExam(null);
          }}
          onSuccess={() => {
            setShowRequestModal(false);
            setEditingExam(null);
            loadExams();
          }}
        />
      )}

      {/* AI Quick Order Popover */}
      {aiQuickOrder && (
        <AIQuickOrderPopover
          testName={aiQuickOrder}
          patientId={patientId}
          onClose={() => setAiQuickOrder(null)}
          onSuccess={() => {
            setAiQuickOrder(null);
            loadExams();
          }}
        />
      )}
    </>
  );
}
