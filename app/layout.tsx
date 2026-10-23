import type { Metadata, Viewport } from 'next';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from '@/components/ui/provider';
import { EmotionRegistry } from '@/components/ui/emotion-registry';
import { Toaster } from '@/components/ui/toaster';
import { fontVariables } from '@/design/fonts';
import messages from '@/messages/en.json';

const copy = messages.common.bootstrap;

export const metadata: Metadata = {
  title: copy.brandName,
  description: copy.description,
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8fc' },
    { media: '(prefers-color-scheme: dark)', color: '#16121d' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return (
    <html lang="en" dir="ltr" className={fontVariables} suppressHydrationWarning>
      <body>
        <EmotionRegistry>
          <Provider>
            {children}
            <Toaster />
          </Provider>
        </EmotionRegistry>
      </body>
    </html>
  );
}
