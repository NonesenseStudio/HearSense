---
name: daily-session-planner
description: "Plan a bounded 20-minute vocabulary session from active and candidate words using the 5-15-20 anti-debt rule. Use when deciding today's review order, new-word allowance, and audio tests."
---

# Daily Session Planner

Create one manageable session whose workload can be completed today without creating tomorrow's review debt.

Read [the shared data contracts](../_shared/data-contracts.md) and [the shared state machine](../_shared/state-machine.md) before implementing or changing this behavior.

## Input

Accept `active_words`, `candidate_words`, `learner_history`, and optional `available_time_minutes` and `today`. Default to 20 minutes. If the learner has less time, scale or truncate the session; never silently extend it. A skipped day does not change the next session's budget.

## Planning rules

1. Count the active review pool before today's work. Do not use a guessed post-graduation count to justify more intake.
2. Set the new-word allowance:

```text
active_review_count > 15  -> 0
active_review_count >= 12 -> 2
active_review_count >= 8  -> 3
otherwise                 -> 5
```

3. Select active words for the rapid test and repair block. Prioritize recent `FAIL`, then `VAGUE`, then `SLOW`, then unstable `INSTANT`; prefer words with audio history and repeated real encounters.
4. Select candidates only up to the allowance. Rank repeated encounters, auditory familiarity, personal relevance, recent encounters, and comprehension-blocking value above generic list words.
5. Use the standard four phases:
   - 3 minutes: rapid retrieval test; graduate only words that already satisfy the evaluation gate.
   - 7 minutes: repair the weakest active words with retrieval before reveal.
   - 6 minutes: build or introduce 0–5 new cards.
   - 4 minutes: audio-only retrieval test for today's words.
6. Make the plan stop-safe. The learner may finish after 20 minutes without being told to catch up later.

## Output

Return a valid JSON object:

```json
{
  "date": "2026-08-31",
  "duration_minutes": 20,
  "active_review_count_before": 8,
  "new_word_limit": 3,
  "debt_status": "controlled",
  "active_word_ids": ["w1", "w2", "w3"],
  "new_word_ids": ["c1", "c2", "c3"],
  "session": [
    {"phase": "rapid_retrieval", "minutes": 3, "word_ids": ["w1", "w2", "w3"]},
    {"phase": "repair_weak_words", "minutes": 7, "word_ids": ["w1", "w2"]},
    {"phase": "new_word_intake", "minutes": 6, "word_ids": ["c1", "c2", "c3"]},
    {"phase": "audio_meaning_test", "minutes": 4, "word_ids": ["w1", "w2", "w3", "c1", "c2", "c3"]}
  ],
  "reason": "The active pool is below 12, so three new candidates are allowed.",
  "next_skill": "review-evaluator"
}
```

Use `debt_status: "blocked"` when the active pool is over 15, `"watch"` when it is 12–15, and `"controlled"` below 12. Keep the numeric count and reason even when there are no candidates.

## Do not

- Schedule a fixed number of new words regardless of backlog.
- Add make-up work after a missed day.
- Spend the whole session rereading cards.
- Keep obviously mastered L3 words in the normal active list.
- Treat the 5-word ceiling as a quota; zero is a valid allowance.
