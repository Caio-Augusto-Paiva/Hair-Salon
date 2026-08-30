CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM ('CLIENT', 'EMPLOYEE', 'ADMIN');
CREATE TYPE "public"."user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "public"."employee_status" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "public"."service_category" AS ENUM ('HAIR', 'NAILS', 'MAKEUP', 'SKIN', 'OTHER');
CREATE TYPE "public"."schedule_kind" AS ENUM ('APPOINTMENT', 'BLOCK');
CREATE TYPE "public"."schedule_status" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');
CREATE TYPE "public"."appointment_status" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "public"."payment_method" AS ENUM ('CASH', 'PIX', 'CARD');
CREATE TYPE "public"."block_status" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "public"."outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "public"."calendar_sync_status" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'CANCELLED');
CREATE TYPE "public"."reminder_channel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "public"."reminder_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "public"."privacy_request_type" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION');
CREATE TYPE "public"."privacy_request_status" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');
--> statement-breakpoint
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email_normalized" text NOT NULL,
  "password_hash" text,
  "role" "user_role" DEFAULT 'CLIENT' NOT NULL,
  "status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
  "session_version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_ip_hash" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "event_type" text NOT NULL,
  "successful" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "specialty_summary" text NOT NULL,
  "status" "employee_status" DEFAULT 'ACTIVE' NOT NULL,
  "calendar_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "category" "service_category" DEFAULT 'OTHER' NOT NULL,
  "duration_minutes" integer NOT NULL,
  "preparation_minutes" integer DEFAULT 0 NOT NULL,
  "price_cents" integer NOT NULL,
  "price_verified_at" timestamptz,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_services" (
  "employee_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "duration_override_minutes" integer,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "employee_services_pk" PRIMARY KEY("employee_id", "service_id")
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_path" text NOT NULL,
  "category" "service_category" DEFAULT 'OTHER' NOT NULL,
  "alternative_text" text NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "kind" "schedule_kind" NOT NULL,
  "status" "schedule_status" DEFAULT 'ACTIVE' NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_entry_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "service_id" uuid,
  "service_name_snapshot" text NOT NULL,
  "duration_minutes_snapshot" integer NOT NULL,
  "price_cents_snapshot" integer NOT NULL,
  "payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
  "status" "appointment_status" DEFAULT 'CONFIRMED' NOT NULL,
  "cancellation_reason" text,
  "cancelled_at" timestamptz,
  "cancelled_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_entry_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "recurrence_source" text,
  "status" "block_status" DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_credits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "slot_number" integer NOT NULL,
  "available_at" timestamptz DEFAULT now() NOT NULL,
  "last_appointment_id" uuid,
  "last_used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamptz DEFAULT now() NOT NULL,
  "status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
  "last_error" text,
  "processed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_syncs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "appointment_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_event_id" text,
  "status" "calendar_sync_status" DEFAULT 'PENDING' NOT NULL,
  "last_provider_outcome" text,
  "last_attempt_at" timestamptz,
  "synced_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "appointment_id" uuid NOT NULL,
  "scheduled_at" timestamptz NOT NULL,
  "channel" "reminder_channel" NOT NULL,
  "status" "reminder_status" DEFAULT 'PENDING' NOT NULL,
  "idempotency_key" text NOT NULL,
  "sent_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "protocol" text NOT NULL,
  "user_id" uuid,
  "contact_email" text NOT NULL,
  "request_type" "privacy_request_type" NOT NULL,
  "status" "privacy_request_status" DEFAULT 'RECEIVED' NOT NULL,
  "due_at" timestamptz NOT NULL,
  "resolved_at" timestamptz,
  "resolution_notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "metadata" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null;
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE restrict;
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade;
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE cascade;
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE restrict;
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_schedule_entry_id_schedule_entries_id_fk" FOREIGN KEY ("schedule_entry_id") REFERENCES "schedule_entries"("id") ON DELETE cascade;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE restrict;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE set null;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE set null;
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_schedule_entry_id_schedule_entries_id_fk" FOREIGN KEY ("schedule_entry_id") REFERENCES "schedule_entries"("id") ON DELETE cascade;
ALTER TABLE "cancellation_credits" ADD CONSTRAINT "cancellation_credits_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "cancellation_credits" ADD CONSTRAINT "cancellation_credits_last_appointment_id_appointments_id_fk" FOREIGN KEY ("last_appointment_id") REFERENCES "appointments"("id") ON DELETE set null;
ALTER TABLE "calendar_syncs" ADD CONSTRAINT "calendar_syncs_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE cascade;
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE cascade;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_duration_positive" CHECK ("duration_minutes" > 0);
ALTER TABLE "services" ADD CONSTRAINT "services_preparation_non_negative" CHECK ("preparation_minutes" >= 0);
ALTER TABLE "services" ADD CONSTRAINT "services_price_non_negative" CHECK ("price_cents" >= 0);
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_duration_positive" CHECK ("duration_override_minutes" IS NULL OR "duration_override_minutes" > 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_duration_positive" CHECK ("duration_minutes_snapshot" > 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_price_non_negative" CHECK ("price_cents_snapshot" >= 0);
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_valid_interval" CHECK ("ends_at" > "starts_at");
ALTER TABLE "cancellation_credits" ADD CONSTRAINT "cancellation_credits_slot_number" CHECK ("slot_number" BETWEEN 1 AND 3);
--> statement-breakpoint
ALTER TABLE "schedule_entries"
  ADD CONSTRAINT "schedule_entries_no_employee_overlap"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_unique" ON "users" USING btree ("email_normalized");
CREATE UNIQUE INDEX "accounts_provider_identity_unique" ON "accounts" USING btree ("provider", "provider_account_id");
CREATE UNIQUE INDEX "password_reset_tokens_hash_unique" ON "password_reset_tokens" USING btree ("token_hash");
CREATE UNIQUE INDEX "employees_user_unique" ON "employees" USING btree ("user_id");
CREATE UNIQUE INDEX "portfolio_items_asset_path_unique" ON "portfolio_items" USING btree ("asset_path");
CREATE UNIQUE INDEX "appointments_schedule_entry_unique" ON "appointments" USING btree ("schedule_entry_id");
CREATE UNIQUE INDEX "schedule_blocks_schedule_entry_unique" ON "schedule_blocks" USING btree ("schedule_entry_id");
CREATE UNIQUE INDEX "cancellation_credits_client_slot_unique" ON "cancellation_credits" USING btree ("client_id", "slot_number");
CREATE UNIQUE INDEX "integration_outbox_idempotency_unique" ON "integration_outbox" USING btree ("idempotency_key");
CREATE UNIQUE INDEX "calendar_syncs_appointment_provider_unique" ON "calendar_syncs" USING btree ("appointment_id", "provider");
CREATE UNIQUE INDEX "calendar_syncs_external_event_unique" ON "calendar_syncs" USING btree ("provider", "external_event_id");
CREATE UNIQUE INDEX "reminder_deliveries_idempotency_unique" ON "reminder_deliveries" USING btree ("idempotency_key");
CREATE UNIQUE INDEX "privacy_requests_protocol_unique" ON "privacy_requests" USING btree ("protocol");
--> statement-breakpoint
CREATE INDEX "users_role_status_idx" ON "users" USING btree ("role", "status");
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");
CREATE INDEX "auth_events_user_created_idx" ON "auth_events" USING btree ("user_id", "created_at");
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");
CREATE INDEX "services_active_idx" ON "services" USING btree ("active");
CREATE INDEX "employee_services_enabled_idx" ON "employee_services" USING btree ("employee_id", "enabled");
CREATE INDEX "portfolio_items_active_order_idx" ON "portfolio_items" USING btree ("active", "display_order");
CREATE INDEX "schedule_entries_employee_time_idx" ON "schedule_entries" USING btree ("employee_id", "starts_at", "ends_at");
CREATE INDEX "schedule_entries_active_idx" ON "schedule_entries" USING btree ("status", "employee_id", "starts_at");
CREATE INDEX "appointments_client_status_idx" ON "appointments" USING btree ("client_id", "status");
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");
CREATE INDEX "schedule_blocks_status_idx" ON "schedule_blocks" USING btree ("status");
CREATE INDEX "cancellation_credits_available_idx" ON "cancellation_credits" USING btree ("client_id", "available_at");
CREATE INDEX "integration_outbox_pending_idx" ON "integration_outbox" USING btree ("status", "next_attempt_at");
CREATE INDEX "calendar_syncs_status_idx" ON "calendar_syncs" USING btree ("status");
CREATE INDEX "reminder_deliveries_pending_idx" ON "reminder_deliveries" USING btree ("status", "scheduled_at");
CREATE INDEX "privacy_requests_status_due_idx" ON "privacy_requests" USING btree ("status", "due_at");
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type", "target_id");
CREATE INDEX "audit_log_actor_created_idx" ON "audit_log" USING btree ("actor_user_id", "created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "ensure_schedule_entry_has_one_detail"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entry_id uuid;
  old_entry_id uuid;
  new_entry_id uuid;
  entry_kind "schedule_kind";
  detail_count integer;
BEGIN
  IF TG_TABLE_NAME = 'schedule_entries' THEN
    IF TG_OP <> 'INSERT' THEN old_entry_id := OLD."id"; END IF;
    IF TG_OP <> 'DELETE' THEN new_entry_id := NEW."id"; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_entry_id := OLD."schedule_entry_id"; END IF;
    IF TG_OP <> 'DELETE' THEN new_entry_id := NEW."schedule_entry_id"; END IF;
  END IF;

  FOR entry_id IN
    SELECT DISTINCT candidate_id
    FROM unnest(ARRAY[old_entry_id, new_entry_id]) AS candidates(candidate_id)
    WHERE candidate_id IS NOT NULL
    ORDER BY candidate_id
  LOOP
    -- Serialize all concurrent detail mutations for this schedule entry.
    PERFORM 1 FROM "schedule_entries" WHERE "id" = entry_id FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

  SELECT "kind" INTO entry_kind FROM "schedule_entries" WHERE "id" = entry_id;
    IF NOT FOUND THEN CONTINUE; END IF;

  SELECT
    (SELECT count(*) FROM "appointments" WHERE "schedule_entry_id" = entry_id)
    + (SELECT count(*) FROM "schedule_blocks" WHERE "schedule_entry_id" = entry_id)
  INTO detail_count;

  IF detail_count <> 1 THEN
    RAISE EXCEPTION 'schedule entry % must have exactly one detail row', entry_id
      USING ERRCODE = '23514';
  END IF;
  IF entry_kind = 'APPOINTMENT' AND NOT EXISTS (
    SELECT 1 FROM "appointments" WHERE "schedule_entry_id" = entry_id
  ) THEN
    RAISE EXCEPTION 'appointment schedule entry % requires appointment detail', entry_id
      USING ERRCODE = '23514';
  END IF;
  IF entry_kind = 'BLOCK' AND NOT EXISTS (
    SELECT 1 FROM "schedule_blocks" WHERE "schedule_entry_id" = entry_id
  ) THEN
    RAISE EXCEPTION 'block schedule entry % requires block detail', entry_id
      USING ERRCODE = '23514';
  END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "schedule_entries_detail_required"
AFTER INSERT OR UPDATE OR DELETE ON "schedule_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "ensure_schedule_entry_has_one_detail"();
CREATE CONSTRAINT TRIGGER "appointments_schedule_detail_exactly_one"
AFTER INSERT OR UPDATE OR DELETE ON "appointments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "ensure_schedule_entry_has_one_detail"();
CREATE CONSTRAINT TRIGGER "schedule_blocks_schedule_detail_exactly_one"
AFTER INSERT OR UPDATE OR DELETE ON "schedule_blocks"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "ensure_schedule_entry_has_one_detail"();
