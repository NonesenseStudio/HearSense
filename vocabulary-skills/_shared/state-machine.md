# Shared learning state machine

## States

| State | Meaning                                                                         | Default container | Main action                                  |
| ----- | ------------------------------------------------------------------------------- | ----------------- | -------------------------------------------- |
| `L0`  | Little or no recognition                                                        | `candidate_inbox` | Do not activate by default                   |
| `L1`  | Sound or spelling feels familiar, but meaning is unavailable                    | `active_review`   | Build one semantic anchor and test retrieval |
| `L2`  | Meaning is correct but delayed, vague, or unstable                              | `active_review`   | Repair with audio-first retrieval            |
| `L3`  | Core meaning is understood from familiar audio within about 1–2 seconds, stably | `graduated`       | Remove from normal active review             |
| `L4`  | The learner can naturally produce the word                                      | `graduated`       | Optional advanced usage practice             |

The product's main conversion is `L1/L2 -> L3`. Production is a separate capability; do not block listening graduation on it.

## Transition rules

```text
candidate L0 -> L1  when the learner reports repeated or auditory familiarity
candidate L0 -> active L2  when the learner knows the meaning but retrieval is delayed
active L1/L2 -> L3  only after stable, correct auditory retrieval
active L1/L2 -> L2  after a correct but delayed, vague, or unstable attempt
graduated L3 -> L2  after a meaningful natural or audio re-encounter failure
L3 -> L4  only when production has been observed; this is optional
```

A single good answer is evidence, not automatic graduation. The default graduation gate is at least two `INSTANT` audio results across separate exposures in the latest three audio tests, with no `FAIL` or `VAGUE` in the latest two relevant tests. Implementations may tune this gate, but the change should be explicit and recorded.

## Result labels

- `INSTANT`: correct core meaning retrieved immediately; default latency 0–2 seconds or explicit immediate self-report.
- `SLOW`: correct meaning after noticeable delay; default latency over 2 seconds and up to about 5 seconds.
- `VAGUE`: related feeling or partial meaning without a reliable core concept.
- `FAIL`: no meaningful retrieval or an incorrect concept.

If latency is unavailable, use the learner's explicit timing description. Do not infer `INSTANT` from a correct answer alone.

## Anti-debt control

The daily standard is 20 minutes:

1. 3 minutes: rapid test of active words.
2. 7 minutes: repair the weakest active words.
3. 6 minutes: admit and build 0–5 new cards.
4. 4 minutes: audio-only retrieval test.

New-word allowance is determined by the active pool count at planning time:

```text
if active_review_count > 15:  allowance = 0
elif active_review_count >= 12: allowance = 2
elif active_review_count >= 8:  allowance = 3
else:                           allowance = 5
```

The active pool count is a safety signal, not a target. A day with zero new words is valid. Missing a day never creates make-up work; resume one normal session on the next available day.

## Priority order

For active repair: recent `FAIL` > `VAGUE` > `SLOW` > unstable `INSTANT`.

For candidate admission: repeated real encounters > high auditory familiarity > personal relevance > recent encounter > generic or random vocabulary.

## Invariants

- Retrieval happens before revealing the answer.
- Audio is the primary test for a listening goal; written tests cannot graduate an audio skill.
- One primary semantic anchor and one representative scene are enough for first exposure.
- Do not keep stable L3 words in the active queue just because a generic spaced-repetition schedule says so.
- Re-entry after forgetting is normal evidence, not a failure state.
