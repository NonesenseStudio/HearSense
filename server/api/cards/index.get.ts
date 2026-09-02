import { VocabularyRepository } from "../../repositories/vocabulary";

export default defineEventHandler(async (event) => {
  const repository = new VocabularyRepository(getDb(event));
  return { data: { items: await repository.listCards() } };
});
