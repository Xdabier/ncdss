import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShutdownCoordinator, shutdownApplication } from './shutdown';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('coalesces overlapping shutdowns and allows a later shutdown', async () => {
  const first = deferred();
  const second = deferred();
  const gates = [first, second];
  let calls = 0;
  const coordinator = createShutdownCoordinator(() => gates[calls++].promise);

  const firstRun = coordinator.run();
  const overlappingRun = coordinator.run();
  assert.equal(overlappingRun, firstRun);
  assert.equal(calls, 0);

  let waitCompleted = false;
  const wait = coordinator.waitForCurrent().then(() => {
    waitCompleted = true;
  });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(waitCompleted, false);
  first.resolve();
  await Promise.all([firstRun, wait]);
  assert.equal(waitCompleted, true);

  const laterRun = coordinator.run();
  assert.notEqual(laterRun, firstRun);
  await Promise.resolve();
  assert.equal(calls, 2);
  second.resolve();
  await laterRun;
});

test('waits for each asynchronous shutdown step before continuing', async () => {
  const monitor = deferred();
  const server = deferred();
  const provider = deferred();
  const logger = deferred();
  const monitorStarted = deferred();
  const serverStarted = deferred();
  const providerStarted = deferred();
  const loggerStarted = deferred();
  const events: string[] = [];

  const shutdown = shutdownApplication({
    stopShiftMonitor: () => {
      events.push('monitor:start');
      monitorStarted.resolve();
      return monitor.promise.then(() => {
        events.push('monitor:end');
      });
    },
    stopServer: () => {
      events.push('server:start');
      serverStarted.resolve();
      return server.promise.then(() => {
        events.push('server:end');
      });
    },
    disposeLLMProvider: () => {
      events.push('provider:start');
      providerStarted.resolve();
      return provider.promise.then(() => {
        events.push('provider:end');
      });
    },
    closeDatabase: () => {
      events.push('database');
    },
    closeLogger: () => {
      events.push('logger:start');
      loggerStarted.resolve();
      return logger.promise.then(() => {
        events.push('logger:end');
      });
    },
    onError: (step, error) => assert.fail(`Unexpected ${step} error: ${String(error)}`),
    quit: () => {
      events.push('quit');
    },
  });

  await monitorStarted.promise;
  assert.deepEqual(events, ['monitor:start']);
  monitor.resolve();

  await serverStarted.promise;
  assert.deepEqual(events, ['monitor:start', 'monitor:end', 'server:start']);
  server.resolve();

  await providerStarted.promise;
  assert.deepEqual(events, [
    'monitor:start',
    'monitor:end',
    'server:start',
    'server:end',
    'provider:start',
  ]);
  provider.resolve();

  await loggerStarted.promise;
  assert.deepEqual(events, [
    'monitor:start',
    'monitor:end',
    'server:start',
    'server:end',
    'provider:start',
    'provider:end',
    'database',
    'logger:start',
  ]);
  logger.resolve();

  await shutdown;
  assert.deepEqual(events, [
    'monitor:start',
    'monitor:end',
    'server:start',
    'server:end',
    'provider:start',
    'provider:end',
    'database',
    'logger:start',
    'logger:end',
    'quit',
  ]);
});

test('continues cleanup and quits after a shutdown step fails', async () => {
  const errors: string[] = [];
  const events: string[] = [];

  await shutdownApplication({
    stopShiftMonitor: async () => {
      throw new Error('monitor close failed');
    },
    stopServer: async () => {
      throw new Error('server close failed');
    },
    disposeLLMProvider: async () => {
      events.push('provider');
      throw new Error('provider dispose failed');
    },
    closeDatabase: () => {
      events.push('database');
    },
    closeLogger: async () => {
      events.push('logger');
      throw new Error('logger flush failed');
    },
    onError: (step) => {
      errors.push(step);
    },
    quit: () => {
      events.push('quit');
    },
  });

  assert.deepEqual(errors, [
    'stop shift monitor',
    'stop server',
    'dispose LLM provider',
    'close logger',
  ]);
  assert.deepEqual(events, ['provider', 'database', 'logger', 'quit']);
});
