import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projects = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		year: z.number(),
		tags: z.array(z.string()),
		repo: z.url().optional(),
		order: z.number(),
	}),
});

export const collections = { projects };
