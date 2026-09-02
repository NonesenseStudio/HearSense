# Skill orchestration

These skills are independent entry points, but the normal product flow is:

```text
real content encounter
        |
        v
word-intake
   | candidate                    | admitted L1/L2
   v                              v
candidate_inbox              semantic-card
                                      |
                                      v
                             daily-session-planner
                                      |
                                      v
                              review-evaluator
                                      |
                         +------------+------------+
                         |                         |
                    active review              graduated
                         |                         |
                         +------------+------------+
                                      v
                             vocabulary-analyst
```

## Routing rules

- Use `word-intake` when the system has a submitted word but no admission decision.
- Use `semantic-card` only after a word is admitted to active review or when an existing card needs repair.
- Use `daily-session-planner` once per session to choose the bounded workload and preserve the active-pool cap.
- Use `review-evaluator` after every meaningful retrieval attempt; append its result before planning the next session.
- Use `vocabulary-analyst` for a date-bounded report, not for a single card or a single review event.

The caller should persist the evaluator's state transition and event before invoking another skill. If a skill returns `needs_clarification: true`, pause that item only; do not block unrelated candidates or create a larger session to compensate.

## Shared safety rails

The active pool is a workload budget, not a measure of ambition. New words may be zero. The standard session is at most 20 minutes. Retrieval precedes answer reveal, and stable auditory comprehension is enough for L3.
