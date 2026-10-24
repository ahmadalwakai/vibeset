'use client';

import {
  Box,
  Button,
  Checkbox,
  ColorPicker,
  Field,
  Flex,
  Icon,
  IconButton,
  Input,
  NativeSelect,
  Portal,
  SegmentGroup,
  Slider,
  Stack,
  Text,
  parseColor,
} from '@chakra-ui/react';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { GlyphPicker } from '@/components/theme/GlyphPicker';
import { Hex } from '@/lib/render/spec';
import type { ThemeSpec } from '@/lib/render/spec';
import { formatNumber } from '@/lib/utils/format';
import { addPanelGlyph } from './panel-utils';

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const t = useTranslations('studio.fields');
  return (
    <ColorPicker.Root
      value={parseColor(value)}
      format="hsba"
      onValueChange={({ value }) => {
        const hex = Hex.safeParse(value.toString('hex'));
        if (hex.success) onChange(hex.data);
      }}
    >
      <ColorPicker.Label textStyle="body.sm">{label}</ColorPicker.Label>
      <ColorPicker.Control gap="2">
        <ColorPicker.Input
          minH="11"
          fontVariantNumeric="tabular-nums"
          dir="ltr"
          aria-label={`${label} · ${t('hex')}`}
        />
        <ColorPicker.Trigger
          minH="11"
          minW="11"
          rounded="input"
          aria-label={t('selectColor', { label })}
        >
          <ColorPicker.ValueSwatch boxSize="6" rounded="full" />
        </ColorPicker.Trigger>
      </ColorPicker.Control>
      <Portal>
        <ColorPicker.Positioner>
          <ColorPicker.Content rounded="input" shadow="float" p="4" maxW="xs">
            <ColorPicker.Area h="40" aria-label={label}>
              <ColorPicker.AreaBackground />
              <ColorPicker.AreaThumb boxSize="6" />
            </ColorPicker.Area>
            <ColorPicker.ChannelSlider channel="hue" minH="11" aria-label={t('hue')}>
              <ColorPicker.ChannelSliderTrack />
              <ColorPicker.ChannelSliderThumb boxSize="6" />
            </ColorPicker.ChannelSlider>
          </ColorPicker.Content>
        </ColorPicker.Positioner>
      </Portal>
      <ColorPicker.HiddenInput />
    </ColorPicker.Root>
  );
}

export function SliderField({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}): ReactElement {
  const locale = useLocale();
  return (
    <Slider.Root
      min={min}
      max={max}
      step={step}
      value={[value]}
      onValueChange={({ value: values }) => {
        const next = values[0];
        if (next !== undefined) onChange(next);
      }}
      colorPalette="brand"
    >
      <Flex justify="space-between" gap="3">
        <Slider.Label textStyle="body.sm">{label}</Slider.Label>
        <Text textStyle="caption" color="fg.muted" fontVariantNumeric="tabular-nums">
          {formatNumber(value, locale, { maximumFractionDigits: 3 })}
        </Text>
      </Flex>
      <Slider.Control minH="11">
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumb index={0} boxSize="6" aria-label={label}>
          <Slider.HiddenInput />
        </Slider.Thumb>
      </Slider.Control>
    </Slider.Root>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}): ReactElement {
  const t = useTranslations('studio.fields');
  const id = useId();
  const [draft, setDraft] = useState({ source: value, text: String(value) });
  const text = draft.source === value ? draft.text : String(value);
  const valid =
    /^\d+$/.test(text) &&
    Number.isSafeInteger(Number(text)) &&
    Number(text) >= min &&
    Number(text) <= max;
  return (
    <Field.Root invalid={text !== '' && !valid}>
      <Field.Label htmlFor={id}>{label}</Field.Label>
      <Input
        id={id}
        value={text}
        inputMode="numeric"
        dir="ltr"
        minH="11"
        onChange={(event) => {
          const text = event.target.value;
          setDraft({ source: value, text });
          const number = Number(text);
          if (/^\d+$/.test(text) && Number.isSafeInteger(number) && number >= min && number <= max)
            onChange(number);
        }}
        onBlur={() => setDraft({ source: value, text: String(value) })}
      />
      <Field.ErrorText>{t('numberRange', { min, max })}</Field.ErrorText>
    </Field.Root>
  );
}

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  segmented = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  segmented?: boolean;
}): ReactElement {
  const id = useId();
  if (segmented)
    return (
      <Stack gap="2">
        <Text id={id} textStyle="body.sm">
          {label}
        </Text>
        <SegmentGroup.Root
          value={value}
          onValueChange={({ value }) => {
            const choice = options.find((option) => option.value === value);
            if (choice) onChange(choice.value);
          }}
          flexWrap="wrap"
          gap="1"
          aria-labelledby={id}
        >
          {options.map((option) => (
            <SegmentGroup.Item
              key={option.value}
              value={option.value}
              minH="11"
              minW="20"
              flex="1"
              rounded="button"
              _checked={{ bg: 'brand.solid', color: 'brand.contrast' }}
            >
              <SegmentGroup.ItemText textStyle="caption">{option.label}</SegmentGroup.ItemText>
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Stack>
    );
  return (
    <Field.Root>
      <Field.Label htmlFor={id}>{label}</Field.Label>
      <NativeSelect.Root size="lg">
        <NativeSelect.Field
          id={id}
          value={value}
          minH="11"
          onChange={(event) => {
            const choice = options.find((option) => option.value === event.target.value);
            if (choice) onChange(choice.value);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field.Root>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={({ checked }) => onChange(checked === true)}
      minH="11"
      colorPalette="brand"
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label textStyle="body.sm">{label}</Checkbox.Label>
    </Checkbox.Root>
  );
}

export function GlyphListField({
  label,
  values,
  spec,
  onChange,
  minimum = 0,
}: {
  label: string;
  values: readonly string[];
  spec: ThemeSpec;
  onChange: (values: string[]) => void;
  minimum?: number;
}): ReactElement {
  const t = useTranslations('studio.fields');
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="3">
      <Text textStyle="body.sm">{label}</Text>
      <Flex gap="2" wrap="wrap">
        {values.map((name, index) => (
          <Flex key={`${name}:${index}`} align="center" rounded="input" bg="bg.subtle" ps="3">
            <Text textStyle="caption">{name}</Text>
            <IconButton
              aria-label={t('removeGlyph', { name })}
              variant="ghost"
              minW="11"
              minH="11"
              disabled={values.length <= minimum}
              onClick={() => onChange(values.filter((_, item) => item !== index))}
            >
              <Icon asChild boxSize="4">
                <XIcon aria-hidden />
              </Icon>
            </IconButton>
          </Flex>
        ))}
      </Flex>
      <Text textStyle="caption" color="fg.muted">
        {t('maxGlyphs', { count: 6 })}
      </Text>
      {minimum ? (
        <Text textStyle="caption" color="fg.muted">
          {t('minGlyphs')}
        </Text>
      ) : null}
      <Button
        variant="outline"
        minH="11"
        rounded="button"
        disabled={values.length >= 6}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Icon asChild boxSize="4">
          <PlusIcon aria-hidden />
        </Icon>
        {t('addGlyph')}
      </Button>
      {open ? (
        <GlyphPicker
          value={null}
          onChange={(name) => {
            onChange(addPanelGlyph(values, name));
            setOpen(false);
          }}
          spec={spec}
          platform="shaped"
        />
      ) : null}
    </Stack>
  );
}

export function SingleGlyphField({
  label,
  value,
  spec,
  onChange,
}: {
  label: string;
  value: string;
  spec: ThemeSpec;
  onChange: (value: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="2">
      <Text textStyle="body.sm">{label}</Text>
      <Button
        variant="outline"
        minH="11"
        rounded="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {value}
      </Button>
      {open ? (
        <GlyphPicker
          value={value}
          onChange={(value) => {
            onChange(value);
            setOpen(false);
          }}
          spec={spec}
          platform="shaped"
        />
      ) : null}
    </Stack>
  );
}

export function ColorListField({
  colors,
  onChange,
}: {
  colors: readonly string[];
  onChange: (colors: string[]) => void;
}): ReactElement {
  const t = useTranslations('studio.fields');
  return (
    <Stack gap="3">
      {colors.map((color, index) => (
        <Flex key={index} gap="2" align="end">
          <Box flex="1" minW="0">
            <ColorField
              label={t('customColor', { number: index + 1 })}
              value={color}
              onChange={(value) =>
                onChange(colors.map((item, position) => (position === index ? value : item)))
              }
            />
          </Box>
          <IconButton
            minW="11"
            minH="11"
            variant="ghost"
            aria-label={t('removeColor', { number: index + 1 })}
            disabled={colors.length <= 2}
            onClick={() => onChange(colors.filter((_, position) => position !== index))}
          >
            <Icon asChild boxSize="4">
              <XIcon aria-hidden />
            </Icon>
          </IconButton>
        </Flex>
      ))}
      <Text textStyle="caption" color="fg.muted">
        {t('colorLimit')}
      </Text>
      <Button
        variant="outline"
        minH="11"
        disabled={colors.length >= 6}
        onClick={() => {
          const color = colors.at(-1);
          if (color) onChange([...colors, color]);
        }}
      >
        {t('addColor')}
      </Button>
    </Stack>
  );
}
