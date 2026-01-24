import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import fs from 'node:fs';

// Custom plugin to copy migrations
function copyMigrations() {
  return {
    name: 'copy-migrations',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'src/database/migrations');
      const destDir = path.resolve(__dirname, 'dist-electron/main/migrations');
      
      if (fs.existsSync(srcDir)) {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        
        fs.cpSync(srcDir, destDir, { recursive: true });
        console.log('✓ Migrations copied to dist-electron/main/migrations');
      }
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          plugins: [copyMigrations()],
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'better-sqlite3'],
            },
          },
        },
      },
      {
        entry: 'src/main/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ncdss/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist-electron/renderer',
  },
});
