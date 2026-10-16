import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Statisk webbplats: varje sida byggs till ren HTML som Google kan läsa direkt.
export default defineConfig({
  site: 'https://tostadflytt.se',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  integrations: [
    sitemap({
      filter: (page) => !/\/(tack|404)(\.html)?$/.test(page),
      changefreq: 'monthly',
      priority: 0.7,
      serialize(item) {
        // Startsidan och de viktigaste tjänsterna får högre prioritet.
        if (item.url === 'https://tostadflytt.se/' || item.url === 'https://tostadflytt.se') item.priority = 1.0;
        if (/\/(flyttstadning|flyttfirma|priser|flytt-och-flyttstadning)$/.test(item.url)) item.priority = 0.9;
        return item;
      },
    }),
  ],
});
