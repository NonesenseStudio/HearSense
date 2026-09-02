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
  missingFields: Array<
    "coreMeaningEn" | "coreMeaningZh" | "anchorSentence" | "semanticScene"
  >;
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
  const firstSense =
    input.dictionary?.senses.find(
      (item) => item.definitionEn || item.definitionZh,
    ) ?? null;
  const anchorSentence = input.sourceContext || firstSense?.example || "";
  const draft: SemanticCardDraft = {
    pronunciation,
    audioUrl,
    coreMeaningEn: firstSense?.definitionEn ?? "",
    coreMeaningZh: firstSense?.definitionZh ?? "",
    anchorSentence,
    semanticScene: input.sourceContext ?? "",
    exampleOrigin: input.sourceContext ? "learner_source" : "generated",
    retrievalPrompt: `听到 “${input.word}” 时，它表达的核心意思是什么？`,
    contextNote: input.sourceContext
      ? `优先使用来自 ${input.source ?? "other"} 的学习者原始上下文。`
      : null,
    missingFields: [],
  };
  if (!draft.coreMeaningEn) draft.missingFields.push("coreMeaningEn");
  if (!draft.coreMeaningZh) draft.missingFields.push("coreMeaningZh");
  if (!draft.anchorSentence) draft.missingFields.push("anchorSentence");
  if (!draft.semanticScene) draft.missingFields.push("semanticScene");
  return draft;
}
