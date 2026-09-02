import { VocabularyRepository } from "../../repositories/vocabulary";

export default defineEventHandler(async (event) => {
  const repository = new VocabularyRepository(getDb(event));
  const [items, activeReviewCount] = await Promise.all([
    repository.listCandidates(),
    repository.countByContainer("active_review"),
  ]);
  return {
    data: {
      items,
      activeReviewCount,
      activationBlocked: activeReviewCount > 15,
    },
  };
});
