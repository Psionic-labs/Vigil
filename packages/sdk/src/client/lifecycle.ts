/**
 * @file lifecycle.ts
 * @description Manages teardown callbacks for the SDK to ensure idempotent shutdowns.
 * Every detector and timer must register its cleanup function here.
 */
export interface LifecycleManager {
  addCleanup: (fn: () => void) => void;
  cleanupAll: () => void;
}

export function createLifecycleManager(): LifecycleManager {
  const cleanups: (() => void)[] = [];

  return {
    addCleanup(fn: () => void) {
      if (typeof fn === "function") {
        cleanups.push(fn);
      }
    },
    cleanupAll() {
      // Execute in reverse order
      while (cleanups.length > 0) {
        const fn = cleanups.pop();
        try {
          if (fn) fn();
        } catch {
          // Ignore cleanup errors to ensure the rest run
        }
      }
    },
  };
}
