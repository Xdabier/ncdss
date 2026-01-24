import { Router } from 'express';
import { getDb } from '../../database';
import { syncLog } from '../../database/schema';
import { randomUUID } from 'crypto';
import { SyncRequest, SyncResponse, SyncChange } from '@ncdss/shared';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { clientId, lastSyncAt, changes } = req.body as SyncRequest;
    const db = getDb();

    // Process client changes
    for (const change of changes) {
      await processChange(change, clientId);
    }

    // Get server changes since last sync
    const serverChanges = await getServerChanges(lastSyncAt, clientId);

    const response: SyncResponse = {
      serverChanges,
      syncedAt: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Erreur de synchronisation' });
  }
});

async function processChange(change: SyncChange, clientId: string) {
  const db = getDb();

  // Log the sync
  await db.insert(syncLog).values({
    id: randomUUID(),
    clientId,
    tableName: change.table,
    recordId: change.recordId,
    operation: change.operation,
    syncedAt: new Date().toISOString(),
  });

  // TODO: Actually apply changes to respective tables
  // This will be implemented per-table in Week 2
}

async function getServerChanges(
  lastSyncAt: string,
  excludeClientId: string
): Promise<SyncChange[]> {
  // TODO: Query all tables for changes since lastSyncAt
  // Exclude changes that came from the requesting client
  return [];
}

export { router as syncRouter };
