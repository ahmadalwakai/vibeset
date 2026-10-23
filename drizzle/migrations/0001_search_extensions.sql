CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS themes_name_en_trgm_idx ON themes USING gin (name_en gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS themes_name_ar_trgm_idx ON themes USING gin (name_ar gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS apps_name_trgm_idx ON apps USING gin (name gin_trgm_ops);
