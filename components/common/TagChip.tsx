import { Button, Tag } from '@chakra-ui/react';
import { useLocale } from 'next-intl';
import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import type { TagDTO } from '@/lib/dto';
import { localized } from '@/lib/utils/localized';

export interface TagChipProps {
  tag: TagDTO;
  href?: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function TagChip({
  tag,
  href,
  selected = false,
  onClick,
  disabled = false,
}: TagChipProps): ReactElement {
  const locale = useLocale();
  const label = localized(tag, locale);
  if (href)
    return (
      <Button
        asChild
        size="sm"
        minH="11"
        rounded="chip"
        variant={selected ? 'solid' : 'outline'}
        colorPalette="brand"
      >
        <Link href={href}>{label}</Link>
      </Button>
    );
  if (onClick)
    return (
      <Button
        type="button"
        size="sm"
        minH="11"
        rounded="chip"
        variant={selected ? 'solid' : 'outline'}
        colorPalette="brand"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </Button>
    );
  return (
    <Tag.Root
      size="sm"
      rounded="chip"
      maxW="full"
      bg={selected ? 'brand.muted' : 'bg.subtle'}
      color={selected ? 'brand.fg' : 'fg.muted'}
      px="2.5"
      py="1"
    >
      <Tag.Label truncate>{label}</Tag.Label>
    </Tag.Root>
  );
}
