import { z } from "zod";
import { VocabularyRepository } from "../../../repositories/vocabulary";
import { nowIso } from "../../../utils/ids";

const bodySchema = z.object({ until: z.iso.datetime().nullable().optional() });

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id)
    throw createError({ statusCode: 400, statusMessage: "WORD_ID_REQUIRED" });
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: "INVALID_DEFER_DATE" });
  const repository = new VocabularyRepository(getDb(event));
  const word = await repository.findWordById(id);
  if (!word || word.container !== "candidate_inbox")
    throw createError({
      statusCode: 404,
      statusMessage: "CANDIDATE_NOT_FOUND",
    });
  await repository.deferCandidate(id, parsed.data.until ?? null, nowIso());
  return { data: { deferred: true } };
});
