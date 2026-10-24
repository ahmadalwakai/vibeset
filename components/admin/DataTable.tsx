'use client';

import { Box, Checkbox, Stack, Table, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
}
export function DataTable<Row>({
  rows,
  columns,
  getId,
  getLabel,
  selected,
  onSelection,
  disabled = false,
}: {
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  getId: (row: Row) => string;
  getLabel: (row: Row) => string;
  selected: ReadonlySet<string>;
  onSelection: (value: Set<string>) => void;
  disabled?: boolean;
}): ReactElement {
  const t = useTranslations('admin.common');
  const all = rows.length > 0 && rows.every((row) => selected.has(getId(row)));
  const some = rows.some((row) => selected.has(getId(row)));
  function toggle(id: string): void {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelection(next);
  }
  function selectAll(): void {
    const next = new Set(selected);
    for (const row of rows) {
      if (all) next.delete(getId(row));
      else next.add(getId(row));
    }
    onSelection(next);
  }
  const selection = (row: Row): ReactElement => (
    <Checkbox.Root
      checked={selected.has(getId(row))}
      onCheckedChange={() => toggle(getId(row))}
      disabled={disabled}
      minH="11"
      minW="11"
      colorPalette="brand"
    >
      <Checkbox.HiddenInput aria-label={t('selectRow', { name: getLabel(row) })} />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
    </Checkbox.Root>
  );
  return (
    <Stack gap="4">
      <Checkbox.Root
        checked={all ? true : some ? 'indeterminate' : false}
        onCheckedChange={selectAll}
        disabled={disabled || !rows.length}
        minH="11"
        colorPalette="brand"
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>{t('selectAll')}</Checkbox.Label>
      </Checkbox.Root>
      <Box overflowX="auto" display={{ base: 'none', md: 'block' }}>
        <Table.Root variant="outline" size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>{t('selection')}</Table.ColumnHeader>
              {columns.map((column) => (
                <Table.ColumnHeader key={column.key}>{column.header}</Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={getId(row)}>
                <Table.Cell>{selection(row)}</Table.Cell>
                {columns.map((column) => (
                  <Table.Cell key={column.key}>{column.render(row)}</Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
      <Stack display={{ base: 'flex', md: 'none' }} gap="4">
        {rows.map((row) => (
          <Stack
            key={getId(row)}
            gap="3"
            p="4"
            rounded="card"
            bg="bg.panel"
            borderWidth="hairline"
            borderColor="border"
          >
            {selection(row)}
            {columns.map((column) => (
              <Stack key={column.key} gap="1">
                <Text textStyle="caption" color="fg.muted">
                  {column.header}
                </Text>
                {column.render(row)}
              </Stack>
            ))}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
