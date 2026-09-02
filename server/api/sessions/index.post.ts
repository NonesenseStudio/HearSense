import { z } from "zod";
import { generateSessionPlan } from "~~/shared/domain/planner";
import { VocabularyRepository } from "../../repositories/vocabulary";
import { createId, nowIso } from "../../utils/ids";

const schema = z.object({
  durationMinutes: z.number().int().min(5).max(20).default(20),
  today: z.iso.date(),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_SESSION_REQUEST",
      message: parsed.error.issues[0]?.message,
    });
  const repository = new VocabularyRepository(getDb(event));
  const [activeWords, candidates] = await Promise.all([
    repository.listByContainer("active_review"),
    repository.listCandidates(),
  ]);
  const id = createId();
  const plan = generateSessionPlan({
    activeWords,
    candidateWords: candidates
      .filter((item) => !item.needsClarification)
      .map((item) => ({ word: item.word, priority: item.priority })),
    availableTimeMinutes: parsed.data.durationMinutes,
    today: parsed.data.today,
  });
  await repository.saveSession(plan, id, nowIso());
  return { data: { sessionId: id, plan: { ...plan, id } } };
});
