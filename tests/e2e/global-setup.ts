import { mkdir } from 'node:fs/promises';
import { chromium, webkit, devices, type FullConfig, type BrowserType } from '@playwright/test';
import { E2E_ROLES } from './manifest';
import { authDirectory, authState, projectName, readManifest } from './runtime';
import { preparePreviewAccess } from './network';
import { assertDeployment, E2eSignInError, signIn } from './auth';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const manifest = readManifest();
  await mkdir(authDirectory(), { recursive: true });
  const selected = process.env.E2E_PROJECT_FILTER;
  if (selected) projectName(selected);
  for (const project of config.projects.filter((entry) => !selected || entry.name === selected)) {
    const name = projectName(project.name);
    const browserType: BrowserType = name === 'iphone' ? webkit : chromium;
    const device =
      devices[name === 'iphone' ? 'iPhone 15' : name === 'android' ? 'Pixel 7' : 'Desktop Chrome'];
    if (!device) throw new Error('Required Playwright device is unavailable');
    const browser = await browserType.launch();
    try {
      const visitor = await browser.newContext({
        ...device,
        baseURL: manifest.baseURL,
        locale: 'en-GB',
      });
      try {
        await preparePreviewAccess(visitor, manifest.baseURL);
        await assertDeployment(await visitor.newPage(), manifest);
        await visitor.storageState({ path: authState(name, 'visitor') });
      } finally {
        await visitor.close();
      }
      for (const role of E2E_ROLES) {
        const context = await browser.newContext({
          ...device,
          baseURL: manifest.baseURL,
          locale: 'en-GB',
          reducedMotion: 'reduce',
          storageState: authState(name, 'visitor'),
        });
        try {
          try {
            await signIn(await context.newPage(), manifest.projects[name].accounts[role], manifest);
          } catch (error) {
            throw new Error(
              `E2E setup project=${name}, role=${role}: ${error instanceof E2eSignInError ? error.message : 'sign-in failed'}`,
            );
          }
          await context.storageState({ path: authState(name, role) });
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
}
