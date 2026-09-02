import { VocabularyRepository } from "../../repositories/vocabulary";

export default defineEventHandler(async (event) => {
  const requestedWord =
    typeof getQuery(event).word === "string"
      ? String(getQuery(event).word)
      : null;
  const repository = new VocabularyRepository(getDb(event));
  const cards = await repository.listCards(300);
  const unique = new Map<string, (typeof cards)[number]>();
  for (const item of cards) {
    if (!unique.has(item.word.id)) unique.set(item.word.id, item);
  }
  const items = [...unique.values()]
    .filter((item) =>
      requestedWord
        ? item.word.id === requestedWord
        : item.word.container === "active_review",
    )
    .map((item) => {
      const escaped = item.word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return {
        wordId: item.word.id,
        speechText: item.word.word,
        displayText: item.word.wordDisplay,
        contextPrompt: item.card.anchorSentence.replace(
          new RegExp(escaped, "gi"),
          "_____",
        ),
        pronunciation: item.card.pronunciation,
        audioUrl: item.card.audioUrl,
        state: item.word.state,
        retrievalPrompt: item.card.retrievalPrompt,
      };
    });
  return { data: { items } };
});
