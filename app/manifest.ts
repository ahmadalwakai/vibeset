import type { MetadataRoute } from 'next';
import messages from '../messages/en.json';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Vibeset',
    short_name: 'Vibeset',
    description: messages.home.metadata.description,
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf8fc',
    theme_color: '#b44bd0',
    categories: ['personalization', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: messages.nav.explore, url: '/explore' },
      { name: messages.nav.studio, url: '/studio' },
      { name: messages.nav.saved, url: '/saved' },
    ],
  };
}
