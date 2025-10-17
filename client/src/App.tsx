import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useTranslationSession } from './hooks/useTranslationSession';
import {
  AppOptions,
  LanguageOption,
  SessionConfig,
  SessionPhase
} from './types';

const STORAGE_KEY = 'voice-translate-config';

const VOICE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  'zh-Hans': [
    { value: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao - 女声 - 中文' },
    { value: 'zh-CN-YunxiNeural', label: 'Yunxi - 男声 - 中文' },
    { value: 'zh-CN-XiaoyiNeural', label: 'Xiaoyi - 女声 - 中文' },
    { value: 'zh-CN-YunjianNeural', label: 'Yunjian - 男声 - 中文' },
    { value: 'zh-CN-YunhaoNeural', label: 'Yunhao - 男声 - 中文' },
    { value: 'zh-CN-XiaochenNeural', label: 'Xiaochen - 女声 - 中文' }
  ],
  en: [
    { value: 'en-US-JennyMultilingualNeural', label: 'Jenny - 女声 - 英语' },
    { value: 'en-US-GuyNeural', label: 'Guy - 男声 - 英语' },
    { value: 'en-US-AriaNeural', label: 'Aria - 女声 - 英语' },
    { value: 'en-US-DavisNeural', label: 'Davis - 男声 - 英语' },
    { value: 'en-US-AmberNeural', label: 'Amber - 女声 - 英语' },
    { value: 'en-US-AnaNeural', label: 'Ana - 女声 - 英语' },
    { value: 'en-US-BrandonNeural', label: 'Brandon - 男声 - 英语' },
    { value: 'en-US-ChristopherNeural', label: 'Christopher - 男声 - 英语' }
  ],
  ja: [
    { value: 'ja-JP-NanamiNeural', label: 'Nanami - 女声 - 日语' },
    { value: 'ja-JP-KeitaNeural', label: 'Keita - 男声 - 日语' },
    { value: 'ja-JP-AoiNeural', label: 'Aoi - 女声 - 日语' },
    { value: 'ja-JP-DaichiNeural', label: 'Daichi - 男声 - 日语' },
    { value: 'ja-JP-MayuNeural', label: 'Mayu - 女声 - 日语' },
    { value: 'ja-JP-NaokiNeural', label: 'Naoki - 男声 - 日语' }
  ],
  fr: [
    { value: 'fr-FR-DeniseNeural', label: 'Denise - 女声 - 法语' },
    { value: 'fr-FR-HenriNeural', label: 'Henri - 男声 - 法语' },
    { value: 'fr-FR-EloiseNeural', label: 'Eloise - 女声 - 法语' },
    { value: 'fr-FR-RemyMultilingualNeural', label: 'Remy - 男声 - 法语' },
    { value: 'fr-FR-VivienneMultilingualNeural', label: 'Vivienne - 女声 - 法语' }
  ],
  de: [
    { value: 'de-DE-KatjaNeural', label: 'Katja - 女声 - 德语' },
    { value: 'de-DE-ConradNeural', label: 'Conrad - 男声 - 德语' },
    { value: 'de-DE-AmalaNeural', label: 'Amala - 女声 - 德语' },
    { value: 'de-DE-KillianNeural', label: 'Killian - 男声 - 德语' },
    { value: 'de-DE-SeraphinaMultilingualNeural', label: 'Seraphina - 女声 - 德语' },
    { value: 'de-DE-FlorianMultilingualNeural', label: 'Florian - 男声 - 德语' }
  ],
  es: [
    { value: 'es-ES-ElviraNeural', label: 'Elvira - 女声 - 西班牙语' },
    { value: 'es-ES-AlvaroNeural', label: 'Alvaro - 男声 - 西班牙语' },
    { value: 'es-ES-AbrilNeural', label: 'Abril - 女声 - 西班牙语' },
    { value: 'es-ES-ArnauNeural', label: 'Arnau - 男声 - 西班牙语' }
  ],
  it: [
    { value: 'it-IT-ElsaNeural', label: 'Elsa - 女声 - 意大利语' },
    { value: 'it-IT-IsabellaNeural', label: 'Isabella - 女声 - 意大利语' },
    { value: 'it-IT-DiegoNeural', label: 'Diego - 男声 - 意大利语' },
    { value: 'it-IT-BenignoNeural', label: 'Benigno - 男声 - 意大利语' }
  ],
  pt: [
    { value: 'pt-BR-FranciscaNeural', label: 'Francisca - 女声 - 葡萄牙语' },
    { value: 'pt-BR-AntonioNeural', label: 'Antonio - 男声 - 葡萄牙语' },
    { value: 'pt-BR-BrendaNeural', label: 'Brenda - 女声 - 葡萄牙语' },
    { value: 'pt-BR-DonatoNeural', label: 'Donato - 男声 - 葡萄牙语' }
  ],
  ko: [
    { value: 'ko-KR-SunHiNeural', label: 'SunHi - 女声 - 韩语' },
    { value: 'ko-KR-InJoonNeural', label: 'InJoon - 男声 - 韩语' },
    { value: 'ko-KR-BongJinNeural', label: 'BongJin - 男声 - 韩语' },
    { value: 'ko-KR-GookMinNeural', label: 'GookMin - 男声 - 韩语' }
  ]
};

function renderPhaseLabel(phase: SessionPhase) {
  switch (phase) {
    case 'idle':
      return '待机';
    case 'connecting':
      return '正在连接';
    case 'running':
      return '运行中';
    case 'error':
      return '错误';
    default:
      return phase;
  }
}

function resolveVoice(targetLanguage: string, currentVoice?: string) {
  const voices = VOICE_OPTIONS[targetLanguage] ?? [];
  if (voices.length === 0) {
    return currentVoice ?? '';
  }
  if (currentVoice && voices.some((item) => item.value === currentVoice)) {
    return currentVoice;
  }
  return voices[0].value;
}

function renderOption(option: LanguageOption) {
  return (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  );
}

function parseStoredConfig(): Partial<SessionConfig> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SessionConfig>;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('加载本地缓存配置失败', error);
  }
  return null;
}

function getDefaultAutoDetectLanguages(options: AppOptions) {
  if (options.defaultAutoDetectLanguages.length > 0) {
    return options.defaultAutoDetectLanguages;
  }
  return options.fromLanguages.map((item) => item.value);
}

function buildInitialConfig(
  options: AppOptions,
  stored: Partial<SessionConfig> | null
): SessionConfig {
  const autoDetectCandidates = stored?.autoDetectLanguages?.length
    ? stored.autoDetectLanguages
    : getDefaultAutoDetectLanguages(options);

  const useAutoDetect =
    stored?.useAutoDetect ?? autoDetectCandidates.length > 0;

  const targetLanguage =
    stored?.targetLanguage ??
    options.defaultTargetLanguage ??
    options.targetLanguages[0]?.value ??
    'en';

  return {
    apiKey: stored?.apiKey ?? options.defaultApiKey ?? '',
    region: stored?.region ?? options.defaultRegion ?? '',
    fromLanguage:
      stored?.fromLanguage ??
      options.defaultFromLanguage ??
      options.fromLanguages[0]?.value ??
      '',
    targetLanguage,
    voice: resolveVoice(
      targetLanguage,
      stored?.voice ?? options.defaultVoice ?? undefined
    ),
    enableTranslation: stored?.enableTranslation ?? true,
    enableSpeechSynthesis: stored?.enableSpeechSynthesis ?? true,
    useAutoDetect,
    autoDetectLanguages: useAutoDetect ? autoDetectCandidates : []
  };
}

function persistConfig(config: SessionConfig) {
  const { apiKey, ...persistable } = config;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch (error) {
    console.warn('保存配置失败', error);
  }
}

export default function App() {
  const [options, setOptions] = useState<AppOptions | null>(null);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

  const {
    phase,
    start,
    stop,
    transcripts,
    partialSource,
    partialTranslation,
    error
  } = useTranslationSession();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/options');
        if (!response.ok) {
          throw new Error(`获取配置失败：${response.status}`);
        }
        const payload = (await response.json()) as AppOptions;
        if (cancelled) {
          return;
        }
        const stored = parseStoredConfig();
        const initialConfig = buildInitialConfig(payload, stored);
        setOptions(payload);
        setConfig(initialConfig);
        persistConfig(initialConfig);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setOptionsError('加载语言配置失败，请稍后重试。');
        }
      } finally {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = (
    updater: (prev: SessionConfig) => SessionConfig
  ) => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const next = updater(prev);
      persistConfig(next);
      return next;
    });
  };

  const handleFieldChange = <K extends keyof SessionConfig>(
    field: K,
    value: SessionConfig[K]
  ) => {
    updateConfig((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFromLanguageSelect = (value: string) => {
    if (!options) {
      return;
    }
    if (value === 'auto') {
      const fallback = getDefaultAutoDetectLanguages(options);
      updateConfig((prev) => ({
        ...prev,
        useAutoDetect: true,
        autoDetectLanguages:
          prev.autoDetectLanguages.length > 0
            ? prev.autoDetectLanguages
            : fallback
      }));
    } else {
      updateConfig((prev) => ({
        ...prev,
        useAutoDetect: false,
        fromLanguage: value,
        autoDetectLanguages: []
      }));
    }
  };

  const handleAutoDetectLanguagesChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const selected = Array.from(event.target.selectedOptions).map(
      (option) => option.value
    );
    if (!options) {
      return;
    }
    if (selected.length === 0) {
      const fallback = getDefaultAutoDetectLanguages(options);
      updateConfig((prev) => ({
        ...prev,
        autoDetectLanguages: fallback
      }));
      return;
    }
    updateConfig((prev) => ({
      ...prev,
      autoDetectLanguages: selected
    }));
  };

  const handleTargetLanguageChange = (value: string) => {
    updateConfig((prev) => ({
      ...prev,
      targetLanguage: value,
      voice: resolveVoice(value, prev.voice)
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!config) {
      return;
    }
    if (phase === 'idle' || phase === 'error') {
      await start(config);
    } else if (phase === 'running' || phase === 'connecting') {
      await stop();
    }
  };

  const disableControls = phase === 'connecting';

  const voiceOptions = useMemo(() => {
    if (!config) {
      return [];
    }
    return VOICE_OPTIONS[config.targetLanguage] ?? [];
  }, [config?.targetLanguage]);

  if (loadingOptions) {
    return (
      <div className="app-container">
        <header>
          <h1>Azure 实时语音翻译</h1>
        </header>
        <p>正在加载语言配置...</p>
      </div>
    );
  }

  if (optionsError) {
    return (
      <div className="app-container">
        <header>
          <h1>Azure 实时语音翻译</h1>
        </header>
        <p className="error">{optionsError}</p>
      </div>
    );
  }

  if (!options || !config) {
    return null;
  }

  return (
    <div className="app-container">
      <header>
        <h1>Azure 实时语音翻译</h1>
        <p>实时采集语音，翻译并合成目标语音，追求最低延迟。</p>
      </header>

      <main>
        <section className="panel">
          <h2>运行配置</h2>
          <form onSubmit={handleSubmit} className="config-form">
            <div className="form-field">
              <label htmlFor="apiKey">API Key</label>
              <input
                id="apiKey"
                type="password"
                value={config.apiKey}
                onChange={(event) =>
                  handleFieldChange('apiKey', event.target.value)
                }
                placeholder="Azure AI Speech/Translator Key"
                autoComplete="off"
                required
              />
              <small>出于安全考虑，密钥不会保存在浏览器中。</small>
            </div>

            <div className="form-field">
              <label htmlFor="region">Region</label>
              <input
                id="region"
                value={config.region}
                onChange={(event) =>
                  handleFieldChange('region', event.target.value)
                }
                placeholder="例如 eastasia"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="fromLanguage">源语言</label>
                <select
                  id="fromLanguage"
                  value={config.useAutoDetect ? 'auto' : config.fromLanguage}
                  onChange={(event) =>
                    handleFromLanguageSelect(event.target.value)
                  }
                  disabled={disableControls}
                >
                  <option value="auto">自动识别（默认）</option>
                  {options.fromLanguages.map(renderOption)}
                </select>
                <small>
                  {config.useAutoDetect
                    ? `自动识别候选：${config.autoDetectLanguages.join(', ')}`
                    : '也可选择固定识别语言'}
                </small>
              </div>

              <div className="form-field">
                <label htmlFor="targetLanguage">目标语言</label>
                <select
                  id="targetLanguage"
                  value={config.targetLanguage}
                  onChange={(event) =>
                    handleTargetLanguageChange(event.target.value)
                  }
                  disabled={disableControls}
                >
                  {options.targetLanguages.map(renderOption)}
                </select>
              </div>
            </div>

            {config.useAutoDetect ? (
              <div className="form-field">
                <label htmlFor="autoDetectLanguages">自动识别候选语言</label>
                <select
                  id="autoDetectLanguages"
                  multiple
                  value={config.autoDetectLanguages}
                  onChange={handleAutoDetectLanguagesChange}
                  disabled={disableControls}
                >
                  {options.fromLanguages.map(renderOption)}
                </select>
                <small>按住 Ctrl/Cmd 可多选，至少选中一种语言。</small>
              </div>
            ) : null}

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="voice">目标音色</label>
                <select
                  id="voice"
                  className="voice-select"
                  value={config.voice}
                  onChange={(event) =>
                    handleFieldChange('voice', event.target.value)
                  }
                  disabled={
                    disableControls || !config.enableSpeechSynthesis
                  }
                >
                  {voiceOptions.length > 0 ? (
                    voiceOptions.map((option) => (
                      <option 
                        key={option.value} 
                        value={option.value}
                        className="voice-option"
                      >
                        {option.label}
                      </option>
                    ))
                  ) : (
                    <option value="">暂无可用音色</option>
                  )}
                </select>
                <small>
                  当前支持: 中文、英语、日语、法语、德语、西班牙语、意大利语、葡萄牙语、韩语
                </small>
              </div>
              <div className="form-field checkbox">
                <label htmlFor="enableSpeechSynthesis">
                  <input
                    id="enableSpeechSynthesis"
                    type="checkbox"
                    checked={config.enableSpeechSynthesis}
                    onChange={(event) =>
                      handleFieldChange(
                        'enableSpeechSynthesis',
                        event.target.checked
                      )
                    }
                  />
                  播放目标语音
                </label>
              </div>
            </div>

            <div className="form-field checkbox">
              <label htmlFor="enableTranslation">
                <input
                  id="enableTranslation"
                  type="checkbox"
                  checked={config.enableTranslation}
                  onChange={(event) =>
                    handleFieldChange(
                      'enableTranslation',
                      event.target.checked
                    )
                  }
                />
                输出文字翻译
              </label>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                disabled={disableControls}
                className={phase === 'running' ? 'danger' : ''}
              >
                {phase === 'running' ? '停止会话' : '启动会话'}
              </button>
              <span className={`status status-${phase}`}>
                当前状态：{renderPhaseLabel(phase)}
              </span>
            </div>
          </form>
        </section>

        <section className="panel transcripts">
          <h2>实时文本</h2>
          {error ? <div className="error">{error}</div> : null}

          {partialSource || partialTranslation ? (
            <div className="partial">
              <h3>实时识别</h3>
              {partialSource ? (
                <p className="source">{partialSource}</p>
              ) : null}
              {config.enableTranslation && partialTranslation ? (
                <p className="target">{partialTranslation}</p>
              ) : null}
            </div>
          ) : null}

          <div className="history">
            {transcripts.map((item) => (
              <article key={item.id}>
                <p className="source">{item.sourceText}</p>
                {config.enableTranslation ? (
                  <p className="target">
                    {item.translationText || '翻译中...'}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
