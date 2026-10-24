import { pathToFileURL } from 'node:url';
import { runSeedCommand } from './seed-runner';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void runSeedCommand('apps');
