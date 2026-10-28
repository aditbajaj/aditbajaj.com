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
		highlights: z.array(z.string()).min(2).max(4),
		repo: z.url().optional(),
		award: z.string().optional(),
		preview: z
			.object({
				src: z.union([z.url(), z.string().startsWith("/")]),
				alt: z.string(),
				fit: z.enum(["cover", "contain"]).default("cover"),
			})
			.optional(),
		order: z.number(),
		// Notebook fields: the homepage entry and the case-study header.
		category: z.string(),
		summary: z.string(),
		deck: z.string(),
		stack: z.string(),
		stats: z.array(z.tuple([z.string(), z.string()])).length(3),
	}),
});

export const collections = { projects };
