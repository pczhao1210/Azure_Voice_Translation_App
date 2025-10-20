export type SessionPhase = 'idle' | 'connecting' | 'running' | 'error';

export type SegmentationStrategy = 'Semantic' | 'Silence';

export type SynthesisMode = 'Quick' | 'Standard' | 'Hybrid';

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
  segmentationStrategy: SegmentationStrategy;
  synthesisMode: SynthesisMode;
}

export interface TranscriptEntry {
  id: string;
  sourceText: string;
  detectedLanguage?: string;  // 新增：检测到的原始语言
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
  defaultSegmentationStrategy: SegmentationStrategy;
  defaultSynthesisMode: SynthesisMode;
}


