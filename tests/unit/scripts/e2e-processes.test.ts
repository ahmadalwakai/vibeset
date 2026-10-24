import { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { E2eProcesses } from '../../../scripts/e2e/processes';

function runningChild(): ChildProcess {
  const child = new ChildProcess();
  Object.defineProperty(child, 'pid', { value: 1234 });
  vi.spyOn(child, 'kill').mockReturnValue(true);
  return child;
}

function exit(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  Object.defineProperty(child, 'signalCode', { value: signal, configurable: true });
  child.emit('exit', null, signal);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('E2E direct-child shutdown boundary', () => {
  it('observes an exit before completion is awaited and never waits for a second exit', async () => {
    const processes = new E2eProcesses();
    const child = processes.track(runningChild());
    Object.defineProperty(child, 'exitCode', { value: 0, configurable: true });
    child.emit('exit', 0, null);
    await expect(processes.completion(child)).resolves.toBe(0);
    await processes.stopWork();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('treats a failed spawn as no running child without an unhandled error', async () => {
    const processes = new E2eProcesses();
    const child = processes.track(new ChildProcess());
    child.emit('error', new Error('Fixture spawn failure'));
    await expect(processes.completion(child)).rejects.toThrow('Fixture spawn failure');
    await expect(processes.stopWork()).resolves.toBeUndefined();
  });

  it('cancels the completion wait but still requires the actual exit before cleanup', async () => {
    vi.useFakeTimers();
    const processes = new E2eProcesses();
    const child = processes.track(runningChild());
    const controller = new AbortController();
    const completion = expect(processes.completion(child, controller.signal)).rejects.toThrow(
      'interrupted',
    );
    controller.abort();
    await completion;
    const stopped = expect(processes.stopWork()).rejects.toThrow('could not be confirmed');
    await vi.advanceTimersByTimeAsync(10_000);
    await stopped;
    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });

  it('escalates an unresponsive child and confirms its forced exit', async () => {
    vi.useFakeTimers();
    const processes = new E2eProcesses();
    const child = processes.track(runningChild());
    vi.mocked(child.kill).mockImplementation((signal) => {
      if (signal === 'SIGKILL') queueMicrotask(() => exit(child, 'SIGKILL'));
      return true;
    });
    const stopped = processes.stopWork();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(stopped).resolves.toBeUndefined();
    expect(child.signalCode).toBe('SIGKILL');
  });

  it('does not mistake a failed kill for exit and keeps the app alive for cache refresh', async () => {
    vi.useFakeTimers();
    const processes = new E2eProcesses();
    const app = processes.track(runningChild());
    const work = processes.track(runningChild());
    vi.mocked(work.kill).mockImplementation((signal) => {
      if (signal === 'SIGTERM') work.emit('error', new Error('Fixture kill failure'));
      else queueMicrotask(() => exit(work, 'SIGKILL'));
      return signal !== 'SIGTERM';
    });
    processes.requestStop(app);
    const stopped = processes.stopWork(app);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(stopped).resolves.toBeUndefined();
    expect(app.kill).not.toHaveBeenCalled();
    expect(work.signalCode).toBe('SIGKILL');
    vi.mocked(app.kill).mockImplementation(() => {
      queueMicrotask(() => exit(app));
      return true;
    });
    await processes.stop(app);
    expect(app.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
