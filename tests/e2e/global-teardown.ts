import { rm } from 'node:fs/promises';
import { authDirectory } from './runtime';

/** The root orchestrator owns database/storage cleanup, including failed setup. */
export default async function globalTeardown(): Promise<void> {
  await rm(authDirectory(), { recursive: true, force: true });
}
