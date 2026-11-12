ALTER TABLE "crawl_jobs" ADD COLUMN "refs_total" integer;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD COLUMN "fetches_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD COLUMN "fetches_failed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD COLUMN "health_checked_at" timestamp with time zone;