import { evaluateIntake, normalizeWord } from "~~/shared/domain/intake";
import { buildSemanticCardDraft } from "~~/shared/domain/semantic-card";
import { intakeInputSchema } from "~~/shared/schemas/vocabulary";
import { VocabularyRepository } from "../repositories/vocabulary";
import { createId, nowIso } from "../utils/ids";
import { hashPayload, isOfflineReplay } from "../utils/sync";

export default defineEventHandler(async (event) => {
  const parsed = intakeInputSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_INTAKE",
      message: parsed.error.issues[0]?.message ?? "录入信息无效",
    });
  }

  const repository = new VocabularyRepository(getDb(event));
  if (
    parsed.data.clientEventId &&
    (await repository.hasIntakeClientEvent(parsed.data.clientEventId))
  )
    return {
      data: { duplicate: true, clientEventId: parsed.data.clientEventId },
    };
  const existing = await repository.findWordByNormalized(
    normalizeWord(parsed.data.word),
  );
  const activeReviewCount = await repository.countByContainer("active_review");
  const decision = evaluateIntake(parsed.data, {
    activeReviewCount,
    currentState: existing?.state,
    currentContainer: existing?.container,
  });
  const timestamp = nowIso();
  const word = await repository.saveIntake({
    id: createId(),
    eventId: createId(),
    clientEventId: parsed.data.clientEventId,
    input: parsed.data,
    decision,
    existing,
    occurredAt: parsed.data.occurredAt ?? timestamp,
    createdAt: timestamp,
    offlinePayloadHash: isOfflineReplay(event)
      ? await hashPayload(parsed.data)
      : undefined,
  });

  let dictionary = null;
  if (decision.admit && !existing) {
    try {
      dictionary = await useDictionaryService().lookup(decision.word);
    } catch {
      dictionary = null;
    }
  }

  return {
    data: {
      word,
      decision,
      cardDraft: decision.admit
        ? buildSemanticCardDraft({
            word: decision.word,
            source: word.source,
            sourceContext: word.sourceContext,
            dictionary,
          })
        : null,
      activeReviewCountBefore: activeReviewCount,
    },
  };
});
