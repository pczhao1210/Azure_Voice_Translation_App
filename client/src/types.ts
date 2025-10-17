export type SessionPhase = 'idle' | 'connecting' | 'running' | 'error';

export interface SessionConfig {
  apiKey: string;
  region: string;
  fromLanguage: string;
  targetLanguage: string;
  voice: string;
  enableTranslation: boolean;
  enableSpeechSynthesis: boolean;
  useAutoDetect: boolean;
  autoDetectLanguages: string[];
}

export interface TranscriptEntry {
  id: string;
  sourceText: string;
  translationText?: string;
  isFinal: boolean;
  updatedAt: number;
}

export interface LanguageOption {
  value: string;
  label: string;
}

export interface AppOptions {
  fromLanguages: LanguageOption[];
  targetLanguages: LanguageOption[];
  defaultFromLanguage: string | null;
  defaultTargetLanguage: string | null;
  defaultAutoDetectLanguages: string[];
  defaultVoice: string | null;
  defaultApiKey: string | null;
  defaultRegion: string | null;
}
