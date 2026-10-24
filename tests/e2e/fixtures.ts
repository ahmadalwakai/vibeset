import { test as base, expect, devices, type BrowserContext } from '@playwright/test';
import { authState, projectName, readManifest } from './runtime';
import type { E2eManifest, E2eRole } from './manifest';

type Fixtures = {
  role: E2eRole | 'visitor';
  roleContext: (role: E2eRole) => Promise<BrowserContext>;
};
type Workers = { manifest: E2eManifest };
export const test = base.extend<Fixtures, Workers>({
  role: ['visitor', { option: true }],
  manifest: [
    async ({}, provide, info) => {
      // Better Auth counts one shared IP/path until ten seconds of inactivity.
      // Each device runs many fresh contexts; separate their traffic without
      // changing application limits or deleting limiter records.
      process.stdout.write(`Waiting for the auth inactivity window before ${info.project.name}.\n`);
      await new Promise<void>((resolve) => setTimeout(resolve, 11_000));
      await provide(readManifest());
    },
    { scope: 'worker' },
  ],
  storageState: async ({ role }, provide, info) => {
    await provide(authState(projectName(info.project.name), role));
  },
  roleContext: async ({ browser, context, manifest }, provide, info) => {
    const contexts: BrowserContext[] = [];
    await provide(async (role) => {
      const state = authState(projectName(info.project.name), role);
      const device =
        devices[
          info.project.name === 'iphone'
            ? 'iPhone 15'
            : info.project.name === 'android'
              ? 'Pixel 7'
              : 'Desktop Chrome'
        ];
      const created = await browser.newContext({
        ...device,
        baseURL: manifest.baseURL,
        storageState: state,
        locale: 'en-GB',
        reducedMotion: 'reduce',
        viewport: context.pages()[0]?.viewportSize() ?? undefined,
      });
      contexts.push(created);
      return created;
    });
    await Promise.all(contexts.map((created) => created.close()));
  },
});
export { expect };
