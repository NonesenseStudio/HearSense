import { DictionaryServiceError } from "../../services/dictionary";

export default defineEventHandler(async (event) => {
  const word = getRouterParam(event, "word")?.trim();
  if (!word)
    throw createError({
      statusCode: 400,
      statusMessage: "WORD_REQUIRED",
      message: "请输入要查询的英文单词。",
    });

  try {
    const entry = await useDictionaryService(event).lookup(word);
    if (!entry)
      throw createError({
        statusCode: 404,
        statusMessage: "WORD_NOT_FOUND",
        message: "词典中没有找到该词条。",
      });
    return { data: entry };
  } catch (error) {
    if (error instanceof DictionaryServiceError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: `DICTIONARY_${error.kind.toUpperCase()}`,
        message: error.message,
      });
    }
    throw error;
  }
});
