import { assertNativeBuildEnvironment } from '../lib/build-config';

try {
  assertNativeBuildEnvironment(process.env);
  process.stdout.write(
    'Native identifiers and public HTTPS origins are configured; account ownership and live reachability still require verification.\n',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Native build configuration is invalid.');
  process.exitCode = 1;
}
