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
  pronunciations: DictionaryPronunciation[];
  senses: DictionarySense[];
}

export interface DictionaryHealth {
  available: boolean;
  status: "ok" | "unavailable" | "invalid_response";
  checkedAt: string;
  detail: string | null;
}
