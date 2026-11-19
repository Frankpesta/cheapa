CREATE TYPE "public"."search_source" AS ENUM('camera', 'share', 'gallery', 'text', 'link');--> statement-breakpoint
CREATE TABLE "clicks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"device_id" uuid,
	"listing_id" uuid NOT NULL,
	"product_id" uuid,
	"store_id" uuid NOT NULL,
	"affiliate_network" text,
	"search_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"device_id" uuid,
	"image_hash" char(64),
	"query" text,
	"detected" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"source" "search_source" NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "searches_owner" CHECK ("searches"."user_id" is not null or "searches"."device_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clicks_store_created_idx" ON "clicks" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "clicks_created_idx" ON "clicks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "searches_user_created_idx" ON "searches" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "searches_device_created_idx" ON "searches" USING btree ("device_id","created_at" DESC NULLS LAST);