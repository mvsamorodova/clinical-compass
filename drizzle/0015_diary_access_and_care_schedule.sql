ALTER TABLE patient_records ADD COLUMN status_alert_cursor integer NOT NULL DEFAULT 0;
ALTER TABLE recovery_entries ADD COLUMN shared_doctor_id text REFERENCES users(id);
ALTER TABLE medication_orders ADD COLUMN interval_hours integer;
ALTER TABLE medication_orders ADD COLUMN next_due_at integer;
ALTER TABLE medication_orders ADD COLUMN last_taken_at integer;
CREATE TABLE medication_intakes (
 id text PRIMARY KEY NOT NULL,
 medication_id text NOT NULL REFERENCES medication_orders(id),
 patient_id text NOT NULL REFERENCES users(id),
 order_revision integer NOT NULL,
 due_at integer NOT NULL,
 taken_at integer NOT NULL,
 next_due_at integer NOT NULL
);
CREATE UNIQUE INDEX medication_intake_per_cycle ON medication_intakes(medication_id,order_revision,due_at);
