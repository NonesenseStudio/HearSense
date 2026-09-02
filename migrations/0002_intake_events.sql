CREATE TABLE intake_events (
  id TEXT PRIMARY KEY,
  client_event_id TEXT UNIQUE,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
  raw_input_json TEXT NOT NULL CHECK (json_valid(raw_input_json)),
  word_original TEXT NOT NULL,
  word_normalized TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  decided_container TEXT NOT NULL CHECK (decided_container IN ('candidate_inbox', 'active_review', 'graduated')),
  admitted INTEGER NOT NULL CHECK (admitted IN (0, 1)),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_intake_events_word_time ON intake_events(word_id, occurred_at DESC);

CREATE TRIGGER intake_events_immutable_update
BEFORE UPDATE ON intake_events
BEGIN
  SELECT RAISE(ABORT, 'intake_events are immutable');
END;

CREATE TRIGGER intake_events_immutable_delete
BEFORE DELETE ON intake_events
BEGIN
  SELECT RAISE(ABORT, 'intake_events are immutable');
END;

ALTER TABLE candidate_entries ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deferred', 'activated'));
