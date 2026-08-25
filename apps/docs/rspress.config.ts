import { defineConfig } from '@rspress/core'

// Source of truth is the repo's docs/ directory (ARCHITECTURE.md and
// PRIVACY.md live there). Base matches the GitHub Pages project path.
export default defineConfig({
  root: '../../docs',
  base: '/mbzoo/docs/',
  title: 'MBZoo',
  description: "See what's inside your MBZ — documentation",
  icon: '/favicon.png',
  outDir: './doc_build',
  themeConfig: {
    logo: '/logo.png',
    socialLinks: [
      { icon: 'github', mode: 'link', content: 'https://github.com/ateeducacion/mbzoo' },
    ],
    nav: [
      { text: 'Guide', link: '/guide/what-is-mbz' },
      { text: 'Activity support', link: '/guide/activity-support' },
      { text: 'Architecture', link: '/ARCHITECTURE' },
      { text: 'Privacy', link: '/PRIVACY' },
    ],
    sidebar: {
      '/': [
        { text: 'Guide', link: '/guide/what-is-mbz' },
        { text: 'Activity support', link: '/guide/activity-support' },
        { text: 'Development', link: '/guide/development' },
        { text: 'Research system', link: '/guide/research' },
        { text: 'Architecture', link: '/ARCHITECTURE' },
        { text: 'Privacy', link: '/PRIVACY' },
      ],
    },
  },
})
