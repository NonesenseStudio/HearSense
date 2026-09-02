import { analyzeVocabulary } from "~~/shared/domain/analytics";
import { dateRangeSchema } from "~~/shared/schemas/vocabulary";
import { VocabularyRepository } from "../repositories/vocabulary";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const parsed = dateRangeSchema.safeParse({
    start: query.start,
    end: query.end,
  });
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_DATE_RANGE",
      message: parsed.error.issues[0]?.message ?? "日期范围无效",
    });
  const repository = new VocabularyRepository(getDb(event));
  const dataset = await repository.getAnalyticsDataset(
    parsed.data.start,
    parsed.data.end,
  );
  return { data: { analysis: analyzeVocabulary(dataset) } };
});
