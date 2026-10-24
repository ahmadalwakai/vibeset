'use client';

import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  Heading,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import type {
  AdminGenerationRunDetail,
  AdminGenerationSummary,
  AdminGeneratorOption,
} from '@/lib/admin-operations';
import type { ErrorMessageCode } from '@/lib/result';
import { THEME_STATUSES } from '@/lib/theme-status';
import { formatNumber } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import { adminGenerateDraftsSchema } from '@/lib/validation/admin-operations';
import { adminGenerateDrafts, adminReadGenerationRun } from '@/server/actions/admin/generator';

export function AdminGenerator({
  options,
}: {
  options: readonly AdminGeneratorOption[];
}): ReactElement {
  const t = useTranslations('admin.generator'),
    status = useTranslations('creator.status'),
    errors = useTranslations('errors'),
    locale = useLocale(),
    router = useRouter(),
    id = useId();
  const [aesthetic, setAesthetic] = useState(options[0]?.slug ?? '');
  const [count, setCount] = useState('12'),
    [seed, setSeed] = useState('');
  const [pending, setPending] = useState(false),
    [error, setError] = useState<ErrorMessageCode | null>(null);
  const [result, setResult] = useState<AdminGenerationSummary | null>(null);
  const mounted = useRef(false),
    running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  async function generate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (running.current) return;
    const validCount = /^[0-9]{1,2}$/.test(count);
    const validSeed = seed === '' || /^[0-9]{1,10}$/.test(seed);
    const parsed = adminGenerateDraftsSchema.safeParse({
      aesthetic,
      count: validCount ? Number(count) : Number.NaN,
      ...(seed === '' ? {} : { seed: validSeed ? Number(seed) : Number.NaN }),
    });
    if (!parsed.success) {
      setError('VALIDATION');
      return;
    }
    running.current = true;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await adminGenerateDrafts(parsed.data);
      if (!mounted.current) return;
      if (response.ok) {
        setResult(response.data);
        router.refresh();
      } else setError(response.error.code);
    } catch {
      if (mounted.current) setError('NETWORK');
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }
  const selected = options.find((option) => option.slug === aesthetic);
  return (
    <Stack gap="6">
      <Box asChild>
        <form onSubmit={generate}>
          <Stack
            gap="4"
            p="5"
            rounded="card"
            borderWidth="hairline"
            borderColor="border"
            bg="bg.panel"
          >
            <SimpleGrid columns={{ base: 1, md: 3 }} gap="4">
              <Field.Root>
                <Field.Label htmlFor={`${id}-aesthetic`}>{t('aesthetic')}</Field.Label>
                <NativeSelect.Root disabled={pending}>
                  <NativeSelect.Field
                    id={`${id}-aesthetic`}
                    value={aesthetic}
                    onChange={(event) => setAesthetic(event.target.value)}
                    minH="11"
                  >
                    {options.map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {localized(option, locale)}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
              <Field.Root>
                <Field.Label htmlFor={`${id}-count`}>{t('count')}</Field.Label>
                <Input
                  id={`${id}-count`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={24}
                  step={1}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  disabled={pending}
                  minH="11"
                />
              </Field.Root>
              <Field.Root>
                <Field.Label htmlFor={`${id}-seed`}>{t('seed')}</Field.Label>
                <Flex gap="2" w="full">
                  <Input
                    id={`${id}-seed`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={2_147_483_647}
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                    disabled={pending}
                    minH="11"
                  />
                  <Button
                    minH="11"
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      const values = crypto.getRandomValues(new Uint32Array(1));
                      setSeed(String((values[0] ?? 0) & 0x7fffffff));
                    }}
                  >
                    {t('randomSeed')}
                  </Button>
                </Flex>
                <Field.HelperText>{t('seedHint')}</Field.HelperText>
              </Field.Root>
            </SimpleGrid>
            {selected ? (
              <Stack gap="2">
                <Text textStyle="caption" color="fg.muted">
                  {t('counts')}
                </Text>
                <Flex gap="2" wrap="wrap">
                  {THEME_STATUSES.map((value) => (
                    <Badge key={value} variant="subtle">
                      {status(value)}: {formatNumber(selected.counts[value], locale)}
                    </Badge>
                  ))}
                </Flex>
              </Stack>
            ) : null}
            <Text textStyle="body.sm" color="fg.muted">
              {t('draftOnly')}
            </Text>
            <Button
              type="submit"
              minH="11"
              colorPalette="brand"
              loading={pending}
              disabled={!selected}
              alignSelf="start"
            >
              {t('generate')}
            </Button>
            {pending ? (
              <Text role="status" textStyle="body.sm">
                {t('generating')}
              </Text>
            ) : null}
            {error ? (
              <Text role="alert" textStyle="body.sm" color="red.fg">
                {errors(error)}
              </Text>
            ) : null}
          </Stack>
        </form>
      </Box>
      {result ? (
        <Stack p="5" rounded="card" bg="brand.subtle" gap="3" role="status">
          <Heading as="h2" textStyle="heading.md">
            {t('result')}
          </Heading>
          <SimpleGrid columns={{ base: 1, sm: 3 }} gap="3">
            {(
              [
                ['created', result.created],
                ['duplicates', result.skippedDuplicates],
                ['qa', result.skippedQa],
              ] as const
            ).map(([key, value]) => (
              <Text key={key}>
                {t(key)}: {formatNumber(value, locale)}
              </Text>
            ))}
          </SimpleGrid>
          <Button asChild minH="11" colorPalette="brand" alignSelf="start">
            <Link href={`/admin/review?run=${result.runId}`}>{t('review')}</Link>
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}

export function GenerationRunLog({ runId }: { runId: string }): ReactElement {
  const t = useTranslations('admin.generator'),
    common = useTranslations('common'),
    errors = useTranslations('errors');
  const [log, setLog] = useState<AdminGenerationRunDetail | null>(null),
    [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorMessageCode | null>(null);
  const mounted = useRef(false),
    request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, []);
  async function load(): Promise<void> {
    const epoch = ++request.current;
    setPending(true);
    setError(null);
    try {
      const result = await adminReadGenerationRun({ id: runId });
      if (!mounted.current || epoch !== request.current) return;
      if (result.ok && result.data) setLog(result.data);
      else setError(result.ok ? 'NOT_FOUND' : result.error.code);
    } catch {
      if (mounted.current && epoch === request.current) setError('NETWORK');
    } finally {
      if (mounted.current && epoch === request.current) setPending(false);
    }
  }
  return (
    <Box as="details">
      <Box as="summary" minH="11" display="list-item" cursor="pointer">
        {t('log')}
      </Box>
      {log ? (
        <Box
          as="pre"
          dir="ltr"
          textStyle="caption"
          whiteSpace="pre-wrap"
          overflowWrap="anywhere"
          maxH="64"
          overflowY="auto"
        >
          {log.log.length ? log.log.join('\n') : t('noLog')}
        </Box>
      ) : (
        <Stack gap="2">
          <Button
            alignSelf="start"
            minH="11"
            variant="outline"
            loading={pending}
            onClick={() => void load()}
          >
            {error ? common('retry') : t('loadLog')}
          </Button>
          {error ? (
            <Text role="alert" textStyle="body.sm" color="red.fg">
              {errors(error)}
            </Text>
          ) : null}
        </Stack>
      )}
    </Box>
  );
}

export function RefreshGenerationHistory(): ReactElement {
  const t = useTranslations('admin.generator'),
    router = useRouter();
  return (
    <Button minH="11" variant="outline" alignSelf="start" onClick={() => router.refresh()}>
      {t('refresh')}
    </Button>
  );
}
