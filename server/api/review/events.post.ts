import { evaluateReview } from "~~/shared/domain/review";
import { reviewSubmissionSchema } from "~~/shared/schemas/vocabulary";
import { VocabularyRepository } from "../../repositories/vocabulary";
import { createId, nowIso } from "../../utils/ids";
import { hashPayload, isOfflineReplay } from "../../utils/sync";

export default defineEventHandler(async (event) => {
  const parsed = reviewSubmissionSchema.safeParse(await readBody(event));
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_REVIEW_EVENT",
      message: parsed.error.issues[0]?.message ?? "复习事件无效",
    });
  const repository = new VocabularyRepository(getDb(event));
  if (
    parsed.data.clientEventId &&
    (await repository.hasReviewClientEvent(parsed.data.clientEventId))
  )
    return {
      data: { duplicate: true, clientEventId: parsed.data.clientEventId },
    };
  const word = await repository.findWordById(parsed.data.wordId);
  if (!word)
    throw createError({ statusCode: 404, statusMessage: "WORD_NOT_FOUND" });
  const history = await repository.getReviewHistory(word.id);
  const evaluation = evaluateReview(word, parsed.data, history);
  await repository.saveReview({
    eventId: createId(),
    transitionId: createId(),
    naturalEventId: createId(),
    word,
    submission: parsed.data,
    evaluation,
    now: nowIso(),
    offlinePayloadHash: isOfflineReplay(event)
      ? await hashPayload(parsed.data)
      : undefined,
  });
  return { data: { evaluation } };
});
