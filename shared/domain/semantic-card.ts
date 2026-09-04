import type { DictionaryLookup } from "../types/dictionary";
import type { WordSource } from "../types/vocabulary";

export interface SemanticCardDraft {
  pronunciation: string | null;
  audioUrl: string | null;
  coreMeaningEn: string;
  coreMeaningZh: string;
  anchorSentence: string;
  semanticScene: string;
  exampleOrigin: "learner_source" | "generated";
  retrievalPrompt: string;
  contextNote: string | null;
  /**
   * A small set of alternatives shown while confirming a draft. These are
   * presentation-only fields and are stripped by semanticCardInputSchema
   * before persistence.
   */
  senseOptions: SemanticSenseOption[];
  selectedSenseIndex: number | null;
  missingFields: Array<
    "coreMeaningEn" | "coreMeaningZh" | "anchorSentence" | "semanticScene"
  >;
}

export interface SemanticSenseOption {
  partOfSpeech: string | null;
  definitionEn: string;
  definitionZh: string;
  example: string | null;
}

function tokens(value: string): string[] {
  return value.toLocaleLowerCase("en-US").match(/[a-z]{3,}/g) ?? [];
}

function senseRelevance(context: string, sense: SemanticSenseOption): number {
  if (!context) return 0;
  const contextText = context.toLocaleLowerCase("en-US");
  if (
    sense.example &&
    contextText.includes(sense.example.toLocaleLowerCase("en-US"))
  )
    return 100;
  const contextTokens = new Set(tokens(context));
  return tokens(`${sense.definitionEn} ${sense.example ?? ""}`).reduce(
    (score, token) => score + (contextTokens.has(token) ? 1 : 0),
    0,
  );
}

function semanticSceneFor(sense: SemanticSenseOption | null): string {
  if (!sense) return "";
  if (sense.definitionZh) {
    const definitionZh = sense.definitionZh.replace(/[。！？，、；：]+$/u, "");
    if (/^(n\.?|noun)/i.test(sense.partOfSpeech ?? ""))
      return `想象一个真实画面：画面里出现了${definitionZh}。`;
    if (/^(adj\.?|adjective)/i.test(sense.partOfSpeech ?? ""))
      return `想象一个真实画面：某人或某物呈现“${definitionZh}”的状态。`;
    if (/^使/u.test(definitionZh))
      return `想象一个真实画面：有人让另一个人${definitionZh.slice(1)}。`;
    if (/^(感到|觉得|认为|变得|成为|处于)/u.test(definitionZh))
      return `想象一个真实画面：某人${definitionZh}。`;
    return `想象一个真实画面：某人正在${definitionZh}。`;
  }
  const definition = sense.definitionEn
    .replace(/^to\s+/i, "")
    .replace(/[.!?]+$/u, "");
  return definition ? `Imagine a real scene where someone ${definition}.` : "";
}

function missingFieldsFor(draft: {
  coreMeaningEn: string;
  coreMeaningZh: string;
  anchorSentence: string;
  semanticScene: string;
}): SemanticCardDraft["missingFields"] {
  const missing: SemanticCardDraft["missingFields"] = [];
  if (!draft.coreMeaningEn.trim()) missing.push("coreMeaningEn");
  if (!draft.coreMeaningZh.trim()) missing.push("coreMeaningZh");
  if (!draft.anchorSentence.trim()) missing.push("anchorSentence");
  if (!draft.semanticScene.trim()) missing.push("semanticScene");
  return missing;
}

export function buildSemanticCardDraft(input: {
  word: string;
  source: WordSource | null;
  sourceContext: string | null;
  dictionary: DictionaryLookup | null;
}): SemanticCardDraft {
  const pronunciation =
    input.dictionary?.pronunciations.find((item) => item.ipa)?.ipa ?? null;
  const audioUrl =
    input.dictionary?.pronunciations.find((item) => item.audioUrl)?.audioUrl ??
    null;
  const senseOptions =
    input.dictionary?.senses
      .filter((item) => item.definitionEn || item.definitionZh)
      .map<SemanticSenseOption>((item) => ({
        partOfSpeech: item.partOfSpeech,
        definitionEn: item.definitionEn?.trim() ?? "",
        definitionZh: item.definitionZh?.trim() ?? "",
        example: item.example?.trim() || null,
      }))
      .sort(
        (left, right) =>
          senseRelevance(input.sourceContext ?? "", right) -
          senseRelevance(input.sourceContext ?? "", left),
      ) ?? [];
  const selectedSense = senseOptions[0] ?? null;
  const anchorSentence =
    input.sourceContext?.trim() || selectedSense?.example || "";
  const draft: SemanticCardDraft = {
    pronunciation,
    audioUrl,
    coreMeaningEn: selectedSense?.definitionEn ?? "",
    coreMeaningZh: selectedSense?.definitionZh ?? "",
    anchorSentence,
    semanticScene: semanticSceneFor(selectedSense),
    exampleOrigin: input.sourceContext ? "learner_source" : "generated",
    retrievalPrompt: `听到 “${input.word}” 时，它表达的核心意思是什么？`,
    contextNote: input.sourceContext
      ? `优先使用来自 ${input.source ?? "other"} 的学习者原始上下文。`
      : null,
    senseOptions: senseOptions.slice(0, 3),
    selectedSenseIndex: selectedSense ? 0 : null,
    missingFields: [],
  };
  draft.missingFields = missingFieldsFor(draft);
  return draft;
}

export function applySemanticSense(
  draft: SemanticCardDraft,
  index: number,
): SemanticCardDraft {
  const sense = draft.senseOptions[index];
  if (!sense) return draft;
  const next = {
    ...draft,
    coreMeaningEn: sense.definitionEn,
    coreMeaningZh: sense.definitionZh,
    selectedSenseIndex: index,
    semanticScene: semanticSceneFor(sense),
  };
  if (draft.exampleOrigin === "generated" && sense.example)
    next.anchorSentence = sense.example;
  next.missingFields = missingFieldsFor(next);
  return next;
}
