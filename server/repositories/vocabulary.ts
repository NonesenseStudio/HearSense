import type { D1Database } from "@cloudflare/workers-types";
import type { AnalyticsDataset } from "~~/shared/types/analytics";
import type {
  IntakeInput,
  ReviewSubmission,
  SemanticCardInput,
} from "~~/shared/schemas/vocabulary";
import type {
  IntakeDecision,
  LearningState,
  ReviewEvaluation,
  ReviewEvidence,
  ReviewResult,
  SemanticCard,
  SessionPlan,
  WordContainer,
  WordRecord,
  WordSource,
} from "~~/shared/types/vocabulary";

interface WordRow {
  id: string;
  word_original: string;
  word_normalized: string;
  pronunciation: string | null;
  audio_url: string | null;
  state: LearningState;
  container: WordContainer;
  source: WordSource | null;
  source_context: string | null;
  encounter_count: number;
  last_encounter_at: string | null;
  audio_familiarity: WordRecord["audioFamiliarity"];
  personal_relevance: WordRecord["personalRelevance"];
  learner_report: string | null;
  active_usage_verified: number;
  last_result: ReviewResult | null;
  retrieval_latency_ms: number | null;
  created_at: string;
  updated_at: string;
}

function mapWord(row: WordRow): WordRecord {
  return {
    id: row.id,
    word: row.word_normalized,
    wordDisplay: row.word_original,
    pronunciation: row.pronunciation,
    audioUrl: row.audio_url,
    state: row.state,
    container: row.container,
    source: row.source,
    sourceContext: row.source_context,
    encounterCount: row.encounter_count,
    lastEncounterAt: row.last_encounter_at,
    audioFamiliarity: row.audio_familiarity,
    personalRelevance: row.personal_relevance,
    learnerReport: row.learner_report,
    activeUsageVerified: row.active_usage_verified === 1,
    lastResult: row.last_result,
    retrievalLatencyMs: row.retrieval_latency_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface CardRow {
  id: string;
  word_id: string;
  sense_order: number;
  pronunciation: string | null;
  audio_url: string | null;
  core_meaning_en: string;
  core_meaning_zh: string;
  anchor_sentence: string;
  semantic_scene: string;
  example_origin: "learner_source" | "generated";
  retrieval_prompt: string;
  context_note: string | null;
  created_at: string;
  updated_at: string;
}

function mapCard(row: CardRow): SemanticCard {
  return {
    id: row.id,
    wordId: row.word_id,
    senseOrder: row.sense_order,
    pronunciation: row.pronunciation,
    audioUrl: row.audio_url,
    coreMeaningEn: row.core_meaning_en,
    coreMeaningZh: row.core_meaning_zh,
    anchorSentence: row.anchor_sentence,
    semanticScene: row.semantic_scene,
    exampleOrigin: row.example_origin,
    retrievalPrompt: row.retrieval_prompt,
    contextNote: row.context_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CandidateListItem {
  word: WordRecord;
  priority: number | null;
  admissionReasons: string[];
  activationBlockedByDebt: boolean;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
  deferredUntil: string | null;
  status: "pending" | "deferred" | "activated";
}

export interface CardListItem {
  word: WordRecord;
  card: SemanticCard;
}

export interface RecentReviewItem {
  id: string;
  word: string;
  testMode: ReviewSubmission["testMode"];
  result: ReviewResult;
  contaminated: boolean;
  occurredAt: string;
}

export class VocabularyRepository {
  constructor(private readonly db: D1Database) {}

  async countByContainer(container: WordContainer): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS count FROM words WHERE container = ?")
      .bind(container)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async findWordById(id: string): Promise<WordRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM words WHERE id = ?")
      .bind(id)
      .first<WordRow>();
    return row ? mapWord(row) : null;
  }

  async findWordByNormalized(word: string): Promise<WordRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM words WHERE word_normalized = ?")
      .bind(word)
      .first<WordRow>();
    return row ? mapWord(row) : null;
  }

  async hasIntakeClientEvent(clientEventId: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 AS found FROM intake_events WHERE client_event_id = ?")
      .bind(clientEventId)
      .first<{ found: number }>();
    return row?.found === 1;
  }

  async hasReviewClientEvent(clientEventId: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 AS found FROM review_events WHERE client_event_id = ?")
      .bind(clientEventId)
      .first<{ found: number }>();
    return row?.found === 1;
  }

  async listByContainer(
    container: WordContainer,
    limit = 100,
  ): Promise<WordRecord[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM words WHERE container = ? ORDER BY updated_at DESC LIMIT ?",
      )
      .bind(container, limit)
      .all<WordRow>();
    return result.results.map(mapWord);
  }

  async saveIntake(args: {
    id: string;
    eventId: string;
    clientEventId?: string;
    input: IntakeInput;
    decision: IntakeDecision;
    existing: WordRecord | null;
    occurredAt: string;
    createdAt: string;
    offlinePayloadHash?: string;
  }): Promise<WordRecord> {
    const wordId = args.existing?.id ?? args.id;
    const encounterCount = Math.max(
      args.existing?.encounterCount ?? 0,
      args.input.encounterCount ?? 1,
    );
    const statements = [];

    if (args.existing) {
      statements.push(
        this.db
          .prepare(
            `
        UPDATE words SET
          source = COALESCE(?, source), source_context = COALESCE(?, source_context), learner_report = COALESCE(?, learner_report),
          encounter_count = ?, last_encounter_at = ?, audio_familiarity = ?, personal_relevance = ?, updated_at = ?
        WHERE id = ?
      `,
          )
          .bind(
            args.input.source ?? null,
            args.input.sourceContext ?? null,
            args.input.learnerReport ?? null,
            encounterCount,
            args.occurredAt,
            args.input.audioFamiliarity,
            args.input.personalRelevance,
            args.createdAt,
            wordId,
          ),
      );
    } else {
      statements.push(
        this.db
          .prepare(
            `
        INSERT INTO words (
          id, word_original, word_normalized, state, container, source, source_context, learner_report,
          encounter_count, last_encounter_at, audio_familiarity, personal_relevance, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
          )
          .bind(
            wordId,
            args.decision.wordDisplay,
            args.decision.word,
            args.decision.classification,
            args.decision.container,
            args.input.source ?? null,
            args.input.sourceContext ?? null,
            args.input.learnerReport ?? null,
            encounterCount,
            args.occurredAt,
            args.input.audioFamiliarity,
            args.input.personalRelevance,
            args.createdAt,
            args.createdAt,
          ),
      );
      if (args.decision.container === "candidate_inbox") {
        statements.push(
          this.db
            .prepare(
              `
          INSERT INTO candidate_entries (
            word_id, priority, admission_reasons_json, activation_blocked_by_debt, needs_clarification,
            clarifying_question, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
            )
            .bind(
              wordId,
              args.decision.priority,
              JSON.stringify(args.decision.admissionReasons),
              Number(args.decision.activationBlockedByDebt),
              Number(args.decision.needsClarification),
              args.decision.clarifyingQuestion,
              args.createdAt,
              args.createdAt,
            ),
        );
      }
    }

    statements.push(
      this.db
        .prepare(
          `
      INSERT INTO intake_events (
        id, client_event_id, word_id, raw_input_json, word_original, word_normalized, classification,
        decided_container, admitted, occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        )
        .bind(
          args.eventId,
          args.clientEventId ?? null,
          wordId,
          JSON.stringify(args.input),
          args.decision.wordDisplay,
          args.decision.word,
          args.decision.classification,
          args.decision.container,
          Number(args.decision.admit),
          args.occurredAt,
          args.createdAt,
        ),
    );

    if (args.clientEventId && args.offlinePayloadHash) {
      statements.push(
        this.db
          .prepare(
            `
        INSERT OR IGNORE INTO synced_offline_events (client_event_id, event_type, payload_hash, synced_at)
        VALUES (?, 'intake', ?, ?)
      `,
          )
          .bind(args.clientEventId, args.offlinePayloadHash, args.createdAt),
      );
    }

    await this.db.batch(statements);
    const saved = await this.findWordById(wordId);
    if (!saved) throw new Error("保存单词后无法读取记录");
    return saved;
  }

  async listCandidates(limit = 100): Promise<CandidateListItem[]> {
    const result = await this.db
      .prepare(
        `
      SELECT w.*, c.priority, c.admission_reasons_json, c.activation_blocked_by_debt,
        c.needs_clarification, c.clarifying_question, c.deferred_until, c.status
      FROM candidate_entries c JOIN words w ON w.id = c.word_id
      WHERE c.status IN ('pending', 'deferred') AND w.container = 'candidate_inbox'
      ORDER BY (c.status = 'pending') DESC, c.priority DESC, w.updated_at DESC
      LIMIT ?
    `,
      )
      .bind(limit)
      .all<
        WordRow & {
          priority: number | null;
          admission_reasons_json: string;
          activation_blocked_by_debt: number;
          needs_clarification: number;
          clarifying_question: string | null;
          deferred_until: string | null;
          status: CandidateListItem["status"];
        }
      >();
    return result.results.map((row) => ({
      word: mapWord(row),
      priority: row.priority,
      admissionReasons: JSON.parse(row.admission_reasons_json) as string[],
      activationBlockedByDebt: row.activation_blocked_by_debt === 1,
      needsClarification: row.needs_clarification === 1,
      clarifyingQuestion: row.clarifying_question,
      deferredUntil: row.deferred_until,
      status: row.status,
    }));
  }

  async activateCandidate(
    word: WordRecord,
    transitionId: string,
    now: string,
  ): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE words SET container = 'active_review', updated_at = ? WHERE id = ? AND state IN ('L1', 'L2')`,
        )
        .bind(now, word.id),
      this.db
        .prepare(
          `UPDATE candidate_entries SET status = 'activated', activation_blocked_by_debt = 0, updated_at = ? WHERE word_id = ?`,
        )
        .bind(now, word.id),
      this.db
        .prepare(
          `
        INSERT INTO state_transitions (id, word_id, from_state, to_state, from_container, to_container, reason, occurred_at, created_at)
        VALUES (?, ?, ?, ?, 'candidate_inbox', 'active_review', 'manual_candidate_activation', ?, ?)
      `,
        )
        .bind(transitionId, word.id, word.state, word.state, now, now),
    ]);
  }

  async deferCandidate(
    wordId: string,
    until: string | null,
    now: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE candidate_entries SET status = 'deferred', deferred_until = ?, updated_at = ? WHERE word_id = ?`,
      )
      .bind(until, now, wordId)
      .run();
  }

  async createCard(
    id: string,
    word: WordRecord,
    input: SemanticCardInput,
    now: string,
  ): Promise<SemanticCard> {
    const orderRow = await this.db
      .prepare(
        "SELECT COALESCE(MAX(sense_order), 0) + 1 AS next_order FROM semantic_cards WHERE word_id = ?",
      )
      .bind(word.id)
      .first<{ next_order: number }>();
    const senseOrder = orderRow?.next_order ?? 1;
    await this.db.batch([
      this.db
        .prepare(
          `
        INSERT INTO semantic_cards (
          id, word_id, sense_order, pronunciation, audio_url, core_meaning_en, core_meaning_zh,
          anchor_sentence, semantic_scene, example_origin, retrieval_prompt, context_note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .bind(
          id,
          word.id,
          senseOrder,
          input.pronunciation ?? null,
          input.audioUrl ?? null,
          input.coreMeaningEn,
          input.coreMeaningZh,
          input.anchorSentence,
          input.semanticScene,
          input.exampleOrigin,
          input.retrievalPrompt,
          input.contextNote ?? null,
          now,
          now,
        ),
      this.db
        .prepare(
          "UPDATE words SET pronunciation = COALESCE(pronunciation, ?), audio_url = COALESCE(audio_url, ?), updated_at = ? WHERE id = ?",
        )
        .bind(
          input.pronunciation ?? null,
          input.audioUrl ?? null,
          now,
          word.id,
        ),
    ]);
    const row = await this.db
      .prepare("SELECT * FROM semantic_cards WHERE id = ?")
      .bind(id)
      .first<CardRow>();
    if (!row) throw new Error("保存语义卡后无法读取记录");
    return mapCard(row);
  }

  async listCards(limit = 100): Promise<CardListItem[]> {
    const result = await this.db
      .prepare(
        `
      SELECT c.*, json_object(
        'id', w.id, 'word_original', w.word_original, 'word_normalized', w.word_normalized,
        'pronunciation', w.pronunciation, 'audio_url', w.audio_url, 'state', w.state, 'container', w.container,
        'source', w.source, 'source_context', w.source_context, 'encounter_count', w.encounter_count,
        'last_encounter_at', w.last_encounter_at, 'audio_familiarity', w.audio_familiarity,
        'personal_relevance', w.personal_relevance, 'learner_report', w.learner_report,
        'active_usage_verified', w.active_usage_verified, 'last_result', w.last_result,
        'retrieval_latency_ms', w.retrieval_latency_ms, 'created_at', w.created_at, 'updated_at', w.updated_at
      ) AS word_json
      FROM semantic_cards c JOIN words w ON w.id = c.word_id
      ORDER BY c.updated_at DESC LIMIT ?
    `,
      )
      .bind(limit)
      .all<CardRow & { word_json: string }>();
    return result.results.map((row) => ({
      card: mapCard(row),
      word: mapWord(JSON.parse(row.word_json) as WordRow),
    }));
  }

  async saveSession(plan: SessionPlan, id: string, now: string): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `
        INSERT INTO learning_sessions (
          id, session_date, duration_minutes, active_review_count_before, new_word_limit,
          debt_status, status, plan_json, started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `,
        )
        .bind(
          id,
          plan.date,
          plan.durationMinutes,
          plan.activeReviewCountBefore,
          plan.newWordLimit,
          plan.debtStatus,
          JSON.stringify(plan),
          now,
          now,
          now,
        ),
      this.db
        .prepare(
          `
        INSERT INTO daily_pool_snapshots (snapshot_date, active_review_count, created_at) VALUES (?, ?, ?)
        ON CONFLICT(snapshot_date) DO UPDATE SET active_review_count = excluded.active_review_count
      `,
        )
        .bind(plan.date, plan.activeReviewCountBefore, now),
    ]);
  }

  async getReviewHistory(
    wordId: string,
    limit = 20,
  ): Promise<ReviewEvidence[]> {
    const result = await this.db
      .prepare(
        `
      SELECT test_mode, result, contaminated, is_natural_reencounter, occurred_at
      FROM review_events WHERE word_id = ? ORDER BY occurred_at DESC LIMIT ?
    `,
      )
      .bind(wordId, limit)
      .all<{
        test_mode: ReviewEvidence["testMode"];
        result: ReviewEvidence["result"];
        contaminated: number;
        is_natural_reencounter: number;
        occurred_at: string;
      }>();
    return result.results.reverse().map((row) => ({
      testMode: row.test_mode,
      result: row.result,
      contaminated: row.contaminated === 1,
      isNaturalReencounter: row.is_natural_reencounter === 1,
      occurredAt: row.occurred_at,
    }));
  }

  async listRecentReviews(limit = 8): Promise<RecentReviewItem[]> {
    const result = await this.db
      .prepare(
        `
      SELECT r.id, w.word_original, r.test_mode, r.result, r.contaminated, r.occurred_at
      FROM review_events r JOIN words w ON w.id = r.word_id
      ORDER BY r.occurred_at DESC LIMIT ?
    `,
      )
      .bind(limit)
      .all<{
        id: string;
        word_original: string;
        test_mode: ReviewSubmission["testMode"];
        result: ReviewResult;
        contaminated: number;
        occurred_at: string;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      word: row.word_original,
      testMode: row.test_mode,
      result: row.result,
      contaminated: row.contaminated === 1,
      occurredAt: row.occurred_at,
    }));
  }

  async saveReview(args: {
    eventId: string;
    transitionId: string;
    naturalEventId: string;
    word: WordRecord;
    submission: ReviewSubmission;
    evaluation: ReviewEvaluation;
    now: string;
    offlinePayloadHash?: string;
  }): Promise<void> {
    const statements = [
      this.db
        .prepare(
          `
        INSERT INTO review_events (
          id, client_event_id, word_id, session_id, test_mode, learner_response, result, latency_ms,
          answer_revealed, contaminated, context_used, is_natural_reencounter, state_before, state_after,
          graduated, reentered, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .bind(
          args.eventId,
          args.submission.clientEventId ?? null,
          args.word.id,
          args.submission.sessionId ?? null,
          args.submission.testMode,
          args.submission.learnerResponse,
          args.evaluation.result,
          args.submission.latencyMs ?? null,
          Number(args.submission.answerRevealed),
          Number(args.evaluation.contaminated),
          args.submission.contextUsed ?? null,
          Number(args.submission.isNaturalReencounter),
          args.evaluation.stateBefore,
          args.evaluation.stateAfter,
          Number(args.evaluation.graduated),
          Number(args.evaluation.reentered),
          args.submission.occurredAt,
          args.now,
        ),
      this.db
        .prepare(
          `
        UPDATE words SET state = ?, container = ?, active_usage_verified = ?, last_result = ?,
          retrieval_latency_ms = ?, updated_at = ? WHERE id = ?
      `,
        )
        .bind(
          args.evaluation.stateAfter,
          args.evaluation.containerAfter,
          Number(args.evaluation.activeUsageVerified),
          args.evaluation.result,
          args.submission.latencyMs ?? null,
          args.now,
          args.word.id,
        ),
    ];

    if (
      args.evaluation.stateAfter !== args.word.state ||
      args.evaluation.containerAfter !== args.word.container
    ) {
      statements.push(
        this.db
          .prepare(
            `
        INSERT INTO state_transitions (
          id, word_id, review_event_id, from_state, to_state, from_container, to_container, reason, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
          )
          .bind(
            args.transitionId,
            args.word.id,
            args.eventId,
            args.word.state,
            args.evaluation.stateAfter,
            args.word.container,
            args.evaluation.containerAfter,
            args.evaluation.nextAction,
            args.submission.occurredAt,
            args.now,
          ),
      );
    }
    if (args.submission.isNaturalReencounter) {
      statements.push(
        this.db
          .prepare(
            `
        INSERT INTO natural_reencounter_events (
          id, word_id, review_event_id, source, source_context, understood, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
          )
          .bind(
            args.naturalEventId,
            args.word.id,
            args.eventId,
            args.word.source,
            args.submission.contextUsed ?? args.word.sourceContext,
            Number(
              args.evaluation.result === "INSTANT" ||
                args.evaluation.result === "SLOW",
            ),
            args.submission.occurredAt,
            args.now,
          ),
      );
    }
    if (args.submission.clientEventId && args.offlinePayloadHash) {
      statements.push(
        this.db
          .prepare(
            `
        INSERT OR IGNORE INTO synced_offline_events (client_event_id, event_type, payload_hash, synced_at)
        VALUES (?, ?, ?, ?)
      `,
          )
          .bind(
            args.submission.clientEventId,
            args.submission.isNaturalReencounter
              ? "natural_reencounter"
              : "review",
            args.offlinePayloadHash,
            args.now,
          ),
      );
    }
    await this.db.batch(statements);
  }

  async getAnalyticsDataset(
    start: string,
    end: string,
  ): Promise<AnalyticsDataset> {
    const [activated, graduated, states, reviews, natural, snapshots] =
      await Promise.all([
        this.db
          .prepare(
            `
        SELECT DISTINCT word_id FROM (
          SELECT word_id FROM intake_events WHERE admitted = 1 AND substr(occurred_at, 1, 10) BETWEEN ? AND ?
          UNION
          SELECT word_id FROM state_transitions WHERE to_container = 'active_review' AND from_container = 'candidate_inbox' AND substr(occurred_at, 1, 10) BETWEEN ? AND ?
        )
      `,
          )
          .bind(start, end, start, end)
          .all<{ word_id: string }>(),
        this.db
          .prepare(
            `SELECT DISTINCT word_id FROM state_transitions WHERE to_state = 'L3' AND substr(occurred_at, 1, 10) BETWEEN ? AND ?`,
          )
          .bind(start, end)
          .all<{ word_id: string }>(),
        this.db
          .prepare("SELECT state, COUNT(*) AS count FROM words GROUP BY state")
          .all<{ state: LearningState; count: number }>(),
        this.db
          .prepare(
            `
        SELECT word_id, test_mode, result, latency_ms, contaminated, is_natural_reencounter, reentered, occurred_at
        FROM review_events WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ? ORDER BY occurred_at
      `,
          )
          .bind(start, end)
          .all<{
            word_id: string;
            test_mode: AnalyticsDataset["reviewEvents"][number]["testMode"];
            result: ReviewResult;
            latency_ms: number | null;
            contaminated: number;
            is_natural_reencounter: number;
            reentered: number;
            occurred_at: string | null;
          }>(),
        this.db
          .prepare(
            `SELECT understood, occurred_at FROM natural_reencounter_events WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ? ORDER BY occurred_at`,
          )
          .bind(start, end)
          .all<{ understood: number; occurred_at: string | null }>(),
        this.db
          .prepare(
            `SELECT snapshot_date, active_review_count FROM daily_pool_snapshots WHERE snapshot_date BETWEEN ? AND ? ORDER BY snapshot_date`,
          )
          .bind(start, end)
          .all<{ snapshot_date: string | null; active_review_count: number }>(),
      ]);
    const stateDistribution: AnalyticsDataset["stateDistribution"] = {
      L0: 0,
      L1: 0,
      L2: 0,
      L3: 0,
      L4: 0,
    };
    for (const row of states.results) stateDistribution[row.state] = row.count;
    return {
      period: { start, end },
      activatedWordIds: activated.results.map((row) => row.word_id),
      graduatedWordIds: graduated.results.map((row) => row.word_id),
      stateDistribution,
      reviewEvents: reviews.results.map((row) => ({
        wordId: row.word_id,
        testMode: row.test_mode,
        result: row.result,
        latencyMs: row.latency_ms,
        contaminated: row.contaminated === 1,
        isNaturalReencounter: row.is_natural_reencounter === 1,
        reentered: row.reentered === 1,
        occurredAt: row.occurred_at,
      })),
      naturalReencounters: natural.results.map((row) => ({
        understood: row.understood === 1,
        occurredAt: row.occurred_at,
      })),
      poolSnapshots: snapshots.results.map((row) => ({
        date: row.snapshot_date,
        count: row.active_review_count,
      })),
    };
  }
}
