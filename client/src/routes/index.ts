export const CLIENT_ROUTES = {
  home: '/',
  login: '/login',
  lock: '/lock',
  dashboard: '/dashboard',
  profile: '/profile',

  admin: {
    erConfig: '/admin/er-config',
    users: '/admin/users',
    userNew: '/admin/users/new',
    userEdit: (id: string | number) => `/admin/users/${id}/edit`,
    userResetPassword: (id: string | number) => `/admin/users/${id}/reset-password`,
    boxes: '/admin/boxes',
    boxAssignments: '/admin/box-assignments',
    clinicalData: '/admin/clinical-data',
    clinicalDataImport: '/admin/clinical-data/import',
    audit: '/admin/audit',
  },

  supervisor: {
    schedule: '/supervisor/schedule',
    stats: '/supervisor/stats',
    queue: '/supervisor/queue',
    patients: '/supervisor/patients',
    patientDetail: (id: string | number) => `/supervisor/patients/${id}`,
  },

  nurse: {
    inscription: {
      home: '/nurse/inscription',
      register: '/nurse/inscription/register',
    },
    triage: {
      queue: '/nurse/triage',
      abcde: (id: string | number) => `/nurse/triage/${id}/abcde`,
    },
    treatment: {
      queue: '/nurse/treatment',
      patientCare: (id: string | number) => `/nurse/treatment/${id}`,
      vitals: (id: string | number) => `/nurse/treatment/${id}/vitals`,
      assignBox: (id: string | number) => `/nurse/treatment/${id}/assign-box`,
      retriage: (id: string | number) => `/nurse/treatment/${id}/retriage`,
      alert: (id: string | number) => `/nurse/treatment/${id}/alert`,
    },
  },

  doctor: {
    patients: '/doctor/patients',
    patientDetail: (id: string | number) => `/doctor/patients/${id}`,
    abcdeReview: (id: string | number) => `/doctor/patients/${id}/abcde`,
  },

  shared: {
    patientDetail: (id: string | number) => `/patients/${id}`,
    trackingBoard: '/tracking-board',
  },
} as const;
