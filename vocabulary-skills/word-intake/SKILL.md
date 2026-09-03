---
name: word-intake
description: "Classify a submitted English word by familiarity and route it to a candidate inbox or active listening-review pool. Use when deciding whether a word is worth learning, not when generating its semantic card or scoring a review."
---

# Word Intake

Decide whether a submitted word deserves attention in this learner's audio-first vocabulary system. Preserve the distinction between a truly unknown word and an ear-familiar word whose meaning cannot be retrieved.

Read [the shared data contracts](../_shared/data-contracts.md) and [the shared state machine](../_shared/state-machine.md) before implementing or changing this behavior.

## Input

Accept the intake object described in the shared contract. At minimum, use `word` and the learner's report. Use source, encounter count, auditory familiarity, personal relevance, and the current active-pool count when available.

If the report is ambiguous, do not invent familiarity. Return `needs_clarification: true` with one focused question, while still making the safest provisional classification.

## Decision procedure

1. Normalize the submitted word for matching, but preserve the learner's original form in `word_display` when useful.
2. Classify the learner's present state:
   - `L0` when the word is not recognized or is only a random dictionary discovery.
   - `L1` when its sound or spelling is familiar but the core meaning is unavailable.
   - `L2` when the learner can retrieve a roughly correct meaning only after delay or with uncertainty.
   - `L3` when the learner understands the core meaning immediately from audio or natural context.
   - `L4` only when natural production is explicitly evidenced; never infer it from recognition.
3. Choose a container:
   - `candidate_inbox` for L0 words without a strong reason to activate.
   - `active_review` for high-value L1/L2 words.
   - `graduated` for L3/L4 words; they do not need normal review.
4. Apply the anti-debt gate. If `active_review_count > 15`, do not activate another word today; route a qualified word to the candidate inbox with `activation_blocked_by_debt: true`.
5. Prefer real, repeated, personally relevant encounters. Do not promote a rare word merely because it looks advanced.

## Admission scoring

When ranking multiple candidates, use a transparent qualitative score or a normalized 0–100 score. Suggested factors are:

```text
priority = encounter_frequency
         + auditory_familiarity
         + personal_relevance
         + recent_encounter_bonus
         + comprehension_blocking_value
```

The score is for ordering, not for pretending that a precise measurement exists. Explain the strongest two reasons in `admission_reasons`.

## Output

Return a valid JSON object:

```json
{
  "word": "astonish",
  "classification": "L1",
  "container": "active_review",
  "admit": true,
  "priority": 86,
  "admission_reasons": [
    "repeated real-media encounter",
    "sound is familiar but meaning is unavailable"
  ],
  "activation_blocked_by_debt": false,
  "needs_clarification": false,
  "clarifying_question": null,
  "next_skill": "semantic-card"
}
```

`next_skill` is `semantic-card` only for an admitted word. Use `daily-session-planner` when the word is merely a candidate, and `review-evaluator` for an already active word being tested.

## Do not

- Add every unfamiliar word to active review.
- Treat “I have seen it” as meaning mastery.
- Use word count as the admission goal.
- Replace the learner's actual report with dictionary frequency guesses.
- Teach meanings or create a card in this skill; return the routing decision instead.
