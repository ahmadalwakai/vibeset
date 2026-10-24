import { expect } from 'vitest';
import { isIntegrationTestFile, isolatedIntegrationUrl } from '../helpers/integration-env';

// setupFiles run before the test module is imported: refuse unsafe endpoints before fixture code.
if (isIntegrationTestFile(expect.getState().testPath)) isolatedIntegrationUrl(process.env);
