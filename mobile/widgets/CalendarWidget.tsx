import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  background,
  containerBackground,
  cornerRadius,
  environment,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import type { WidgetEnvironment } from 'expo-widgets';
import type { ReactElement } from 'react';
import { initialCalendarWidgetProps } from './initial-props';
import type { CalendarWidgetProps } from './model';

function CalendarLayout(props: CalendarWidgetProps, context: WidgetEnvironment): ReactElement {
  'widget';
  const medium = context.widgetFamily === 'systemMedium';
  // Native EntryView owns locale direction; leading and row order stay logical.
  const alignment = 'leading';
  if (!props.active) {
    return (
      <VStack
        alignment={alignment}
        spacing={10}
        modifiers={[
          padding({ all: 16 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment }),
          background(props.surface),
          containerBackground(props.surface, 'widget'),
          environment('locale', props.locale),
        ]}
      >
        <Text
          modifiers={[
            font({ textStyle: 'headline', design: 'rounded' }),
            foregroundStyle(props.ink),
            lineLimit(2),
          ]}
        >
          {props.emptyTitle}
        </Text>
        <Text
          modifiers={[font({ textStyle: 'caption' }), foregroundStyle(props.ink), lineLimit(3)]}
        >
          {props.emptyDescription}
        </Text>
      </VStack>
    );
  }
  const rows = Array.from({ length: 6 }, (_, index) => props.cells.slice(index * 7, index * 7 + 7));
  return (
    <HStack
      spacing={14}
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background(props.surface),
        containerBackground(props.surface, 'widget'),
        environment('locale', props.locale),
      ]}
    >
      <VStack
        alignment={alignment}
        spacing={3}
        modifiers={[frame({ maxWidth: Infinity, alignment })]}
      >
        <Text
          modifiers={[
            font({ textStyle: 'caption', weight: 'semibold', design: props.fontDesign }),
            foregroundStyle(props.ink),
            lineLimit(1),
          ]}
        >
          {props.weekdayLabel}
        </Text>
        <Text
          modifiers={[
            font({ size: medium ? 42 : 44, weight: 'bold', design: props.fontDesign }),
            foregroundStyle(props.ink),
            accessibilityLabel(props.dateLabel),
          ]}
        >
          {props.dayLabel}
        </Text>
        <Text
          timerInterval={{ lower: new Date(props.clockAnchor), upper: new Date(props.clockEnd) }}
          countsDown={false}
          modifiers={[
            font({ size: medium ? 20 : 22, weight: 'medium', design: 'rounded' }),
            monospacedDigit(),
            foregroundStyle(props.ink),
            lineLimit(1),
          ]}
        />
        <Text
          modifiers={[
            font({ size: 11, weight: 'medium' }),
            foregroundStyle(props.ink),
            lineLimit(1),
          ]}
        >
          {props.monthLabel}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 10 }), foregroundStyle(props.ink), lineLimit(1)]}>
          {props.themeName}
        </Text>
      </VStack>
      {medium ? (
        <VStack spacing={3} modifiers={[frame({ width: 148 })]}>
          <HStack spacing={2}>
            {props.weekdays.map((day, index) => (
              <Text
                key={index}
                modifiers={[
                  frame({ width: 19 }),
                  font({ size: 10, weight: 'semibold' }),
                  foregroundStyle(props.ink),
                ]}
              >
                {day}
              </Text>
            ))}
          </HStack>
          {rows.map((week, row) => (
            <HStack key={row} spacing={2}>
              {week.map((day, column) => (
                <Text
                  key={column}
                  modifiers={[
                    frame({ width: 19, height: 17 }),
                    font({ size: 10, weight: day.today ? 'bold' : 'regular' }),
                    foregroundStyle(day.today ? props.accentInk : props.ink),
                    ...(day.today
                      ? [background(props.accent), cornerRadius(Math.max(2, props.radius * 16))]
                      : []),
                  ]}
                >
                  {day.inMonth ? day.label : ''}
                </Text>
              ))}
            </HStack>
          ))}
        </VStack>
      ) : null}
    </HStack>
  );
}

export default createWidget<CalendarWidgetProps>(
  'VibesetCalendar',
  CalendarLayout,
  initialCalendarWidgetProps(),
);
