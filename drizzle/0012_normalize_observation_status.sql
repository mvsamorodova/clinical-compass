-- Follow-up is routine. Emergency status is derived from assessment alerts, never assigned by migration.
UPDATE patient_records SET status='stable' WHERE status='followup';
