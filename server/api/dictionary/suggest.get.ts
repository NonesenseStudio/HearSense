import { z } from "zod";

const suggestionQuerySchema = z.object({
  q: z
    .string()
    .normalize("NFKC")
    .trim()
    .min(1, "请输入要联想的单词")
    .max(100, "联想关键词过长")
    .regex(/^[A-Za-z][A-Za-z\s'-]*$/, "请输入英文单词或短语"),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const parsed = suggestionQuerySchema.safeParse({
    q: query.q,
    limit: query.limit ?? 8,
  });
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_DICTIONARY_SUGGESTION",
      message: parsed.error.issues[0]?.message ?? "联想关键词无效",
    });
  }

  return {
    data: {
      items: await useDictionaryService(event).suggest(
        parsed.data.q,
        parsed.data.limit,
      ),
    },
  };
});
