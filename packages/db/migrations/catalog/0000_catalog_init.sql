CREATE TYPE "public"."listing_condition" AS ENUM('new', 'used', 'uk_used', 'refurbished', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."crawl_kind" AS ENUM('discover', 'fetch');--> statement-breakpoint
CREATE TYPE "public"."crawl_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."department" AS ENUM('clothing', 'shoes', 'bags_accessories', 'hair', 'beauty', 'electronics', 'other');--> statement-breakpoint
CREATE TYPE "public"."match_decision" AS ENUM('merge', 'split');--> statement-breakpoint
CREATE TYPE "public"."price_kind" AS ENUM('exact', 'from', 'range');--> statement-breakpoint
CREATE TYPE "public"."store_platform" AS ENUM('custom', 'woocommerce', 'shopify', 'wix', 'opencart', 'magento', 'affiliate', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('active', 'paused', 'blocked', 'candidate', 'rejected');--> statement-breakpoint
CREATE TABLE "canonical_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"department" "department" NOT NULL,
	"category" text,
	"brand" text,
	"model" text,
	"model_number" text,
	"gtin" text,
	"variant" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rep_image_url" text,
	"min_price_kobo" bigint,
	"max_price_kobo" bigint,
	"listing_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "crawl_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"adapter" text NOT NULL,
	"kind" "crawl_kind" NOT NULL,
	"status" "crawl_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"items_found" integer DEFAULT 0 NOT NULL,
	"items_changed" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_embeddings" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"image_vec" halfvec(512),
	"text_vec" halfvec(384),
	"model_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"brand" text,
	"model" text,
	"model_number" text,
	"gtin" text,
	"department" "department" DEFAULT 'other' NOT NULL,
	"category" text,
	"category_path" text[] DEFAULT '{}'::text[] NOT NULL,
	"condition" "listing_condition" DEFAULT 'unknown' NOT NULL,
	"variant" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_kobo" bigint NOT NULL,
	"price_kind" "price_kind" DEFAULT 'exact' NOT NULL,
	"price_max_kobo" bigint,
	"old_price_kobo" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"in_stock" boolean NOT NULL,
	"image_url" text,
	"phash" bigint,
	"seller_name" text,
	"region" text,
	"sponsored" boolean DEFAULT false NOT NULL,
	"canonical_product_id" uuid,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce("listings"."title", '') || ' ' || coalesce("listings"."brand", '') || ' ' || coalesce("listings"."model", '') || ' ' || coalesce("listings"."model_number", ''))) STORED,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_price_positive" CHECK ("listings"."price_kobo" > 0),
	CONSTRAINT "listings_price_max_gte" CHECK ("listings"."price_max_kobo" is null or "listings"."price_max_kobo" >= "listings"."price_kobo"),
	CONSTRAINT "listings_old_price_positive" CHECK ("listings"."old_price_kobo" is null or "listings"."old_price_kobo" > 0),
	CONSTRAINT "listings_currency_ngn" CHECK ("listings"."currency" = 'NGN')
);
--> statement-breakpoint
CREATE TABLE "match_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"candidate_product_id" uuid NOT NULL,
	"score" real NOT NULL,
	"decision" "match_decision",
	"reviewer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"platform" "store_platform" NOT NULL,
	"tier" smallint NOT NULL,
	"status" "store_status" DEFAULT 'candidate' NOT NULL,
	"crawl_policy" jsonb DEFAULT '{"robotsOk":false,"maxRps":1}'::jsonb NOT NULL,
	"affiliate" jsonb,
	"last_crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_domain_unique" UNIQUE("domain"),
	CONSTRAINT "stores_tier_range" CHECK ("stores"."tier" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_embeddings" ADD CONSTRAINT "listing_embeddings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_canonical_product_id_canonical_products_id_fk" FOREIGN KEY ("canonical_product_id") REFERENCES "public"."canonical_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_reviews" ADD CONSTRAINT "match_reviews_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_reviews" ADD CONSTRAINT "match_reviews_candidate_product_id_canonical_products_id_fk" FOREIGN KEY ("candidate_product_id") REFERENCES "public"."canonical_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canonical_products_department_category_idx" ON "canonical_products" USING btree ("department","category");--> statement-breakpoint
CREATE INDEX "canonical_products_gtin_idx" ON "canonical_products" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "crawl_jobs_store_created_idx" ON "crawl_jobs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_embeddings_image_hnsw" ON "listing_embeddings" USING hnsw ("image_vec" halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX "listing_embeddings_text_hnsw" ON "listing_embeddings" USING hnsw ("text_vec" halfvec_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "listings_store_external_uq" ON "listings" USING btree ("store_id","external_id");--> statement-breakpoint
CREATE INDEX "listings_canonical_product_idx" ON "listings" USING btree ("canonical_product_id");--> statement-breakpoint
CREATE INDEX "listings_last_seen_idx" ON "listings" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "listings_department_category_idx" ON "listings" USING btree ("department","category");--> statement-breakpoint
CREATE INDEX "listings_search_idx" ON "listings" USING gin ("search");--> statement-breakpoint
CREATE INDEX "listings_title_trgm_idx" ON "listings" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "match_reviews_pending_idx" ON "match_reviews" USING btree ("created_at") WHERE "match_reviews"."decision" is null;