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
    -- Serialize detail mutations without conflicting with the KEY SHARE lock
    -- acquired by their foreign keys.
    PERFORM 1 FROM "schedule_entries" WHERE "id" = entry_id FOR NO KEY UPDATE;
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
CREATE OR REPLACE FUNCTION "serialize_active_schedule_entry_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'ACTIVE' THEN
    -- Serialize one employee's active interval writes before the GiST
    -- exclusion check, while remaining compatible with foreign-key KEY SHARE.
    PERFORM 1
      FROM "employees"
      WHERE "id" = NEW."employee_id"
      FOR NO KEY UPDATE;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "schedule_entries_serialize_active_write"
BEFORE INSERT OR UPDATE ON "schedule_entries"
FOR EACH ROW EXECUTE FUNCTION "serialize_active_schedule_entry_write"();
