export interface DictionaryPronunciation {
  ipa: string | null;
  accent: string | null;
  audioUrl: string | null;
}

export interface DictionarySense {
  partOfSpeech: string | null;
  definitionEn: string | null;
  definitionZh: string | null;
  example: string | null;
}

export interface DictionaryLookup {
  headword: string;
  lemma?: string | null;
  pronunciations: DictionaryPronunciation[];
  senses: DictionarySense[];
  meta?: {
    textSource: "ecdict" | "uapis" | "merged";
    audioSource: "youdao" | "none";
    degraded: boolean;
  };
}

export interface DictionarySuggestion {
  headword: string;
  phonetic: string | null;
  definitionZh: string | null;
}

export interface DictionaryHealth {
  available: boolean;
  status: "ok" | "degraded" | "unavailable" | "invalid_response";
  checkedAt: string;
  detail: string | null;
  providers?: {
    ecdict: {
      available: boolean;
      version: string | null;
      entries: number | null;
      detail: string | null;
    };
    uapis: {
      configured: boolean;
      detail: string | null;
    };
    youdao: {
      configured: boolean;
      detail: string | null;
    };
  };
}
