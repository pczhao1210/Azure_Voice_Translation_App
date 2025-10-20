import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT ?? 3001);

interface LanguageOption {
  value: string;
  label: string;
}

type SegmentationStrategy = 'Semantic' | 'Silence';
type SynthesisMode = 'Quick' | 'Standard' | 'Hybrid';

interface ServerOptions {
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

// 合成模式枚举
interface SynthesisConfig {
  mode: SynthesisMode;
  // 快速响应模式配置
  quickResponse: {
    punctuation: string[];
    minLength: number;
    intervalMs: number;
  };
  // 标准响应模式配置
  standardResponse: {
    minLength: number;
  };
  // 混合响应模式配置
  hybridResponse: {
    quickSentenceCount: number;
    modeSwitchNotification: boolean;
  };
}

function parseStringList(input?: string) {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseLanguageOptions(input?: string): LanguageOption[] {
  return parseStringList(input).map((entry) => {
    const [value, label] = entry.split(':');
    return {
      value: value.trim(),
      label: (label ?? value).trim()
    };
  });
}

const targetLanguageDefaults = parseStringList(
  process.env.DEFAULT_TARGET_LANGUAGES
);

// 解析新的合成配置
function parseSynthesisConfig(): SynthesisConfig {
  const mode = (process.env.DEFAULT_SYNTHESIS_MODE || 'Hybrid') as SynthesisMode;
  
  // 解析快速响应标点符号
  const punctuationString = process.env.QUICK_RESPONSE_PUNCTUATION || '，。！？；：、,.!?;:․';
  const punctuation = punctuationString.split('').filter(char => char.trim());
  
  return {
    mode,
    quickResponse: {
      punctuation,
      minLength: parseInt(process.env.QUICK_RESPONSE_MIN_LENGTH || '2'),
      intervalMs: parseInt(process.env.QUICK_RESPONSE_INTERVAL_MS || '500')
    },
    standardResponse: {
      minLength: parseInt(process.env.STANDARD_RESPONSE_MIN_LENGTH || '5')
    },
    hybridResponse: {
      quickSentenceCount: parseInt(process.env.HYBRID_QUICK_SENTENCE_COUNT || '3'),
      modeSwitchNotification: process.env.HYBRID_MODE_SWITCH_NOTIFICATION === 'true'
    }
  };
}

const serverOptions: ServerOptions = {
  fromLanguages: parseLanguageOptions(process.env.SUPPORTED_FROM_LANGUAGES),
  targetLanguages: parseLanguageOptions(process.env.SUPPORTED_TARGET_LANGUAGES),
  defaultFromLanguage: process.env.DEFAULT_FROM_LANGUAGE ?? null,
  defaultTargetLanguage:
    targetLanguageDefaults.length > 0 ? targetLanguageDefaults[0] : null,
  defaultAutoDetectLanguages: parseStringList(
    process.env.DEFAULT_AUTO_DETECT_SOURCE_LANGUAGES
  ),
  defaultVoice: process.env.DEFAULT_VOICE ?? null,
  defaultApiKey: process.env.AZURE_SPEECH_KEY ?? null,
  defaultRegion: process.env.AZURE_SPEECH_REGION ?? null,
  defaultSegmentationStrategy: (process.env.DEFAULT_SEGMENTATION_STRATEGY as SegmentationStrategy) ?? 'Semantic',
  defaultSynthesisMode: (process.env.DEFAULT_SYNTHESIS_MODE as SynthesisMode) ?? 'Hybrid'
};

const synthesisConfig = parseSynthesisConfig();

// 解析Speech SDK属性配置
function parseSpeechSDKProperties(): Record<string, string> {
  const properties: Record<string, string> = {};
  const propertiesString = process.env.DEFAULT_SPEECH_SDK_PROPERTIES;
  
  if (propertiesString) {
    const pairs = propertiesString.split(';');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        // 移除PropertyId.前缀，只保留实际的属性名
        const cleanKey = key.trim().replace('PropertyId.', '');
        properties[cleanKey] = value.trim();
      }
    }
  }
  
  console.log('解析的Speech SDK属性:', properties);
  return properties;
}

// 解析分段策略配置
function parseSegmentationProperties(strategy: SegmentationStrategy): Record<string, string> {
  const properties: Record<string, string> = {};
  
  const propertiesString = strategy === 'Semantic' 
    ? process.env.SEMANTIC_SEGMENTATION_PROPERTIES
    : process.env.SILENCE_SEGMENTATION_PROPERTIES;
  
  if (propertiesString) {
    const pairs = propertiesString.split(';');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        properties[key.trim()] = value.trim();
      }
    }
  }
  
  console.log(`解析的${strategy}分段策略属性:`, properties);
  return properties;
}

// 安全地设置Speech SDK属性，包含错误处理和兼容性检查
function safelySetProperty(recognizer: sdk.TranslationRecognizer, propertyName: string, propertyValue: string): boolean {
  try {
    // 特殊处理语义分段策略
    if (propertyName === 'Speech_SegmentationStrategy' && propertyValue === 'Semantic') {
      console.log('尝试设置语义分段策略...');
      
      // 检查是否存在语义分段相关的PropertyId
      if (!(sdk.PropertyId as any).Speech_SegmentationStrategy) {
        console.warn('当前SDK版本不支持语义分段，将跳过此配置');
        return false;
      }
    }
    
    const propertyId = (sdk.PropertyId as any)[propertyName];
    if (propertyId) {
      recognizer.properties.setProperty(propertyId, propertyValue);
      console.log(`✓ 设置属性成功: ${propertyName} = ${propertyValue}`);
      return true;
    } else {
      console.warn(`⚠ 未知的PropertyId: ${propertyName}`);
      return false;
    }
  } catch (error) {
    console.error(`✗ 设置属性失败: ${propertyName} = ${propertyValue}`, error);
    return false;
  }
}

const speechSDKProperties = parseSpeechSDKProperties();

const app = express();
app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/server-time', (_req, res) => {
  res.json({ 
    timestamp: Date.now(),
    iso: new Date().toISOString()
  });
});

app.get('/api/options', (_req, res) => {
  res.json(serverOptions);
});

app.get('/api/server-time', (_req, res) => {
  res.json({ timestamp: Date.now() });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

const server = http.createServer(app);

interface ClientConfig {
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
}

interface SynthesisState {
  lastSynthesizedText: string;
  lastSynthesisTime: number;
  isProcessing: boolean;
  lastPunctuationIndex: number; // 用于快速响应模式跟踪标点符号位置
  audioQueue: ArrayBuffer[]; // 音频队列
  isPlaying: boolean; // 是否正在播放音频
  sentenceCount: number; // 混合模式：已完成的句子计数
  isHybridModeActive: boolean; // 混合模式：是否仍在快速响应阶段
}

interface SessionContext {
  socket: WebSocket;
  config: ClientConfig;
  pushStream: sdk.PushAudioInputStream;
  recognizer: sdk.TranslationRecognizer;
  speechSynthesizer?: sdk.SpeechSynthesizer;
  synthesisState: SynthesisState;
  disposed: boolean;
}

const wss = new WebSocketServer({
  server,
  path: '/api/translate'
});

function sendJson(socket: WebSocket, type: string, payload?: unknown) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(
    JSON.stringify({
      type,
      payload
    })
  );
}

// 音频队列管理器
async function playAudioQueue(sessionContext: SessionContext) {
  const synthesisState = sessionContext.synthesisState;
  
  // 如果已经在播放或队列为空，直接返回
  if (synthesisState.isPlaying || synthesisState.audioQueue.length === 0) {
    return;
  }
  
  synthesisState.isPlaying = true;
  
  try {
    while (synthesisState.audioQueue.length > 0) {
      const audioData = synthesisState.audioQueue.shift()!;
      console.log(`播放队列中的音频: ${audioData.byteLength} 字节`);
      
      // 发送音频数据
      sessionContext.socket.send(audioData);
      
      // 等待一小段时间让音频播放，避免过快发送
      // 根据音频长度计算大致播放时间（简化计算）
      const estimatedDuration = audioData.byteLength / 32000 * 1000; // 假设32KB/s播放速度
      await new Promise(resolve => setTimeout(resolve, Math.max(100, estimatedDuration * 0.8)));
    }
  } catch (error) {
    console.error('播放音频队列时出错:', error);
  } finally {
    synthesisState.isPlaying = false;
  }
}

// 将音频添加到队列
function enqueueAudio(sessionContext: SessionContext, audioData: ArrayBuffer) {
  sessionContext.synthesisState.audioQueue.push(audioData);
  
  // 立即尝试播放队列（如果当前没有在播放）
  playAudioQueue(sessionContext).catch(error => {
    console.error('启动音频队列播放失败:', error);
  });
}

// 快速响应合成：基于标点符号的增量合成
async function performQuickResponseSynthesis(
  sessionContext: SessionContext,
  translations: Record<string, string>
) {
  if (!sessionContext.speechSynthesizer || Object.keys(translations).length === 0) {
    return;
  }

  const targetLanguageKey = Object.keys(translations)[0];
  const fullTranslationText = translations[targetLanguageKey];
  
  if (!fullTranslationText || fullTranslationText.trim() === '') {
    return;
  }

  // 防止处理中重复触发
  if (sessionContext.synthesisState.isProcessing) {
    return;
  }

  const config = synthesisConfig.quickResponse;
  const synthesisState = sessionContext.synthesisState;
  
  // 检查文本长度是否满足最小要求
  if (fullTranslationText.length < config.minLength) {
    return;
  }
  
  // 检查是否是新的独立句子
  // 如果当前文本比上次合成时的位置短很多，说明是新句子
  const isNewSentence = synthesisState.lastPunctuationIndex >= fullTranslationText.length;
  
  // 如果是新句子，重置标点符号索引
  if (isNewSentence) {
    synthesisState.lastPunctuationIndex = -1;
  }
  
  // 检查时间间隔
  const now = Date.now();
  if (now - synthesisState.lastSynthesisTime < config.intervalMs) {
    return;
  }
  
  // 查找从上次合成位置之后的第一个新标点符号
  let newPunctuationIndex = -1;
  for (let i = synthesisState.lastPunctuationIndex + 1; i < fullTranslationText.length; i++) {
    if (config.punctuation.includes(fullTranslationText[i])) {
      newPunctuationIndex = i;
      break;
    }
  }
  
  // 如果没有找到新的标点符号，不合成
  if (newPunctuationIndex === -1) {
    return;
  }
  
  // 计算需要合成的文本：从上次合成位置到新找到的标点符号
  const startIndex = synthesisState.lastPunctuationIndex + 1;
  const textToSynthesize = fullTranslationText.slice(startIndex, newPunctuationIndex + 1).trim();
  
  if (!textToSynthesize || textToSynthesize.length === 0) {
    return;
  }
  
  console.log(`快速响应合成: "${textToSynthesize}" (检测到标点: "${fullTranslationText[newPunctuationIndex]}")`);
  
  // 标记开始处理
  sessionContext.synthesisState.isProcessing = true;
  
  try {
    const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
      sessionContext.speechSynthesizer!.speakTextAsync(
        textToSynthesize,
        (result) => resolve(result),
        (error) => reject(error)
      );
    });
    
    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
      const audioData = result.audioData;
      if (audioData && audioData.byteLength > 0) {
        console.log(`快速响应合成完成，加入队列: ${audioData.byteLength} 字节`);
        
        // 将音频加入队列而不是直接发送
        enqueueAudio(sessionContext, audioData);
        
        // 更新状态：记录已经合成到新标点符号的位置
        sessionContext.synthesisState.lastPunctuationIndex = newPunctuationIndex;
        sessionContext.synthesisState.lastSynthesisTime = now;
        sessionContext.synthesisState.lastSynthesizedText = fullTranslationText.slice(0, newPunctuationIndex + 1);
        
        // 混合模式：检查是否遇到句子结束符号，如果是则增加句子计数
        if (synthesisConfig.mode === 'Hybrid') {
          const punctuation = fullTranslationText[newPunctuationIndex];
          const sentenceEndPunctuation = ['。', '！', '？', '.', '!', '?'];
          if (sentenceEndPunctuation.includes(punctuation)) {
            sessionContext.synthesisState.sentenceCount++;
            console.log(`混合模式：快速响应完成第 ${sessionContext.synthesisState.sentenceCount} 句`);
          }
        }
      }
    }
  } catch (error) {
    console.error('快速响应合成失败:', error);
  } finally {
    sessionContext.synthesisState.isProcessing = false;
  }
}

// 标准响应合成：等待完整识别结果
async function performStandardResponseSynthesis(
  sessionContext: SessionContext,
  translations: Record<string, string>
) {
  if (!sessionContext.speechSynthesizer || Object.keys(translations).length === 0) {
    return;
  }

  const targetLanguageKey = Object.keys(translations)[0];
  const fullTranslationText = translations[targetLanguageKey];
  
  if (!fullTranslationText || fullTranslationText.trim() === '') {
    return;
  }

  // 防止处理中重复触发
  if (sessionContext.synthesisState.isProcessing) {
    return;
  }

  const config = synthesisConfig.standardResponse;
  
  // 检查文本长度是否满足最小要求
  if (fullTranslationText.length < config.minLength) {
    return;
  }
  
  console.log(`标准响应合成: "${fullTranslationText}"`);
  
  // 标记开始处理
  sessionContext.synthesisState.isProcessing = true;
  
  try {
    const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
      sessionContext.speechSynthesizer!.speakTextAsync(
        fullTranslationText,
        (result) => resolve(result),
        (error) => reject(error)
      );
    });
    
    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
      const audioData = result.audioData;
      if (audioData && audioData.byteLength > 0) {
        console.log(`标准响应合成完成，加入队列: ${audioData.byteLength} 字节`);
        
        // 标准模式：清空队列后直接播放（确保完整性）
        sessionContext.synthesisState.audioQueue = []; // 清空之前的队列
        enqueueAudio(sessionContext, audioData);
        
        // 更新状态
        sessionContext.synthesisState.lastSynthesizedText = fullTranslationText;
        sessionContext.synthesisState.lastSynthesisTime = Date.now();
        // 重置标点符号索引
        sessionContext.synthesisState.lastPunctuationIndex = fullTranslationText.length - 1;
      }
    }
  } catch (error) {
    console.error('标准响应合成失败:', error);
  } finally {
    sessionContext.synthesisState.isProcessing = false;
  }
}

// 混合响应合成：前N句快速，后续标准
async function performHybridResponseSynthesis(
  sessionContext: SessionContext,
  translations: Record<string, string>
) {
  const synthesisState = sessionContext.synthesisState;
  
  // 检查是否还在快速响应阶段
  if (synthesisState.isHybridModeActive && synthesisState.sentenceCount < synthesisConfig.hybridResponse.quickSentenceCount) {
    // 前N句使用快速响应
    await performQuickResponseSynthesis(sessionContext, translations);
  } else {
    // 第一次切换到标准模式时的提示
    if (synthesisState.isHybridModeActive) {
      synthesisState.isHybridModeActive = false;
      if (synthesisConfig.hybridResponse.modeSwitchNotification) {
        console.log(`混合模式：已完成${synthesisConfig.hybridResponse.quickSentenceCount}句快速响应，切换到标准模式以确保准确性`);
      }
    }
    
    // 使用标准响应
    await performStandardResponseSynthesis(sessionContext, translations);
  }
}

// 统一的合成函数入口
async function performSynthesis(
  sessionContext: SessionContext,
  translations: Record<string, string>
) {
  if (synthesisConfig.mode === 'Quick') {
    await performQuickResponseSynthesis(sessionContext, translations);
  } else if (synthesisConfig.mode === 'Standard') {
    await performStandardResponseSynthesis(sessionContext, translations);
  } else if (synthesisConfig.mode === 'Hybrid') {
    await performHybridResponseSynthesis(sessionContext, translations);
  }
}



async function performManualSynthesis(
  config: ClientConfig,
  translations: Record<string, string>,
  socket: WebSocket
) {
  console.log('开始手动语音合成:', { translations, voice: config.voice });
  
  try {
    // 创建语音合成配置
    const speechConfig = sdk.SpeechConfig.fromSubscription(config.apiKey, config.region);
    speechConfig.speechSynthesisVoiceName = config.voice;
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
    
    // 只合成目标语言的翻译文本（通常translations只有一个键值对）
    const targetLanguageKey = Object.keys(translations)[0];
    const translationText = translations[targetLanguageKey];
    
    if (!translationText || translationText.trim() === '') {
      console.log('跳过语音合成：翻译文本为空');
      return;
    }
    
    console.log(`合成语音: "${translationText}" (语言: ${targetLanguageKey}, 音色: ${config.voice})`);
    
    // 创建语音合成器
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    
    // 执行语音合成
    const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
      synthesizer.speakTextAsync(
        translationText,
        (result) => {
          resolve(result);
        },
        (error) => {
          reject(error);
        }
      );
    });
    
    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
      const audioData = result.audioData;
      if (audioData && audioData.byteLength > 0) {
        console.log(`语音合成成功，发送音频数据: ${audioData.byteLength} 字节`);
        socket.send(audioData);
      } else {
        console.warn('语音合成完成但没有音频数据');
      }
    } else {
      console.error('语音合成失败:', {
        reason: result.reason,
        errorDetails: result.errorDetails
      });
    }
    
    synthesizer.close();
  } catch (error) {
    console.error('手动语音合成出错:', error);
  }
}

// 安全的语言检测辅助函数
function safeDetectLanguage(result: sdk.TranslationRecognitionResult, useAutoDetect: boolean, fallbackLanguages: string[]): string | null {
  if (!useAutoDetect) {
    return null;
  }

  try {
    // 方法1：尝试使用官方API（可能会抛出异常）
    const autoDetectResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
    if (autoDetectResult && autoDetectResult.language) {
      return autoDetectResult.language;
    }
  } catch (error) {
    // 忽略官方API错误，继续尝试其他方法
  }

  try {
    // 方法2：尝试访问私有属性
    const anyResult = result as any;
    if (anyResult.privDetectedLanguage) {
      return anyResult.privDetectedLanguage;
    }
    
    // 方法3：尝试其他可能的属性路径
    if (anyResult.privLanguageDetectionResult && anyResult.privLanguageDetectionResult.language) {
      return anyResult.privLanguageDetectionResult.language;
    }
  } catch (error) {
    // 静默处理备用方法失败
  }

  // 回退：使用配置的第一个语言
  const fallback = fallbackLanguages && fallbackLanguages.length > 0 ? fallbackLanguages[0] : null;
  return fallback;
}

function mapTranslations(map: sdk.TranslationRecognitionResult['translations']) {
  const translations: Record<string, string> = {};
  
  try {
    if (map && typeof map === 'object') {
      // Azure Speech SDK的Translations对象有特殊结构
      const anyMap = map as any;
      
      if (anyMap.privMap && anyMap.privMap.privKeys && anyMap.privMap.privValues) {
        const keys = anyMap.privMap.privKeys;
        const values = anyMap.privMap.privValues;
        
        for (let i = 0; i < keys.length && i < values.length; i++) {
          const key = keys[i];
          const value = values[i];
          if (typeof key === 'string' && typeof value === 'string') {
            translations[key] = value;
          }
        }
      } else if (typeof anyMap.forEach === 'function') {
        // 尝试forEach方法
        anyMap.forEach((value: string, key: string) => {
          translations[key] = value;
        });
      } else if (typeof anyMap.get === 'function') {
        // 尝试Map接口
        const keys = anyMap.keys ? Array.from(anyMap.keys()) : [];
        for (const key of keys) {
          if (typeof key === 'string') {
            const value = anyMap.get(key);
            if (typeof value === 'string') {
              translations[key] = value;
            }
          }
        }
      } else {
        // 处理普通对象
        for (const [key, value] of Object.entries(map)) {
          if (typeof value === 'string' && typeof key === 'string') {
            translations[key] = value;
          }
        }
      }
    }
  } catch (error) {
    console.error('处理翻译数据时出错:', error);
  }
  
  return translations;
}

function createSession(
  socket: WebSocket,
  config: ClientConfig
): Promise<SessionContext> {
  return new Promise((resolve, reject) => {
    try {
      console.log('创建 Azure Speech 配置...');
      const translationConfig = sdk.SpeechTranslationConfig.fromSubscription(
        config.apiKey,
        config.region
      );
      console.log('Azure Speech 配置创建成功');

      const autoDetectLanguages =
        config.autoDetectLanguages?.filter((item) => item) ?? [];
      const useAutoDetect =
        Boolean(config.useAutoDetect) && autoDetectLanguages.length > 0;

      // 对于自动检测，需要设置一个默认的识别语言
      if (useAutoDetect && autoDetectLanguages.length > 0) {
        translationConfig.speechRecognitionLanguage = autoDetectLanguages[0];
      } else if (!useAutoDetect && config.fromLanguage) {
        translationConfig.speechRecognitionLanguage = config.fromLanguage;
      } else {
        // 如果没有指定语言，使用英语作为默认
        translationConfig.speechRecognitionLanguage = 'en-US';
      }
      
      console.log(`翻译配置:`, {
        speechRecognitionLanguage: translationConfig.speechRecognitionLanguage,
        targetLanguage: config.targetLanguage,
        enableSpeechSynthesis: config.enableSpeechSynthesis,
        voice: config.voice,
        useAutoDetect,
        autoDetectLanguages
      });
      
      translationConfig.addTargetLanguage(config.targetLanguage);

      if (config.enableSpeechSynthesis) {
        console.log('配置语音合成:', {
          voice: config.voice,
          targetLanguage: config.targetLanguage,
          outputFormat: 'Raw24Khz16BitMonoPcm'
        });
        translationConfig.speechSynthesisVoiceName = config.voice;
        translationConfig.speechSynthesisOutputFormat =
          sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
      } else {
        console.log('语音合成已禁用');
      }

      const audioFormat = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
      const pushStream = sdk.AudioInputStream.createPushStream(audioFormat);
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      let recognizer: sdk.TranslationRecognizer;

      if (useAutoDetect) {
        const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(
          autoDetectLanguages
        );
        // 设置为连续语言识别模式，与连续识别和语义分段兼容
        autoDetectConfig.mode = sdk.LanguageIdMode.Continuous;
        console.log('启用连续语言识别模式 (Continuous)');
        
        recognizer = sdk.TranslationRecognizer.FromConfig(
          translationConfig,
          autoDetectConfig,
          audioConfig
        );
      } else {
        recognizer = new sdk.TranslationRecognizer(
          translationConfig,
          audioConfig
        );
      }

      // 配置实时标点符号和分段策略
      console.log('配置 Speech SDK 高级属性...');
      
      // 从环境变量应用Speech SDK属性
      for (const [propertyName, propertyValue] of Object.entries(speechSDKProperties)) {
        safelySetProperty(recognizer, propertyName, propertyValue);
      }

      // 应用分段策略配置
      console.log(`配置分段策略: ${config.segmentationStrategy}`);
      const segmentationProperties = parseSegmentationProperties(config.segmentationStrategy);
      
      let segmentationApplied = false;
      for (const [propertyName, propertyValue] of Object.entries(segmentationProperties)) {
        if (safelySetProperty(recognizer, propertyName, propertyValue)) {
          segmentationApplied = true;
        }
      }
      
      // 如果语义分段设置失败，回退到静音分段
      if (config.segmentationStrategy === 'Semantic' && !segmentationApplied) {
        console.log('语义分段设置失败，回退到静音分段策略...');
        const fallbackProperties = parseSegmentationProperties('Silence');
        for (const [propertyName, propertyValue] of Object.entries(fallbackProperties)) {
          safelySetProperty(recognizer, propertyName, propertyValue);
        }
      }
      
      // 额外的属性（不在环境变量中）
      // 注释掉可能导致WebSocket错误1007的属性 - 该属性用于语音合成，不适用于语音翻译
      // safelySetProperty(recognizer, 'SpeechServiceResponse_RequestWordBoundary', 'true');
      
      console.log('Speech SDK 高级属性配置完成');

      recognizer.recognizing = async (_sender, event) => {
        if (
          event.result.reason !== sdk.ResultReason.TranslatingSpeech &&
          event.result.reason !== sdk.ResultReason.RecognizingSpeech
        ) {
          return;
        }
        
        // 检查空文本，避免处理空的识别段落
        if (!event.result.text || !event.result.text.trim()) {
          return;
        }
        
        const translations = mapTranslations(event.result.translations);
        
        // 获取检测到的原始语言信息 - 使用安全的检测函数
        const detectedLanguage = safeDetectLanguage(event.result, useAutoDetect, autoDetectLanguages);
        
        console.log(`原文: "${event.result.text}" -> 翻译: ${JSON.stringify(translations)}`);
        
        sendJson(socket, 'transcript.partial', {
          id: event.result.resultId,
          sourceText: event.result.text,
          detectedLanguage,
          translations
        });

        // 根据合成模式决定是否在实时识别中进行合成
        if (config.enableSpeechSynthesis && sessionContextRef) {
          if (synthesisConfig.mode === 'Quick' || synthesisConfig.mode === 'Hybrid') {
            // 快速响应模式和混合模式：在实时识别中进行增量合成
            await performSynthesis(sessionContextRef, translations);
          }
          // 标准响应模式：不在实时识别中合成，等待最终结果
        }
      };

      // 创建一个变量来保存sessionContext，稍后赋值
      let sessionContextRef: SessionContext;

      recognizer.recognized = async (_sender, event) => {
        if (event.result.reason === sdk.ResultReason.TranslatedSpeech) {
          
          // 检查空文本，避免处理空的最终识别结果
          if (!event.result.text || !event.result.text.trim()) {
            return;
          }
          
          const translations = mapTranslations(event.result.translations);
          
          // 获取检测到的原始语言信息 - 使用安全的检测函数
          const detectedLanguage = safeDetectLanguage(event.result, useAutoDetect, autoDetectLanguages);
          
          console.log(`最终结果 - 原文: "${event.result.text}" -> 翻译: ${JSON.stringify(translations)}`);
          
          sendJson(socket, 'transcript.final', {
            id: event.result.resultId,
            sourceText: event.result.text,
            detectedLanguage,
            translations
          });

          // 最终识别的合成逻辑：根据合成模式决定处理方式
          if (config.enableSpeechSynthesis && sessionContextRef) {
            // 检查混合模式是否还在快速响应阶段
            const isHybridInQuickPhase = synthesisConfig.mode === 'Hybrid' && 
                                       sessionContextRef.synthesisState.isHybridModeActive && 
                                       sessionContextRef.synthesisState.sentenceCount < synthesisConfig.hybridResponse.quickSentenceCount;
            
            // 如果是快速模式或混合模式的快速阶段，使用快速响应逻辑
            if (synthesisConfig.mode === 'Quick' || isHybridInQuickPhase) {
              await performSynthesis(sessionContextRef, translations);
              return; // 快速模式处理完毕，不再执行标准模式的合成逻辑
            }
            
            // 标准模式或混合模式的标准阶段：合成整个最终文本
            const translationText = Object.values(translations)[0] || '';
            const synthesisState = sessionContextRef.synthesisState;
            const lastSynthesizedText = synthesisState.lastSynthesizedText || '';
            
            // 检查是否是全新的文本或者有显著变化
            const isNewOrChangedText = !translationText.startsWith(lastSynthesizedText) && 
                                     !lastSynthesizedText.startsWith(translationText) && 
                                     translationText !== lastSynthesizedText;
            
            if (isNewOrChangedText || translationText.length > lastSynthesizedText.length + 10) {
              // 如果是新文本或有显著变化，合成整个文本
              console.log(`最终合成整个文本: "${translationText}"`);
              
              if (sessionContextRef.speechSynthesizer && !synthesisState.isProcessing) {
                synthesisState.isProcessing = true;
                
                try {
                  const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
                    sessionContextRef.speechSynthesizer!.speakTextAsync(
                      translationText,
                      (result) => resolve(result),
                      (error) => reject(error)
                    );
                  });
                  
                  if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                    const audioData = result.audioData;
                    if (audioData && audioData.byteLength > 0) {
                      console.log(`最终合成完成，加入队列: ${audioData.byteLength} 字节`);
                      // 清空之前的队列，确保最终结果优先播放
                      synthesisState.audioQueue = [];
                      enqueueAudio(sessionContextRef, audioData);
                      
                      // 更新状态
                      synthesisState.lastPunctuationIndex = translationText.length - 1;
                      synthesisState.lastSynthesizedText = translationText;
                      
                      // 混合模式：增加句子计数
                      if (synthesisConfig.mode === 'Hybrid') {
                        synthesisState.sentenceCount++;
                        console.log(`混合模式：已完成第 ${synthesisState.sentenceCount} 句`);
                      }
                    }
                  }
                } catch (error) {
                  console.error('最终合成失败:', error);
                } finally {
                  synthesisState.isProcessing = false;
                }
              }
            } else {
              // 如果是增量文本，只合成剩余部分
              const startIndex = lastSynthesizedText.length;
              const remainingText = translationText.slice(startIndex).trim();
              
              if (remainingText && remainingText.length > 0) {
                console.log(`最终合成剩余文本: "${remainingText}"`);
                
                if (sessionContextRef.speechSynthesizer && !synthesisState.isProcessing) {
                  synthesisState.isProcessing = true;
                  
                  try {
                    const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
                      sessionContextRef.speechSynthesizer!.speakTextAsync(
                        remainingText,
                        (result) => resolve(result),
                        (error) => reject(error)
                      );
                    });
                    
                    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                      const audioData = result.audioData;
                      if (audioData && audioData.byteLength > 0) {
                        console.log(`最终合成完成，加入队列: ${audioData.byteLength} 字节`);
                        enqueueAudio(sessionContextRef, audioData);
                        
                        // 更新状态
                        synthesisState.lastPunctuationIndex = translationText.length - 1;
                        synthesisState.lastSynthesizedText = translationText;
                        
                        // 混合模式：增加句子计数
                        if (synthesisConfig.mode === 'Hybrid') {
                          synthesisState.sentenceCount++;
                          console.log(`混合模式：已完成第 ${synthesisState.sentenceCount} 句`);
                        }
                      }
                    }
                  } catch (error) {
                    console.error('最终合成失败:', error);
                  } finally {
                    synthesisState.isProcessing = false;
                  }
                }
              }
            }
          }
        } else if (event.result.reason === sdk.ResultReason.NoMatch) {
          // 静默处理无匹配结果
        }
      };

      recognizer.sessionStarted = () => {
        sendJson(socket, 'session.started');
      };

      recognizer.sessionStopped = () => {
        sendJson(socket, 'session.ended');
      };

      // 注意：不使用事件驱动的合成，因为它只支持单一目标语言
      // 我们将在 recognized 事件中进行手动合成

      recognizer.canceled = (_sender, event) => {
        console.error('识别器取消:', {
          reason: event.reason,
          errorCode: event.errorCode,
          errorDetails: event.errorDetails
        });
        
        // 检查是否是认证问题
        if (event.errorCode === sdk.CancellationErrorCode.AuthenticationFailure) {
          console.error('认证失败 - 请检查 API Key 和 Region');
          sendJson(socket, 'error', {
            message: '认证失败，请检查 Azure Speech 服务的 API Key 和 Region 配置'
          });
        } else if (event.errorCode === sdk.CancellationErrorCode.ConnectionFailure) {
          console.error('连接失败 - 请检查网络连接');
          
          // 检查是否是WebSocket错误代码1007（数据格式问题）
          if (event.errorDetails?.includes('websocket error code: 1007')) {
            console.error('WebSocket数据验证失败 - 可能是语音分段策略配置问题');
            console.log('建议解决方案：');
            console.log('1. 检查当前Azure Speech SDK版本是否支持语义分段');
            console.log('2. 尝试切换到静音分段策略');
            console.log('3. 检查PropertyId配置是否正确');
            
            sendJson(socket, 'error', {
              message: '语音配置验证失败，建议尝试切换分段策略或检查SDK兼容性',
              details: '如果使用语义分段，请确保Azure Speech SDK版本≥1.41'
            });
          } else {
            sendJson(socket, 'error', {
              message: '无法连接到 Azure Speech 服务，请检查网络连接'
            });
          }
        } else if (event.errorCode === sdk.CancellationErrorCode.ServiceError) {
          console.error('服务错误 - Azure Speech 服务内部错误');
          sendJson(socket, 'error', {
            message: '服务内部错误，请稍后重试或联系技术支持'
          });
        } else {
          sendJson(socket, 'error', {
            message: event.errorDetails ?? '识别器已取消: ' + event.reason
          });
        }
      };

      console.log('启动连续识别...');
      recognizer.startContinuousRecognitionAsync(
        async () => {
          console.log('连续识别启动成功');
          
          // 预热语音合成器连接
          let speechSynthesizer: sdk.SpeechSynthesizer | null = null;
          if (config.enableSpeechSynthesis) {
            try {
              const speechConfig = sdk.SpeechConfig.fromSubscription(config.apiKey, config.region);
              speechConfig.speechSynthesisVoiceName = config.voice;
              speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
              speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig);
            } catch (error) {
              console.error('语音合成器预热失败:', error);
            }
          }
          
          const sessionContext = {
            socket,
            config,
            pushStream,
            recognizer,
            speechSynthesizer: speechSynthesizer || undefined,
            synthesisState: {
              lastSynthesizedText: '',
              lastSynthesisTime: 0,
              isProcessing: false,
              lastPunctuationIndex: -1,
              audioQueue: [],
              isPlaying: false,
              sentenceCount: 0,
              isHybridModeActive: synthesisConfig.mode === 'Hybrid'
            },
            disposed: false
          };
          
          // 赋值给引用，供事件处理器使用
          sessionContextRef = sessionContext;
          
          resolve(sessionContext);
        },
        (error) => {
          console.error('启动连续识别失败:', error);
          recognizer.close();
          reject(error);
        }
      );
    } catch (error) {
      console.error('创建会话失败:', error);
      reject(error);
    }
  });
}

async function disposeSession(context: SessionContext | null) {
  if (!context || context.disposed) {
    return;
  }

  context.disposed = true;

  context.pushStream.close();

  // 清理语音合成器
  if (context.speechSynthesizer) {
    try {
      context.speechSynthesizer.close();
      console.log('语音合成器已关闭');
    } catch (error) {
      console.error('关闭语音合成器失败:', error);
    }
  }

  await new Promise<void>((resolve) => {
    context.recognizer.stopContinuousRecognitionAsync(
      () => {
        context.recognizer.close();
        resolve();
      },
      (error) => {
        console.error('停止识别器失败', error);
        context.recognizer.close();
        resolve();
      }
    );
  });
}

function parseClientMessage(data: any): string | Buffer {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Buffer) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(data);
}

wss.on('connection', (socket) => {
  console.log('新的 WebSocket 连接已建立');
  let session: SessionContext | null = null;
  let initialized = false;

  socket.on('message', async (rawData, isBinary) => {
    try {
      if (!initialized) {
        if (isBinary) {
          console.log('在初始化期间收到二进制数据，忽略');
          return;
        }
        const text = parseClientMessage(rawData).toString();
        console.log('收到客户端配置消息:', text);
        const message = JSON.parse(text) as {
          type: string;
          payload: ClientConfig;
        };

        if (message.type !== 'config') {
          console.error('错误的消息类型:', message.type);
          sendJson(socket, 'error', {
            message: '启动消息格式错误。'
          });
          socket.close();
          return;
        }

        console.log('开始创建翻译会话:', message.payload);
        session = await createSession(socket, message.payload);
        initialized = true;
        return;
      }

      if (!session) {
        console.log('会话未初始化，忽略消息');
        return;
      }

      if (!isBinary) {
        console.log('收到非二进制消息，忽略');
        return;
      }

      const chunk = parseClientMessage(rawData);
      if (chunk instanceof Buffer) {
        const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
        
        session.pushStream.write(arrayBuffer);
      } else {
        console.log('收到的数据不是Buffer格式:', typeof chunk);
      }
    } catch (error) {
      console.error('处理消息失败', error);
      sendJson(socket, 'error', {
        message: '服务器处理音频时出现异常: ' + String(error)
      });
      socket.close();
    }
  });

  socket.on('close', () => {
    disposeSession(session).catch((error) =>
      console.error('释放会话失败', error)
    );
  });

  socket.on('error', (error) => {
    console.error('WebSocket 错误', error);
    disposeSession(session).catch((err) =>
      console.error('释放会话失败', err)
    );
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
