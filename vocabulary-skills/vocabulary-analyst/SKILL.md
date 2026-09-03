---
name: vocabulary-analyst
description: "Analyze long-term vocabulary conversion, review-pool stability, auditory retrieval, latency, and natural re-encounter success. Use for evidence-backed progress reports and tuning the learning system."
---

# Vocabulary Analyst

Explain whether the learner is converting familiar words into immediately understood listening vocabulary while keeping review load sustainable.

Read [the shared data contracts](../_shared/data-contracts.md) and [the shared state machine](../_shared/state-machine.md) before implementing or changing this behavior.

## Input and evidence rules

Accept a date-bounded collection of word snapshots, review events, daily active-pool counts, and natural re-encounter events. State the period and sample sizes. If a denominator is zero or a required timestamp is missing, return `null` for that metric rather than guessing.

Separate:

- deliberate review from natural re-encounters;
- audio tests from written or production tests;
- activated words from total words ever seen;
- a true state transition from a one-off correct answer.

Do not claim that a change was caused by a particular intervention unless the supplied data supports that comparison. Use “consistent with” or “cannot determine” when appropriate.

## Metrics

Calculate these when possible:

```text
conversion_rate = graduated_L3_words / activated_words
review_pool_stability = days_with_active_pool_at_or_below_15 / observed_days
auditory_retrieval_rate = instant_audio_results / valid_audio_tests
median_retrieval_latency_ms = median(numeric_audio_latencies)
natural_reencounter_success = understood_natural_reencounters / natural_reencounters
```

Also report the active-pool trend (first versus last observed count or a simple slope), the share of `FAIL/VAGUE/SLOW` results, and the number of words re-entering after graduation. Do not use total words studied as the primary success metric; it may be shown only as context.

Use a low-confidence flag when the sample is too small for a stable conclusion, such as fewer than 5 activated words or fewer than 10 valid audio tests. These are default reporting heuristics, not universal statistical cutoffs.

## Diagnosis and recommendations

Identify at most three findings, each tied to observed evidence. Typical diagnoses include:

- rising active pool or low stability -> intake is too aggressive or graduation is too conservative;
- good written results but weak audio results -> written recognition is masking auditory retrieval weakness;
- high `VAGUE/FAIL` concentration in repeated candidates -> semantic anchors or source context need repair;
- improving audio rate and falling latency with a stable pool -> the system is converting words sustainably;
- frequent re-entry -> a word may have graduated too early or needs more natural contextual exposure.

For each recommendation, name the lever: reduce new-word allowance, repair semantic cards, increase audio-only tests, review source contexts, or tune the graduation gate. Do not prescribe more workload as the default response to poor progress.

## Output

Return a valid JSON object:

```json
{
  "period": { "start": "2026-08-01", "end": "2026-08-31" },
  "sample": {
    "activated_words": 18,
    "audio_tests": 74,
    "natural_reencounters": 11,
    "observed_days": 24
  },
  "metrics": {
    "conversion_rate": 0.61,
    "review_pool_stability": 0.88,
    "auditory_retrieval_rate": 0.72,
    "median_retrieval_latency_ms": 1840,
    "natural_reencounter_success": 0.64,
    "active_pool_trend": { "first": 11, "last": 8, "direction": "down" }
  },
  "confidence": "adequate",
  "findings": [
    {
      "finding": "Audio retrieval is improving while backlog is shrinking.",
      "evidence": ["auditory_retrieval_rate", "active_pool_trend"]
    }
  ],
  "recommendations": [
    {
      "priority": 1,
      "action": "Keep the current intake cap and continue audio-first testing.",
      "lever": "maintain"
    }
  ],
  "data_quality_notes": [],
  "next_skill": "daily-session-planner"
}
```

Use `confidence: "low"` when sample size or data completeness is weak, `"adequate"` when the core metrics are supported, and `"high"` only when multiple measures agree across a sufficiently long period. Never convert missing data into a positive trend.
