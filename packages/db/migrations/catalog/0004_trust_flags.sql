ALTER TABLE "canonical_products" ADD COLUMN "cheapest_new_kobo" bigint;--> statement-breakpoint
ALTER TABLE "canonical_products" ADD COLUMN "cheapest_used_kobo" bigint;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "suspect_low" boolean DEFAULT false NOT NULL;