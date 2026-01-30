export const API_ROUTES = {
  auth: {
    login: '/auth/login',
    verify: '/auth/verify',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    cleanupTokens: '/auth/cleanup-tokens',
  },

  users: {
    list: '/users',
    create: '/users',
    byId: (id: number | string) => `/users/${id}`,
    update: (id: number | string) => `/users/${id}`,
    resetPassword: (id: number | string) => `/users/${id}/reset-password`,
    byRole: (role: string) => `/users/by-role/${role}`,
  },

  config: {
    er: '/config/er',
    boxes: '/config/boxes',
  },

  schedule: {
    byWeek: (weekStart: string) => `/schedule/${weekStart}`,
    save: (weekStart: string) => `/schedule/${weekStart}`,
    validate: (weekStart: string) => `/schedule/${weekStart}/validate`,
    myAssignment: '/schedule/my-assignment',
  },

  boxAssignments: {
    list: '/box-assignments',
    create: '/box-assignments',
    remove: (id: number | string) => `/box-assignments/${id}`,
    myAssignment: '/box-assignments/my-assignment',
    currentDoctor: (boxId: number | string) => `/box-assignments/current-doctor/${boxId}`,
    endingSoon: '/box-assignments/ending-soon',
  },

  patients: {
    list: '/patients',
    create: '/patients',
    byId: (id: number | string) => `/patients/${id}`,
    update: (id: number | string) => `/patients/${id}`,
    startTriage: (id: number | string) => `/patients/${id}/start-triage`,
    vitals: (id: number | string) => `/patients/${id}/vitals`,
    abcde: (id: number | string, category: string) => `/patients/${id}/abcde/${category}`,
    esi: (id: number | string) => `/patients/${id}/esi`,
    completeTriage: (id: number | string) => `/patients/${id}/complete-triage`,
    analyzeFindings: (id: number | string) => `/patients/${id}/analyze-findings`,
    analysis: (id: number | string) => `/patients/${id}/analysis`,
    suggestOrientation: (id: number | string) => `/patients/${id}/suggest-orientation`,
    startTreatment: (id: number | string) => `/patients/${id}/start-treatment`,
    updateStatus: (id: number | string) => `/patients/${id}/status`,
    discharge: (id: number | string) => `/patients/${id}/discharge`,
    requestRetriage: (id: number | string) => `/patients/${id}/request-retriage`,
    notes: (id: number | string) => `/patients/${id}/notes`,
    transferToDoctor: (id: number | string) => `/patients/${id}/transfer-to-doctor`,
    aiPrediagnosis: (id: number | string) => `/patients/${id}/ai-prediagnosis`,
    aiStatus: (id: number | string) => `/patients/${id}/ai-status`,
    aiPrediagnosisStream: (id: number | string) => `/patients/${id}/ai-prediagnosis-stream`,
  },

  prescriptions: {
    create: '/prescriptions',
    byId: (id: number | string) => `/prescriptions/${id}`,
    byPatient: (patientId: number | string) => `/prescriptions/patient/${patientId}`,
    administer: (id: number | string) => `/prescriptions/${id}/administer`,
    cancel: (id: number | string) => `/prescriptions/${id}/cancel`,
    hold: (id: number | string) => `/prescriptions/${id}/hold`,
    resume: (id: number | string) => `/prescriptions/${id}/resume`,
    complete: (id: number | string) => `/prescriptions/${id}/complete`,
  },

  diagnoses: {
    create: '/diagnoses',
    byId: (id: number | string) => `/diagnoses/${id}`,
    update: (id: number | string) => `/diagnoses/${id}`,
    byPatient: (patientId: number | string) => `/diagnoses/patient/${patientId}`,
    confirm: (id: number | string) => `/diagnoses/${id}/confirm`,
    ruleOut: (id: number | string) => `/diagnoses/${id}/rule-out`,
  },

  pathologies: {
    list: '/pathologies',
    create: '/pathologies',
    search: '/pathologies/search',
    categories: '/pathologies/categories',
    orientations: '/pathologies/orientations',
    import: '/pathologies/import',
    byId: (id: number | string) => `/pathologies/${id}`,
    update: (id: number | string) => `/pathologies/${id}`,
    remove: (id: number | string) => `/pathologies/${id}`,
  },

  interventions: {
    list: '/interventions',
    create: '/interventions',
    categories: '/interventions/categories',
    import: '/interventions/import',
    byPathology: (name: string) => `/interventions/by-pathology/${name}`,
    update: (id: number | string) => `/interventions/${id}`,
    remove: (id: number | string) => `/interventions/${id}`,
  },

  stats: {
    dashboard: '/stats/dashboard',
    queues: '/stats/queues',
    export: '/stats/export',
  },

  sync: {
    sync: '/sync',
  },

  auditLog: {
    list: '/audit-log',
    users: '/audit-log/users',
    export: '/audit-log/export',
  },

  notifications: {
    list: '/notifications',
    unreadCount: '/notifications/unread-count',
    markRead: (id: number | string) => `/notifications/${id}/read`,
    markAllRead: '/notifications/read-all',
    remove: (id: number | string) => `/notifications/${id}`,
    clearRead: '/notifications/clear-read',
    cleanup: '/notifications/cleanup',
  },

  tracking: {
    board: '/tracking/board',
    stats: '/tracking/stats',
  },

  health: '/health',
} as const;
