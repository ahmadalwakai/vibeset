import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  e2eManifestSchema,
  E2E_PROJECT_NAMES,
  E2E_ROLES,
  type E2eManifest,
  type E2eProjectName,
  type E2eRole,
} from './manifest';

function assertCanonicalPath(
  target: string,
  kind: 'directory' | 'file',
  allowMissing = false,
): void {
  try {
    const entry = lstatSync(target);
    if (
      entry.isSymbolicLink() ||
      (kind === 'directory' ? !entry.isDirectory() : !entry.isFile()) ||
      path.relative(target, realpathSync(target)) !== ''
    )
      throw new Error('Noncanonical E2E path');
  } catch (error) {
    if (allowMissing && error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return;
    throw new Error('E2E paths must resolve to their owned files and directories');
  }
}

export function manifestPath(): string {
  const raw = process.env.E2E_MANIFEST_PATH;
  if (!raw) throw new Error('E2E_MANIFEST_PATH must point to a prepared disposable run');
  const target = path.resolve(raw);
  const root = path.resolve('.tmp/e2e');
  const parts = path.relative(root, target).split(path.sep);
  const runId = e2eManifestSchema.shape.runId.safeParse(parts[0]);
  if (parts.length !== 2 || !runId.success || parts[1] !== 'manifest.json')
    throw new Error('The E2E manifest must be exactly .tmp/e2e/<UUID>/manifest.json');
  assertCanonicalPath(root, 'directory');
  assertCanonicalPath(path.dirname(target), 'directory');
  assertCanonicalPath(target, 'file');
  return target;
}
export function readManifest(): E2eManifest {
  if (process.env.VERCEL_ENV === 'production')
    throw new Error('Production E2E execution is refused');
  const target = manifestPath();
  if (statSync(target).size > 128 * 1024) throw new Error('E2E manifest is oversized');
  let manifest: E2eManifest;
  try {
    manifest = e2eManifestSchema.parse(JSON.parse(readFileSync(target, 'utf8')));
  } catch {
    throw new Error('Invalid disposable E2E manifest');
  }
  const expected = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000');
  if (expected.origin !== new URL(manifest.baseURL).origin)
    throw new Error('E2E base URL does not match the prepared deployment');
  if (path.basename(path.dirname(target)) !== manifest.runId)
    throw new Error('E2E manifest directory does not match its run');
  return manifest;
}
export function projectName(value: string): E2eProjectName {
  const found = E2E_PROJECT_NAMES.find((project) => project === value);
  if (!found) throw new Error('Unknown E2E browser project');
  return found;
}
export function authDirectory(): string {
  const manifest = readManifest();
  const directory = path.resolve('.tmp', 'e2e', manifest.runId, 'auth');
  assertCanonicalPath(directory, 'directory', true);
  return directory;
}
export function authState(project: E2eProjectName, role: E2eRole | 'visitor'): string {
  projectName(project);
  if (role !== 'visitor' && !E2E_ROLES.some((candidate) => candidate === role))
    throw new Error('Unknown E2E account role');
  const file = path.join(authDirectory(), `${project}-${role}.json`);
  assertCanonicalPath(file, 'file', true);
  return file;
}
