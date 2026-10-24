import { Button, Flex, Text } from '@chakra-ui/react';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';

export async function AdminOperationsPager({
  page,
  total,
  nextPage,
  path,
  query,
}: {
  page: number;
  total: number;
  nextPage: number | null;
  path: string;
  query: Record<string, string | number | undefined>;
}): Promise<ReactElement> {
  const t = await getTranslations('admin.themes');
  function href(value: number): string {
    const params = new URLSearchParams();
    Object.entries({ ...query, page: value }).forEach(([key, item]) => {
      if (item !== undefined) params.set(key, String(item));
    });
    return `${path}?${params}`;
  }
  return (
    <Flex gap="3" align="center" wrap="wrap">
      {page > 1 ? (
        <Button asChild minH="11" variant="outline">
          <Link href={href(page - 1)}>{t('previous')}</Link>
        </Button>
      ) : null}
      <Text textStyle="body.sm">{t('pagination', { page, total })}</Text>
      {nextPage ? (
        <Button asChild minH="11" variant="outline">
          <Link href={href(nextPage)}>{t('next')}</Link>
        </Button>
      ) : null}
    </Flex>
  );
}
