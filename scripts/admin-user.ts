import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

type AdminCommand =
  { kind: 'grant' | 'revoke'; email: string; forceProduction: boolean } | { kind: 'list' };

const optionSchema = z.strictObject({
  grant: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  revoke: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  list: z.boolean().optional(),
  'force-production': z.boolean().optional(),
});

const usage =
  'Usage: scripts/admin-user.ts --grant <email> | --revoke <email> | --list [--force-production for mutations]';

export function parseAdminArgs(args: readonly string[]): AdminCommand {
  const { values, tokens } = parseArgs({
    args: [...args],
    options: {
      grant: { type: 'string' },
      revoke: { type: 'string' },
      list: { type: 'boolean' },
      'force-production': { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name)) throw new Error('Each option may be supplied only once');
    seen.add(token.name);
  }

  const options = optionSchema.parse(values);
  const commands = [
    options.grant !== undefined,
    options.revoke !== undefined,
    options.list === true,
  ];
  if (commands.filter(Boolean).length !== 1) throw new Error('Choose exactly one admin command');
  if (options.list) {
    if (options['force-production'])
      throw new Error('--force-production applies only to mutations');
    return { kind: 'list' };
  }

  const forceProduction = options['force-production'] === true;
  if (options.grant !== undefined) return { kind: 'grant', email: options.grant, forceProduction };
  if (options.revoke !== undefined)
    return { kind: 'revoke', email: options.revoke, forceProduction };
  throw new Error('Choose exactly one admin command');
}

async function main(): Promise<void> {
  let command: AdminCommand;
  try {
    command = parseAdminArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(`Invalid admin command arguments.\n${usage}\n`);
    process.exitCode = 1;
    return;
  }

  const { AppError } = await import('../server/errors');
  let closePool: (() => Promise<void>) | undefined;

  try {
    const { env } = await import('../lib/env.server');
    if (command.kind !== 'list' && env.VERCEL_ENV === 'production' && !command.forceProduction) {
      throw new AppError('FORBIDDEN', 'Production role changes require --force-production');
    }

    const { pool } = await import('../db/pool');
    closePool = () => pool.end();
    const { listAdmins, setRoleByEmail } = await import('../server/services/users');

    if (command.kind === 'list') {
      process.stdout.write(`${JSON.stringify(await listAdmins(), null, 2)}\n`);
      return;
    }

    const role = command.kind === 'grant' ? 'admin' : 'user';
    const { data } = await setRoleByEmail(command.email, role, 'system');
    process.stdout.write(
      data.changed
        ? `Role for ${data.email} changed to ${data.role}.\n`
        : `${data.email} already has role ${data.role}; no change made.\n`,
    );
  } catch (error) {
    process.stderr.write(
      error instanceof AppError
        ? `Admin command failed (${error.code}): ${error.message}\n`
        : 'Admin command failed. Check the database configuration and retry.\n',
    );
    process.exitCode = 1;
  } finally {
    if (closePool) {
      try {
        await closePool();
      } catch {
        process.stderr.write('Could not close the database pool cleanly.\n');
        process.exitCode = 1;
      }
    }
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
