# Shared data contracts

All five skills exchange JSON-like objects using the same field names and enums. Fields marked optional may be omitted or set to `null`; do not invent unavailable measurements.

## Word record

```json
{
  "id": "optional-stable-id",
  "word": "manipulate",
  "pronunciation": "/məˈnɪpjəleɪt/",
  "state": "L1",
  "container": "active_review",
  "core_meaning_en": "control someone or something through deliberate methods",
  "core_meaning_zh": "用手段控制 / 摆布",
  "anchor_sentence": "She's manipulating you.",
  "semantic_scene": "Someone is using psychological or emotional methods to control another person.",
  "source": "movie",
  "source_context": null,
  "encounter_count": 3,
  "last_encounter_at": null,
  "retrieval_latency_ms": null,
  "audio_success": false,
  "active_usage_verified": false,
  "recent_results": [],
  "last_result": "FAIL",
  "mastery_score": 0,
  "active": true
}
```

### Enumerations

- `state`: `L0`, `L1`, `L2`, `L3`, `L4`
- `container`: `candidate_inbox`, `active_review`, `graduated`
- `source`: `movie`, `tv`, `song`, `youtube`, `podcast`, `game`, `conversation`, `book`, `article`, `school`, `work`, `other`
- review result: `INSTANT`, `SLOW`, `VAGUE`, `FAIL`
- test mode: `audio`, `written`, `contextual`, `production`

`L3` means listening mastery and normally belongs in `graduated`; `L4` means active production and is not required for listening graduation. A product may keep optional metadata such as `active_usage_verified` without forcing an L3 word to reach L4.

## Intake input

```json
{
  "word": "astonish",
  "learner_report": "I have heard it many times but cannot recall the meaning.",
  "source": "tv",
  "source_context": "optional sentence or scene",
  "encounter_count": 3,
  "heard_before": true,
  "seen_before": true,
  "audio_familiarity": "high",
  "current_state": null,
  "active_review_count": 8,
  "candidate_count": 12,
  "personal_relevance": "high"
}
```

`audio_familiarity` may be `high`, `medium`, `low`, or `unknown`. Intake may infer it from the report, but must mark uncertain in `needs_clarification` rather than pretending it was measured.

## Review event

```json
{
  "word_id": "optional-stable-id",
  "word": "manipulate",
  "test_mode": "audio",
  "learner_response": "用手段控制别人",
  "latency_ms": 1350,
  "answer_revealed": false,
  "context_used": "She's manipulating you.",
  "is_natural_reencounter": false,
  "timestamp": "2026-08-31T00:00:00Z"
}
```

The evaluator may accept a pre-labeled response only when the label is accompanied by evidence such as a latency measurement or an explicit learner self-report. Never treat merely recognizing a displayed spelling as auditory success.

## Planner input and output

Planner input contains `active_words`, `candidate_words`, `learner_history`, `available_time_minutes` (default `20`), and optionally `today`. Its output contains `active_word_ids`, `new_word_ids`, `new_word_limit`, `debt_status`, and a four-phase `session`.

## Analyst input

Analyst input is a period-labeled collection of word snapshots and review events. It must include enough timestamps to calculate trends; otherwise return `null` for the affected metric and explain the limitation.

## Output discipline

Machine-facing responses should be valid JSON with no trailing prose inside the object. Human-facing callers may add a short explanation after the JSON, but must not change enum values or silently omit an uncertainty note.
