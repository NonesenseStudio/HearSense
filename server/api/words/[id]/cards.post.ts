import { semanticCardInputSchema } from "~~/shared/schemas/vocabulary";
import { VocabularyRepository } from "../../../repositories/vocabulary";
import { createId, nowIso } from "../../../utils/ids";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id)
    throw createError({ statusCode: 400, statusMessage: "WORD_ID_REQUIRED" });
  const parsed = semanticCardInputSchema.safeParse(await readBody(event));
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_SEMANTIC_CARD",
      message: parsed.error.issues[0]?.message ?? "语义卡信息不完整",
    });
  const repository = new VocabularyRepository(getDb(event));
  const word = await repository.findWordById(id);
  if (!word)
    throw createError({ statusCode: 404, statusMessage: "WORD_NOT_FOUND" });
  const card = await repository.createCard(
    createId(),
    word,
    parsed.data,
    nowIso(),
  );
  return { data: { card } };
});
