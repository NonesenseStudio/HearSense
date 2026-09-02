import { VocabularyRepository } from "../../../repositories/vocabulary";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id)
    throw createError({ statusCode: 400, statusMessage: "WORD_ID_REQUIRED" });
  const repository = new VocabularyRepository(getDb(event));
  const item = (await repository.listCards(300)).find(
    (entry) => entry.word.id === id,
  );
  if (!item)
    throw createError({
      statusCode: 404,
      statusMessage: "SEMANTIC_CARD_NOT_FOUND",
      message: "该词还没有可复习的语义卡。",
    });
  return { data: { word: item.word, card: item.card } };
});
