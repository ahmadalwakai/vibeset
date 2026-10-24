export type IntegrationEnvironment = Readonly<Record<string, string | undefined>>;

export function normalizedDatabaseHost(value: string): string {
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    )
      throw new Error();
    return url.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/-pooler(?=\.)/, '');
  } catch {
    throw new Error('Integration database configuration is invalid');
  }
}

/** No imports, connections, environment writes or cached configuration. */
export function isolatedIntegrationUrl(source: IntegrationEnvironment): string | null {
  const testUrl = source.TEST_DATABASE_URL?.trim();
  if (!testUrl) return null;
  if (source.NODE_ENV === 'production' || source.VERCEL_ENV === 'production')
    throw new Error('Integration tests refuse production');
  const testEndpoint = normalizedDatabaseHost(testUrl);
  for (const ordinary of [source.DATABASE_URL, source.DATABASE_URL_UNPOOLED]) {
    if (ordinary?.trim() && normalizedDatabaseHost(ordinary.trim()) === testEndpoint)
      throw new Error('Integration tests require a distinct TEST_DATABASE_URL endpoint');
  }
  return testUrl;
}

export function isIntegrationTestFile(path: string | undefined): boolean {
  return (
    !!path && /(?:^|\/)tests\/integration\/.+\.test\.[cm]?[jt]sx?$/.test(path.replaceAll('\\', '/'))
  );
}
