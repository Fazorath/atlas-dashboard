// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Published by .github/workflows/manual.yml to GitHub Pages, under the repo's
// name. Internal links in the Markdown are written with this base in front.
export default defineConfig({
	site: 'https://fazorath.github.io',
	base: '/atlas-dashboard',
	integrations: [
		starlight({
			title: 'Atlas Manual',
			description: 'Install, configure and run Atlas, the self-hosted personal dashboard.',
			logo: { src: './src/assets/atlas-mark.svg', alt: 'Atlas' },
			favicon: '/favicon.svg',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/Fazorath/atlas-dashboard' },
			],
			editLink: {
				baseUrl: 'https://github.com/Fazorath/atlas-dashboard/edit/main/docs/manual/',
			},
			// Atlas is dark only, so is its manual.
			components: {
				ThemeProvider: './src/components/ForceDark.astro',
				ThemeSelect: './src/components/Nothing.astro',
				Head: './src/components/Head.astro',
				PageTitle: './src/components/PageTitle.astro',
			},
			customCss: [
				'@fontsource-variable/space-grotesk',
				'@fontsource-variable/jetbrains-mono',
				'./src/styles/atlas.css',
			],
			expressiveCode: {
				themes: ['github-dark-default'],
				styleOverrides: {
					borderRadius: '8px',
					borderColor: '#232323',
					codeFontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
					uiFontFamily: "'Space Grotesk Variable', system-ui, sans-serif",
					codeBackground: '#0e0e0e',
					frames: {
						editorBackground: '#0e0e0e',
						terminalBackground: '#0e0e0e',
						editorTabBarBackground: '#050505',
						terminalTitlebarBackground: '#050505',
						editorActiveTabBackground: '#0e0e0e',
						frameBoxShadowCssValue: 'none',
					},
				},
			},
			sidebar: [
				{
					label: 'Start here',
					items: [
						{ label: 'What Atlas is', slug: 'start/what-atlas-is' },
						{ label: 'Install', slug: 'start/install' },
						{ label: 'Configuration', slug: 'start/configuration' },
						{ label: 'Demo data', slug: 'start/demo-data' },
					],
				},
				{
					label: 'Using Atlas',
					items: [
						{ label: 'Today', slug: 'using/today' },
						{ label: 'Boards & Widgets', slug: 'using/boards-and-widgets' },
						{ label: 'Sync & freshness', slug: 'using/sync-and-freshness' },
						{ label: 'Notifications', slug: 'using/notifications' },
					],
				},
				{
					label: 'Modules',
					items: [
						{ label: 'Weather', slug: 'modules/weather', badge: { text: 'open_meteo', variant: 'note' } },
						{ label: 'Habits', slug: 'modules/habits', badge: { text: 'habits', variant: 'note' } },
						{ label: 'Work', slug: 'modules/work', badge: { text: 'work', variant: 'note' } },
						{ label: 'Money', slug: 'modules/money', badge: { text: 'securo', variant: 'note' } },
						{ label: 'Listening', slug: 'modules/listening', badge: { text: 'audiobookshelf', variant: 'note' } },
						{ label: 'School', slug: 'modules/school', badge: { text: 'canvas', variant: 'note' } },
						{ label: 'Health', slug: 'modules/health', badge: { text: 'google_health', variant: 'note' } },
					],
				},
				{
					label: 'Operate',
					items: [
						{ label: 'Updating', slug: 'operate/updating' },
						{ label: 'Backups', slug: 'operate/backups' },
						{ label: 'Troubleshooting', slug: 'operate/troubleshooting' },
					],
				},
				{
					label: 'Coming next',
					items: [{ label: 'Custom modules', slug: 'next/custom-modules' }],
				},
			],
		}),
	],
});
