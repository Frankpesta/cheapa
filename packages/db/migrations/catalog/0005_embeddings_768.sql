-- Image model -> Marqo-FashionSigLIP (768 dims, DECISIONS.md 2026-11-17). Vectors from the old
-- model are not comparable and cannot be cast to 768 dims. Only seed rows existed when this ran;
-- a later model switch needs a re-embed backfill.
DELETE FROM "listing_embeddings";--> statement-breakpoint
ALTER TABLE "listing_embeddings" ALTER COLUMN "image_vec" SET DATA TYPE halfvec(768);
