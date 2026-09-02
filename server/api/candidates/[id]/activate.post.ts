import { buildSemanticCardDraft } from "~~/shared/domain/semantic-card";
import { VocabularyRepository } from "../../../repositories/vocabulary";
import { createId, nowIso } from "../../../utils/ids";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id)
    throw createError({ statusCode: 400, statusMessage: "WORD_ID_REQUIRED" });

  const repository = new VocabularyRepository(getDb(event));
  const [word, activeReviewCount] = await Promise.all([
    repository.findWordById(id),
    repository.countByContainer("active_review"),
  ]);
  if (!word || word.container !== "candidate_inbox")
    throw createError({
      statusCode: 404,
      statusMessage: "CANDIDATE_NOT_FOUND",
      message: "候选词不存在或已处理。",
    });
  if (word.state === "L0")
    throw createError({
      statusCode: 422,
      statusMessage: "CLARIFICATION_REQUIRED",
      message: "这个词仍是 L0。请先回答听到它时能否回忆核心含义。",
    });
  if (activeReviewCount > 15)
    throw createError({
      statusCode: 409,
      statusMessage: "ACTIVE_POOL_BLOCKED",
      message: "主动复习池已超过 15，今天先不激活新词。",
    });

  await repository.activateCandidate(word, createId(), nowIso());
  let dictionary = null;
  try {
    dictionary = await useDictionaryService().lookup(word.word);
  } catch {
    dictionary = null;
  }
  return {
    data: {
      activated: true,
      cardDraft: buildSemanticCardDraft({
        word: word.word,
        source: word.source,
        sourceContext: word.sourceContext,
        dictionary,
      }),
    },
  };
});
