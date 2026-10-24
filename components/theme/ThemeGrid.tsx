import { SimpleGrid } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import { StaggerGrid } from '@/components/common/motion';
import type { ThemeCardDTO } from '@/lib/dto';
import { ThemeCard } from './ThemeCard';

export interface ThemeGridProps {
  themes: readonly ThemeCardDTO[];
  priority?: boolean;
}

export function ThemeGrid({ themes, priority = false }: ThemeGridProps): ReactElement {
  return (
    <SimpleGrid asChild columns={{ base: 2, sm: 3, md: 4, xl: 5 }} gap={{ base: '3', md: '5' }}>
      <StaggerGrid>
        {themes.map((theme, index) => (
          <ThemeCard key={theme.id} theme={theme} priority={priority && index < 2} />
        ))}
      </StaggerGrid>
    </SimpleGrid>
  );
}
