export interface SyncRequest {
  clientId: string;
  lastSyncAt: string;
  changes: SyncChange[];
}

export interface SyncChange {
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  recordId: string;
  data: Record<string, any>;
  updatedAt: string;
}

export interface SyncResponse {
  serverChanges: SyncChange[];
  syncedAt: string;
  conflicts?: SyncConflict[];
}

export interface SyncConflict {
  table: string;
  recordId: string;
  clientVersion: Record<string, any>;
  serverVersion: Record<string, any>;
  resolution: 'SERVER_WINS' | 'CLIENT_WINS';
}
