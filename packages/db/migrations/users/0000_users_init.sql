CREATE TYPE "public"."device_platform" AS ENUM('android', 'ios', 'web');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'premium');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anon_id" uuid NOT NULL,
	"user_id" uuid,
	"platform" "device_platform",
	"app_version" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_anon_id_unique" UNIQUE("anon_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text,
	"phone" text,
	"city" text,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_phone_e164" CHECK ("users"."phone" is null or "users"."phone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "devices_last_seen_idx" ON "devices" USING btree ("last_seen_at");