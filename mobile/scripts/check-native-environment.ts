import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { assertNativeBuildEnvironment, assertNativeCompileEnvironment } from '../lib/build-config';

try {
  const args = process.argv.slice(2);
  const compileOnly = args[0] === '--compile-only';
  const prebuild = compileOnly && args[1] === '--prebuild';
  if ((args.length > 0 && !compileOnly) || args.length > (prebuild ? 2 : 1))
    throw new Error('Use no arguments for beta checks, or --compile-only [--prebuild].');
  if (compileOnly) assertNativeCompileEnvironment(process.env);
  else assertNativeBuildEnvironment(process.env);
  process.stdout.write(
    compileOnly
      ? 'Compile-only native configuration passed; this does not verify registered identifiers, service reachability, beta readiness or signing.\n'
      : 'Native identifiers and public HTTPS origins are configured; account ownership and live reachability still require verification.\n',
  );
  if (prebuild) {
    const require = createRequire(import.meta.url);
    const result = spawnSync(
      process.execPath,
      [require.resolve('expo/bin/cli'), 'prebuild', '--platform', 'ios', '--no-install'],
      { stdio: 'inherit', env: { ...process.env, VIBESET_NATIVE_GENERATE: 'compile' } },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Native build configuration is invalid.');
  process.exitCode = 1;
}
