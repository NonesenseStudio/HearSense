---
name: semantic-card
description: "Create a minimal audio-first semantic card for an admitted English word using one core meaning, one natural example, and one memorable scene. Use when an L1/L2 word enters active review."
---

# Semantic Card

Convert an admitted word into the smallest useful representation for immediate listening comprehension. This skill is not a dictionary-entry generator.

Read [the shared data contracts](../_shared/data-contracts.md) and [the shared state machine](../_shared/state-machine.md) before implementing or changing this behavior.

## Input

Use the admitted word, its L1/L2 classification, source, source context, pronunciation if supplied, and learner language. The source sentence or scene should be preferred when it is available and appropriate to reuse. If pronunciation is unavailable, keep `pronunciation: null`; do not fabricate IPA.

## Card construction

1. Choose one primary semantic anchor that is common, useful, visualizable, and sufficient for the reported context.
2. Provide a short English concept and, for a Chinese-speaking learner, a concise Chinese bridge. The Chinese bridge is temporary support, not a second list of dictionary senses.
3. Use one short natural anchor sentence. Prefer the learner's source context; otherwise generate a clearly marked synthetic sentence.
4. Describe one concrete semantic scene in plain language. The scene should express what is happening, not merely repeat the translation.
5. Keep alternate senses, word family, synonyms, grammar notes, and etymology out of the primary card. Add them only as optional metadata when the current context requires them.
6. Preserve the original source and context separately from generated content so later analytics can distinguish real re-encounters from practice examples.

The preferred retrieval path is:

```text
audio -> core concept -> short Chinese bridge if needed -> scene
```

Do not make the learner reconstruct spelling before meaning. Do not reveal all senses on first exposure. If a later real context has a different sense, append it as an incremental sense rather than replacing the original anchor.

## Output

Return a valid JSON object compatible with the shared `Word record`:

```json
{
  "word": "manipulate",
  "pronunciation": null,
  "state": "L1",
  "container": "active_review",
  "core_meaning_en": "control someone through deliberate methods",
  "core_meaning_zh": "用手段控制 / 摆布",
  "anchor_sentence": "She's manipulating you.",
  "semantic_scene": "Someone is using emotional or psychological methods to control another person.",
  "source": "tv",
  "source_context": null,
  "example_origin": "generated",
  "alternate_senses": [],
  "retrieval_prompt": "What does this word mean when you hear it?"
}
```

If the supplied source sentence is used, set `example_origin` to `learner_source`. If the source contains a meaning different from the existing anchor, set `alternate_senses` to a concise list and explain the distinction in `context_note`.

## Quality checks

- The core meaning is one idea, not a slash-separated dictionary dump.
- The example is short, idiomatic, and relevant to listening.
- The scene can be imagined in a few seconds.
- Chinese is concise and natural.
- No unsupported pronunciation, source attribution, or certainty is introduced.
