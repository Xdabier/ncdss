type ShutdownAction = () => void | Promise<void>;

interface ShutdownCoordinator {
  run: () => Promise<void>;
  waitForCurrent: () => Promise<void>;
}

interface ShutdownOptions {
  stopShiftMonitor: ShutdownAction;
  stopServer: ShutdownAction;
  disposeLLMProvider: ShutdownAction;
  closeDatabase: ShutdownAction;
  closeLogger: ShutdownAction;
  onError: (step: string, error: unknown) => void;
  quit?: () => void;
}

export function createShutdownCoordinator(action: () => Promise<void>): ShutdownCoordinator {
  let currentShutdown: Promise<void> | null = null;

  const run = (): Promise<void> => {
    if (currentShutdown) return currentShutdown;

    const shutdown = Promise.resolve().then(action);
    currentShutdown = shutdown;
    void shutdown.then(
      () => {
        if (currentShutdown === shutdown) currentShutdown = null;
      },
      () => {
        if (currentShutdown === shutdown) currentShutdown = null;
      }
    );
    return shutdown;
  };

  const waitForCurrent = async (): Promise<void> => {
    if (currentShutdown) await currentShutdown;
  };

  return { run, waitForCurrent };
}

export async function shutdownApplication({
  stopShiftMonitor,
  stopServer,
  disposeLLMProvider,
  closeDatabase,
  closeLogger,
  onError,
  quit,
}: ShutdownOptions): Promise<void> {
  const steps: Array<[string, ShutdownAction]> = [
    ['stop shift monitor', stopShiftMonitor],
    ['stop server', stopServer],
    ['dispose LLM provider', disposeLLMProvider],
    ['close database', closeDatabase],
    ['close logger', closeLogger],
  ];

  for (const [name, action] of steps) {
    try {
      await action();
    } catch (error) {
      onError(name, error);
    }
  }

  quit?.();
}
