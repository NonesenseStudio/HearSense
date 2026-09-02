import { buildSemanticCardDraft } from "~~/shared/domain/semantic-card";
import { VocabularyRepository } from "../../../repositories/vocabulary";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id)
    throw createError({ statusCode: 400, statusMessage: "WORD_ID_REQUIRED" });
  const repository = new VocabularyRepository(getDb(event));
  const word = await repository.findWordById(id);
  if (!word)
    throw createError({ statusCode: 404, statusMessage: "WORD_NOT_FOUND" });
  let dictionary = null;
  try {
    dictionary = await useDictionaryService().lookup(word.word);
  } catch {
    dictionary = null;
  }
  return {
    data: {
      word,
      draft: buildSemanticCardDraft({
        word: word.word,
        source: word.source,
        sourceContext: word.sourceContext,
        dictionary,
      }),
    },
  };
});
