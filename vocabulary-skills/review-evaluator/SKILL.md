---
name: review-evaluator
description: "Evaluate a vocabulary retrieval response as INSTANT, SLOW, VAGUE, or FAIL and update L0-L4 state, graduation, or re-entry. Use after an audio, written, contextual, or production test."
---

# Review Evaluator

Turn one observed response into a conservative learning-state update. Retrieval must be attempted before the answer is shown.

Read [the shared data contracts](../_shared/data-contracts.md) and [the shared state machine](../_shared/state-machine.md) before implementing or changing this behavior.

## Input

Accept the current word record plus a review event. Use `test_mode`, the learner's response, `latency_ms` when measured, whether the answer was revealed before the response, the context, and recent results. `audio` is the decisive mode for listening graduation.

## Classification

Return exactly one result:

- `INSTANT`: the core meaning is correct and retrieved in about 0–2 seconds, or the learner explicitly reports immediate retrieval.
- `SLOW`: the core meaning is correct but delayed, normally over 2 seconds and up to about 5 seconds.
- `VAGUE`: the response is directionally related but lacks a dependable core concept.
- `FAIL`: the response is absent, unrelated, or wrong.

If the answer was revealed before the learner attempted retrieval, mark the event as `contaminated: true`; it may be recorded as exposure but must not count as a successful retrieval.

Do not infer `INSTANT` just because a displayed word was recognized. A written result can improve the semantic record but cannot graduate a listening state.

## State update

Use recent results more heavily than lifetime averages. The optional score mapping is `FAIL=0`, `VAGUE=1`, `SLOW=2`, `INSTANT=3`; it is a diagnostic aid, not the graduation rule.

Default transitions:

```text
L1 + FAIL       -> L1
L1/L2 + VAGUE   -> L2
L1/L2 + SLOW    -> L2
L1/L2 + INSTANT -> L3 only if the stability gate is met; otherwise L2
L3/L4 + FAIL or VAGUE on a meaningful audio/re-encounter -> L2
```

The default stability gate is at least two `INSTANT` audio results across separate exposures in the latest three audio tests, with no `FAIL` or `VAGUE` in the latest two relevant tests. Keep the word active until the gate is met. A production test may set `active_usage_verified: true`, but it is not required for L3 graduation.

## Output

Return a valid JSON object:

```json
{
  "word": "distinguish",
  "result": "INSTANT",
  "test_mode": "audio",
  "contaminated": false,
  "state_before": "L2",
  "state_after": "L3",
  "container_after": "graduated",
  "graduated": true,
  "reentered": false,
  "mastery_score": 2.8,
  "recent_results": ["INSTANT", "INSTANT", "SLOW"],
  "feedback": "Keep the core scene; this word can leave normal review.",
  "next_action": "allow_natural_reencounter"
}
```

When a word graduates, remove it from normal active review but allow natural re-encounters and occasional audits. When it re-enters, do not describe forgetting as failure; record `reentered: true` and schedule repair.

## Do not

- Reveal the answer before retrieval.
- Require active production before listening graduation.
- Graduate on one contaminated or written-only success.
- Keep an L3 word active because of an unrelated generic SRS due date.
- Overreact to one noisy result when recent evidence remains strong; do record the event and let the next test resolve it.
