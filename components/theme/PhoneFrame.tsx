import { Box } from '@chakra-ui/react';
import type { ReactElement, ReactNode } from 'react';

export function PhoneFrame({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}): ReactElement {
  return (
    <Box
      dir="ltr"
      role="group"
      aria-label={label}
      position="relative"
      aspectRatio={9 / 19.5}
      overflow="hidden"
      rounded="3xl"
      bg="bg.emphasized"
      w={{ base: 'calc(55dvh * 9 / 19.5)', lg: '72' }}
      maxW="full"
      borderWidth="thick"
      borderColor="border.emphasized"
      shadow="float"
    >
      {children}
      <Box
        position="absolute"
        top="2"
        insetStart="38%"
        w="24%"
        h="1.5"
        rounded="full"
        bg="bg.emphasized"
      />
      <Box
        position="absolute"
        bottom="2"
        insetStart="34%"
        w="32%"
        h="1"
        rounded="full"
        bg="whiteAlpha.700"
      />
    </Box>
  );
}
