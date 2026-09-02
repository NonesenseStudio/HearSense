import { generateSessionPlan } from "~~/shared/domain/planner";
import { VocabularyRepository } from "../../repositories/vocabulary";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const requestedMinutes = Number(query.minutes ?? 20);
  const duration = Number.isFinite(requestedMinutes)
    ? Math.min(20, Math.max(5, Math.round(requestedMinutes)))
    : 20;
  const today =
    typeof query.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.today)
      ? query.today
      : new Date().toISOString().slice(0, 10);
  const repository = new VocabularyRepository(getDb(event));
  const [activeWords, candidates] = await Promise.all([
    repository.listByContainer("active_review"),
    repository.listCandidates(),
  ]);
  const plan = generateSessionPlan({
    activeWords,
    candidateWords: candidates
      .filter((item) => !item.needsClarification)
      .map((item) => ({ word: item.word, priority: item.priority })),
    availableTimeMinutes: duration,
    today,
  });
  return { data: { plan } };
});
