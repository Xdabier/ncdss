/**
 * Loads .env file into process.env.
 * Must be imported FIRST in index.ts (before any other module reads process.env).
 * Only sets vars that aren't already set, so CLI overrides still win.
 *
 * Searches multiple locations so it works both in dev (cwd) and in
 * packaged Electron builds (next to the .exe / in resources).
 */
import fs from 'fs';
import path from 'path';

function loadEnvFrom(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    // Never let .env override NODE_ENV in a packaged app
    if (key === 'NODE_ENV' && !process.defaultApp) continue;
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
  console.log(`[Env] Loaded .env from ${filePath}`);
  return true;
}

// Candidate directories, in priority order:
const candidates = [
  process.cwd(),                                    // dev: project root
  path.dirname(process.execPath),                    // packaged: next to the .exe
  path.join(path.dirname(process.execPath), '..'),   // packaged: one level up from exe
  path.join(__dirname, '../..'),                      // relative to dist-electron/main/
  path.join(path.dirname(process.execPath), 'resources'), // packaged: resources/ folder
  process.env.PORTABLE_EXECUTABLE_DIR,               // portable exe extraction dir
].filter(Boolean) as string[];

// Also check Electron userData (%APPDATA%/ncdss-server)
const appData = process.env.APPDATA || process.env.HOME;
if (appData) {
  candidates.push(path.join(appData, 'ncdss-server'));
}

for (const dir of candidates) {
  if (loadEnvFrom(path.join(dir, '.env'))) break;
}
