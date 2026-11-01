-- price_history, range-partitioned by calendar month (UTC) on observed_at.
-- Hand-written: drizzle-kit can't manage partitioned tables. Typed access lives in
-- src/catalog/price-history.ts (excluded from drizzle.catalog.config.ts).
--
-- Partitions must exist before rows arrive. ensure_price_history_partitions() creates
-- the current month plus N ahead; the worker scheduler calls it daily (02-crawler-core.md)
-- and monitoring alerts if next month's partition is missing.

CREATE TABLE "price_history" (
	"id" bigserial NOT NULL,
	"listing_id" uuid NOT NULL REFERENCES "listings"("id") ON DELETE CASCADE,
	"price_kobo" bigint NOT NULL CHECK ("price_kobo" > 0),
	"in_stock" boolean NOT NULL,
	"observed_at" timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY ("id", "observed_at")
) PARTITION BY RANGE ("observed_at");
--> statement-breakpoint
CREATE INDEX "price_history_listing_observed_idx" ON "price_history" ("listing_id", "observed_at" DESC);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_price_history_partitions(months_ahead integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
	first_month timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
	month_start timestamptz;
	partition_name text;
	created integer := 0;
BEGIN
	FOR i IN 0..months_ahead LOOP
		month_start := first_month + make_interval(months => i);
		partition_name := format('price_history_y%sm%s',
			to_char(month_start AT TIME ZONE 'UTC', 'YYYY'),
			to_char(month_start AT TIME ZONE 'UTC', 'MM'));
		IF to_regclass(partition_name) IS NULL THEN
			EXECUTE format(
				'CREATE TABLE %I PARTITION OF price_history FOR VALUES FROM (%L) TO (%L)',
				partition_name, month_start, month_start + interval '1 month');
			created := created + 1;
		END IF;
	END LOOP;
	RETURN created;
END;
$$;
--> statement-breakpoint
SELECT ensure_price_history_partitions(3);
