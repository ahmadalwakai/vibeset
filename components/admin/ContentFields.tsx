'use client';
import { Checkbox, Field, Input, NativeSelect, Textarea } from '@chakra-ui/react';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
export function ContentTextField({
  label,
  value,
  onChange,
  invalid = false,
  multiline = false,
  type = 'text',
  maxLength = 4000,
  helper,
  dir,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  multiline?: boolean;
  type?: string;
  maxLength?: number;
  helper?: string;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
}): ReactElement {
  const id = useId(),
    errors = useTranslations('errors');
  return (
    <Field.Root invalid={invalid} disabled={disabled}>
      <Field.Label htmlFor={id}>{label}</Field.Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          minH="24"
          dir={dir}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          maxLength={maxLength}
          minH="11"
          dir={dir}
        />
      )}{' '}
      {helper ? <Field.HelperText>{helper}</Field.HelperText> : null}
      <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
    </Field.Root>
  );
}
export function ContentSelect({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}): ReactElement {
  const id = useId();
  return (
    <Field.Root>
      <Field.Label htmlFor={id}>{label}</Field.Label>
      <NativeSelect.Root size="lg" disabled={disabled}>
        <NativeSelect.Field
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field.Root>
  );
}
export function ContentCheck({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={({ checked }) => onChange(checked === true)}
      disabled={disabled}
      minH="11"
      colorPalette="brand"
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
  );
}
