-- Records are evidence: once stored, a record is never changed or removed.
-- A correction is a new VOID record that references the original.
CREATE FUNCTION "records_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'records are append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "records_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "records"
  FOR EACH ROW EXECUTE FUNCTION "records_append_only"();--> statement-breakpoint
CREATE TRIGGER "records_no_truncate"
  BEFORE TRUNCATE ON "records"
  FOR EACH STATEMENT EXECUTE FUNCTION "records_append_only"();
