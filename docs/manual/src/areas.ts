/* Each Area's accent, copied from the token block at the top of the app's
   frontend/src/index.css. A Module page sets `area:` in its frontmatter and is
   tinted with that Area's colour; every other page wears Today's violet. */

export interface AreaAccent {
	label: string;
	accent: string;
	tint: string;
	track: string;
}

export const AREAS: Record<string, AreaAccent> = {
	weather: { label: 'Weather', accent: '#5cc8ff', tint: '#10263a', track: '#16324a' },
	habits: { label: 'Habits', accent: '#3ddc97', tint: '#12291f', track: '#1d4632' },
	work: { label: 'Work', accent: '#2dd4bf', tint: '#0f2826', track: '#17443f' },
	money: { label: 'Money', accent: '#ffb547', tint: '#2e2414', track: '#4a3a1e' },
	// Listening shares School's coral, as in the app.
	listening: { label: 'Listening', accent: '#ff6b81', tint: '#2f1920', track: '#4a2530' },
	school: { label: 'School', accent: '#ff6b81', tint: '#2f1920', track: '#4a2530' },
	// Health keeps Sleep's violet, which is also the brand colour.
	health: { label: 'Health', accent: '#9b8cff', tint: '#1e1b3a', track: '#3a3470' },
};

export const BRAND: AreaAccent = { label: 'Atlas', accent: '#9b8cff', tint: '#1e1b3a', track: '#3a3470' };
