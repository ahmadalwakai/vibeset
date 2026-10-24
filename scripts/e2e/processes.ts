import type { ChildProcess } from 'node:child_process';

interface ExitResult {
  code: number;
  error?: Error;
}
interface TrackedChild {
  exited: boolean;
  result: Promise<ExitResult>;
}

/** Observe exits immediately, so shutdown never starts waiting after an exit was missed. */
export class E2eProcesses {
  private readonly children = new Map<ChildProcess, TrackedChild>();

  track(child: ChildProcess): ChildProcess {
    const state: TrackedChild = {
      exited: child.exitCode !== null || child.signalCode !== null,
      result: Promise.resolve({ code: child.exitCode ?? 1 }),
    };
    if (!state.exited)
      state.result = new Promise((resolve) => {
        child.once('exit', (code) => {
          state.exited = true;
          resolve({ code: code ?? 1 });
        });
        child.on('error', (error: Error) => {
          // A failed spawn has no running process. A failed kill does not prove exit.
          if (child.pid === undefined) {
            state.exited = true;
            resolve({ code: 1, error });
          }
        });
      });
    this.children.set(child, state);
    return child;
  }

  async completion(child: ChildProcess, signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) throw new Error('E2E interrupted');
    let onAbort: (() => void) | undefined;
    try {
      const result = await Promise.race([
        this.state(child).result,
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error('E2E interrupted'));
          signal?.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
      if (result.error) throw result.error;
      return result.code;
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }

  requestStop(except?: ChildProcess): void {
    for (const [child, state] of this.children)
      if (child !== except && !state.exited) this.signal(child, 'SIGTERM');
  }

  async stop(child: ChildProcess): Promise<void> {
    const state = this.state(child);
    if (state.exited) return;
    this.signal(child, 'SIGTERM');
    if (await this.waitForExit(state, 5000)) return;
    this.signal(child, 'SIGKILL');
    if (!(await this.waitForExit(state, 5000)))
      throw new Error('E2E child termination could not be confirmed');
  }

  async stopWork(except?: ChildProcess): Promise<void> {
    const results = await Promise.allSettled(
      [...this.children.keys()]
        .filter((child) => child !== except)
        .map((child) => this.stop(child)),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('E2E work termination could not be confirmed');
  }

  private state(child: ChildProcess): TrackedChild {
    const state = this.children.get(child);
    if (!state) throw new Error('Untracked E2E child process');
    return state;
  }

  private signal(child: ChildProcess, signal: NodeJS.Signals): void {
    try {
      child.kill(signal);
    } catch {
      // The exit observer, not kill()'s return value, determines cleanup safety.
    }
  }

  private async waitForExit(state: TrackedChild, timeoutMs: number): Promise<boolean> {
    if (state.exited) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        state.result.then(() => true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
