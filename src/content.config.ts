import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const sourceSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

const blogSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.date(),
  updatedDate: z.date().optional(),
  author: z.string().default("Kunal Siyag"),
  reviewer: z.string().optional(),
  reviewedOn: z.date().optional(),
  reviewIntervalDays: z.number().int().positive().optional(),
  sourceUrls: z.array(sourceSchema).optional(),
  testedApplications: z.array(z.string()).optional(),
  image: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: blogSchema,
});

const blogHiCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog-hi" }),
  schema: blogSchema,
});

export const collections = {
  blog: blogCollection,
  blogHi: blogHiCollection,
};
