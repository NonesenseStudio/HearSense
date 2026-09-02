PRAGMA foreign_keys = ON;

CREATE TABLE words (
  id TEXT PRIMARY KEY,
  word_original TEXT NOT NULL,
  word_normalized TEXT NOT NULL UNIQUE,
  pronunciation TEXT,
  audio_url TEXT,
  state TEXT NOT NULL CHECK (state IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  container TEXT NOT NULL CHECK (container IN ('candidate_inbox', 'active_review', 'graduated')),
  source TEXT CHECK (source IS NULL OR source IN ('movie', 'tv', 'song', 'youtube', 'podcast', 'game', 'conversation', 'book', 'article', 'school', 'work', 'other')),
  source_context TEXT,
  learner_report TEXT,
  encounter_count INTEGER NOT NULL DEFAULT 0 CHECK (encounter_count >= 0),
  last_encounter_at TEXT,
  audio_familiarity TEXT NOT NULL DEFAULT 'unknown' CHECK (audio_familiarity IN ('high', 'medium', 'low', 'unknown')),
  personal_relevance TEXT NOT NULL DEFAULT 'unknown' CHECK (personal_relevance IN ('high', 'medium', 'low', 'unknown')),
  active_usage_verified INTEGER NOT NULL DEFAULT 0 CHECK (active_usage_verified IN (0, 1)),
  last_result TEXT CHECK (last_result IS NULL OR last_result IN ('INSTANT', 'SLOW', 'VAGUE', 'FAIL')),
  retrieval_latency_ms INTEGER CHECK (retrieval_latency_ms IS NULL OR retrieval_latency_ms >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (state IN ('L0') AND container = 'candidate_inbox') OR
    (state IN ('L1', 'L2') AND container IN ('candidate_inbox', 'active_review')) OR
    (state IN ('L3', 'L4') AND container = 'graduated')
  )
);

CREATE INDEX idx_words_container_updated ON words(container, updated_at DESC);
CREATE INDEX idx_words_state ON words(state);

CREATE TABLE candidate_entries (
  word_id TEXT PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
  priority INTEGER CHECK (priority IS NULL OR priority BETWEEN 0 AND 100),
  admission_reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(admission_reasons_json)),
  activation_blocked_by_debt INTEGER NOT NULL DEFAULT 0 CHECK (activation_blocked_by_debt IN (0, 1)),
  needs_clarification INTEGER NOT NULL DEFAULT 0 CHECK (needs_clarification IN (0, 1)),
  clarifying_question TEXT,
  deferred_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE semantic_cards (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  sense_order INTEGER NOT NULL DEFAULT 1 CHECK (sense_order >= 1),
  pronunciation TEXT,
  audio_url TEXT,
  core_meaning_en TEXT NOT NULL,
  core_meaning_zh TEXT NOT NULL,
  anchor_sentence TEXT NOT NULL,
  semantic_scene TEXT NOT NULL,
  example_origin TEXT NOT NULL CHECK (example_origin IN ('learner_source', 'generated')),
  retrieval_prompt TEXT NOT NULL,
  context_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(word_id, sense_order)
);

CREATE INDEX idx_semantic_cards_word ON semantic_cards(word_id, sense_order);

CREATE TABLE learning_sessions (
  id TEXT PRIMARY KEY,
  session_date TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 0 AND 20),
  active_review_count_before INTEGER NOT NULL CHECK (active_review_count_before >= 0),
  new_word_limit INTEGER NOT NULL CHECK (new_word_limit BETWEEN 0 AND 5),
  debt_status TEXT NOT NULL CHECK (debt_status IN ('controlled', 'watch', 'blocked')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'stopped', 'completed')),
  plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_learning_sessions_date ON learning_sessions(session_date DESC);

CREATE TABLE review_events (
  id TEXT PRIMARY KEY,
  client_event_id TEXT UNIQUE,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES learning_sessions(id) ON DELETE SET NULL,
  test_mode TEXT NOT NULL CHECK (test_mode IN ('audio', 'written', 'contextual', 'production')),
  learner_response TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('INSTANT', 'SLOW', 'VAGUE', 'FAIL')),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  answer_revealed INTEGER NOT NULL CHECK (answer_revealed IN (0, 1)),
  contaminated INTEGER NOT NULL CHECK (contaminated IN (0, 1)),
  context_used TEXT,
  is_natural_reencounter INTEGER NOT NULL DEFAULT 0 CHECK (is_natural_reencounter IN (0, 1)),
  state_before TEXT NOT NULL CHECK (state_before IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  state_after TEXT NOT NULL CHECK (state_after IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  graduated INTEGER NOT NULL DEFAULT 0 CHECK (graduated IN (0, 1)),
  reentered INTEGER NOT NULL DEFAULT 0 CHECK (reentered IN (0, 1)),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_review_events_word_time ON review_events(word_id, occurred_at DESC);
CREATE INDEX idx_review_events_mode_time ON review_events(test_mode, occurred_at DESC);

CREATE TRIGGER review_events_immutable_update
BEFORE UPDATE ON review_events
BEGIN
  SELECT RAISE(ABORT, 'review_events are immutable');
END;

CREATE TRIGGER review_events_immutable_delete
BEFORE DELETE ON review_events
BEGIN
  SELECT RAISE(ABORT, 'review_events are immutable');
END;

CREATE TABLE natural_reencounter_events (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
  review_event_id TEXT REFERENCES review_events(id) ON DELETE RESTRICT,
  source TEXT CHECK (source IS NULL OR source IN ('movie', 'tv', 'song', 'youtube', 'podcast', 'game', 'conversation', 'book', 'article', 'school', 'work', 'other')),
  source_context TEXT,
  understood INTEGER NOT NULL CHECK (understood IN (0, 1)),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_natural_reencounters_time ON natural_reencounter_events(occurred_at DESC);

CREATE TABLE state_transitions (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
  review_event_id TEXT REFERENCES review_events(id) ON DELETE RESTRICT,
  from_state TEXT NOT NULL CHECK (from_state IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  to_state TEXT NOT NULL CHECK (to_state IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  from_container TEXT NOT NULL CHECK (from_container IN ('candidate_inbox', 'active_review', 'graduated')),
  to_container TEXT NOT NULL CHECK (to_container IN ('candidate_inbox', 'active_review', 'graduated')),
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_state_transitions_word_time ON state_transitions(word_id, occurred_at DESC);

CREATE TRIGGER state_transitions_immutable_update
BEFORE UPDATE ON state_transitions
BEGIN
  SELECT RAISE(ABORT, 'state_transitions are immutable');
END;

CREATE TRIGGER state_transitions_immutable_delete
BEFORE DELETE ON state_transitions
BEGIN
  SELECT RAISE(ABORT, 'state_transitions are immutable');
END;

CREATE TABLE daily_pool_snapshots (
  snapshot_date TEXT PRIMARY KEY,
  active_review_count INTEGER NOT NULL CHECK (active_review_count >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE synced_offline_events (
  client_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('review', 'natural_reencounter', 'intake')),
  payload_hash TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE app_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  daily_minutes INTEGER NOT NULL DEFAULT 20 CHECK (daily_minutes BETWEEN 5 AND 20),
  autoplay_audio INTEGER NOT NULL DEFAULT 1 CHECK (autoplay_audio IN (0, 1)),
  audio_speed REAL NOT NULL DEFAULT 1 CHECK (audio_speed IN (0.75, 1, 1.25)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
