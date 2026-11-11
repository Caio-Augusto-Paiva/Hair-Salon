CREATE TABLE "auth_rate_limits" (
  "bucket_key" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamptz NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "blocked_until" timestamptz,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "auth_rate_limits_bucket_key_format" CHECK ("bucket_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_rate_limits_attempts_non_negative" CHECK ("attempts" >= 0),
  CONSTRAINT "auth_rate_limits_blocked_after_window" CHECK ("blocked_until" IS NULL OR "blocked_until" > "window_started_at")
);
--> statement-breakpoint
CREATE INDEX "auth_rate_limits_expiry_idx" ON "auth_rate_limits" USING btree ("blocked_until");
