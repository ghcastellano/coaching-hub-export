-- Experiment outcome: free-text result of a coaching experiment (what changed),
-- so the team page can record evidence of change per experiment. Additive +
-- idempotent; the app also adds it on boot (COACHING_TABLES_SQL).

ALTER TABLE coaching_experiments ADD COLUMN IF NOT EXISTS outcome TEXT;
