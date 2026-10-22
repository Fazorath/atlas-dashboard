import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				/** The Area a Module page belongs to: tints the page with that Area's accent. */
				area: z
					.enum(['weather', 'habits', 'work', 'money', 'listening', 'school', 'health'])
					.optional(),
				/** The Module id as written in config/atlas.yaml. */
				module: z.string().optional(),
			}),
		}),
	}),
};
