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

interface ServerOptions {
  fromLanguages: LanguageOption[];
  targetLanguages: LanguageOption[];
  defaultFromLanguage: string | null;
  defaultTargetLanguage: string | null;
  defaultAutoDetectLanguages: string[];
  defaultVoice: string | null;
  defaultApiKey: string | null;
  defaultRegion: string | null;
}

interface SynthesisConfig {
  minTextLength: number;
  lengthGrowthThreshold: number;
  minLengthForGrowth: number;
  timeIntervalMs: number;
  minLengthForTime: number;
  semanticGrowthThreshold: number;
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

// 解析智能合成配置
function parseSynthesisConfig(): SynthesisConfig {
  return {
    minTextLength: parseInt(process.env.SYNTHESIS_MIN_TEXT_LENGTH || '3'),
    lengthGrowthThreshold: parseFloat(process.env.SYNTHESIS_LENGTH_GROWTH_THRESHOLD || '1.8'),
    minLengthForGrowth: parseInt(process.env.SYNTHESIS_MIN_LENGTH_FOR_GROWTH || '8'),
    timeIntervalMs: parseInt(process.env.SYNTHESIS_TIME_INTERVAL_MS || '2000'),
    minLengthForTime: parseInt(process.env.SYNTHESIS_MIN_LENGTH_FOR_TIME || '5'),
    semanticGrowthThreshold: parseInt(process.env.SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD || '8')
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
  defaultRegion: process.env.AZURE_SPEECH_REGION ?? null
};

const synthesisConfig = parseSynthesisConfig();

const app = express();
app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/options', (_req, res) => {
  res.json(serverOptions);
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
}

interface SynthesisState {
  lastSynthesizedText: string;
  lastSynthesisTime: number;
  isProcessing: boolean;
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

async function performSmartSynthesis(
  sessionContext: SessionContext,
  translations: Record<string, string>
) {
  if (!sessionContext.speechSynthesizer || Object.keys(translations).length === 0) {
    return;
  }

  const targetLanguageKey = Object.keys(translations)[0];
  const translationText = translations[targetLanguageKey];
  
  if (!translationText || translationText.trim() === '') {
    return;
  }

  // 标记开始处理
  sessionContext.synthesisState.isProcessing = true;
  
  console.log(`智能合成: "${translationText}" (语言: ${targetLanguageKey})`);
  
  try {
    const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
      sessionContext.speechSynthesizer!.speakTextAsync(
        translationText,
        (result) => resolve(result),
        (error) => reject(error)
      );
    });
    
    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
      const audioData = result.audioData;
      if (audioData && audioData.byteLength > 0) {
        console.log(`智能合成完成，发送音频: ${audioData.byteLength} 字节`);
        sessionContext.socket.send(audioData);
        
        // 更新状态
        sessionContext.synthesisState.lastSynthesizedText = translationText;
        sessionContext.synthesisState.lastSynthesisTime = Date.now();
      }
    }
  } catch (error) {
    console.error('智能合成失败:', error);
  } finally {
    // 处理完成，重置标志
    sessionContext.synthesisState.isProcessing = false;
  }
}

function shouldTriggerSynthesis(
  currentText: string,
  translations: Record<string, string>,
  synthesisState: SynthesisState
): boolean {
  // 获取翻译文本用于判断
  const translationText = Object.values(translations)[0] || '';
  const lastText = synthesisState.lastSynthesizedText;
  const lastTime = synthesisState.lastSynthesisTime;
  const now = Date.now();
  
  // 如果正在处理中，避免重复触发
  if (synthesisState.isProcessing) {
    return false;
  }
  
  // 如果文本过短，不触发
  if (translationText.length < synthesisConfig.minTextLength) {
    return false;
  }
  
  console.log('智能触发判断:', {
    currentLength: translationText.length,
    lastLength: lastText.length,
    timeSinceLastSynthesis: now - lastTime,
    translationText: translationText.substring(0, 50) + '...',
    config: synthesisConfig
  });
  
  // 1. 检测句子结束标点
  if (/[.!?。！？]$/.test(translationText.trim())) {
    console.log('触发条件：句子结束标点');
    return true;
  }
  
  // 2. 文本长度显著增加且不是太短
  if (translationText.length > lastText.length * synthesisConfig.lengthGrowthThreshold && 
      translationText.length > synthesisConfig.minLengthForGrowth) {
    console.log('触发条件：文本长度显著增加', {
      growth: (translationText.length / lastText.length).toFixed(2),
      threshold: synthesisConfig.lengthGrowthThreshold
    });
    return true;
  }
  
  // 3. 距离上次合成超过设定时间，且有足够内容
  if (now - lastTime > synthesisConfig.timeIntervalMs && 
      translationText.length > synthesisConfig.minLengthForTime && 
      translationText.length > lastText.length) {
    console.log('触发条件：时间间隔超过阈值', {
      interval: now - lastTime,
      threshold: synthesisConfig.timeIntervalMs
    });
    return true;
  }
  
  // 4. 检测到语义停顿（逗号后的较长内容）
  if (/[,，]/.test(translationText) && 
      translationText.length > lastText.length + synthesisConfig.semanticGrowthThreshold) {
    console.log('触发条件：语义停顿检测', {
      growth: translationText.length - lastText.length,
      threshold: synthesisConfig.semanticGrowthThreshold
    });
    return true;
  }
  
  return false;
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

function mapTranslations(map: sdk.TranslationRecognitionResult['translations']) {
  const translations: Record<string, string> = {};
  
  console.log('mapTranslations 输入:', map, typeof map);
  
  try {
    if (map && typeof map === 'object') {
      // Azure Speech SDK的Translations对象有特殊结构
      // 从日志看到它有 privMap.privKeys 和 privMap.privValues
      const anyMap = map as any;
      
      if (anyMap.privMap && anyMap.privMap.privKeys && anyMap.privMap.privValues) {
        const keys = anyMap.privMap.privKeys;
        const values = anyMap.privMap.privValues;
        console.log('发现privMap结构:', { keys, values });
        
        for (let i = 0; i < keys.length && i < values.length; i++) {
          const key = keys[i];
          const value = values[i];
          if (typeof key === 'string' && typeof value === 'string') {
            translations[key] = value;
            console.log(`翻译提取: ${key} -> ${value}`);
          }
        }
      } else if (typeof anyMap.forEach === 'function') {
        // 尝试forEach方法
        anyMap.forEach((value: string, key: string) => {
          translations[key] = value;
          console.log(`翻译映射: ${key} -> ${value}`);
        });
      } else if (typeof anyMap.get === 'function') {
        // 尝试Map接口
        const keys = anyMap.keys ? Array.from(anyMap.keys()) : [];
        for (const key of keys) {
          if (typeof key === 'string') {
            const value = anyMap.get(key);
            if (typeof value === 'string') {
              translations[key] = value;
              console.log(`翻译获取: ${key} -> ${value}`);
            }
          }
        }
      } else {
        // 处理普通对象
        for (const [key, value] of Object.entries(map)) {
          if (typeof value === 'string' && typeof key === 'string') {
            translations[key] = value;
            console.log(`翻译对象: ${key} -> ${value}`);
          }
        }
      }
    } else {
      console.log('未找到翻译数据或数据类型不匹配');
    }
  } catch (error) {
    console.error('处理翻译数据时出错:', error);
  }
  
  console.log('mapTranslations 结果:', translations);
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

      recognizer.recognizing = async (_sender, event) => {
        console.log(`识别中 - 原因: ${event.result.reason}, 文本: "${event.result.text}"`);
        if (
          event.result.reason !== sdk.ResultReason.TranslatingSpeech &&
          event.result.reason !== sdk.ResultReason.RecognizingSpeech
        ) {
          console.log(`跳过识别结果，原因: ${event.result.reason}`);
          return;
        }
        const translations = mapTranslations(event.result.translations);
        console.log(`实时翻译结果:`, {
          sourceText: event.result.text,
          translations,
          reason: event.result.reason
        });
        
        sendJson(socket, 'transcript.partial', {
          id: event.result.resultId,
          sourceText: event.result.text,
          translations
        });

        // 在实时识别中也进行智能合成判断，支持句号等强制触发条件
        if (config.enableSpeechSynthesis && 
            sessionContextRef && 
            shouldTriggerSynthesis(event.result.text, translations, sessionContextRef.synthesisState)) {
          console.log('实时识别中触发智能合成');
          await performSmartSynthesis(sessionContextRef, translations);
        }
      };

      // 创建一个变量来保存sessionContext，稍后赋值
      let sessionContextRef: SessionContext;

      recognizer.recognized = async (_sender, event) => {
        console.log(`识别完成 - 原因: ${event.result.reason}, 文本: "${event.result.text}"`);
        if (event.result.reason === sdk.ResultReason.TranslatedSpeech) {
          const translations = mapTranslations(event.result.translations);
          console.log(`最终翻译结果:`, {
            sourceText: event.result.text,
            translations,
            reason: event.result.reason
          });
          
          sendJson(socket, 'transcript.final', {
            id: event.result.resultId,
            sourceText: event.result.text,
            translations
          });

          // 使用智能触发条件决定是否进行语音合成
          if (config.enableSpeechSynthesis && 
              sessionContextRef && 
              shouldTriggerSynthesis(event.result.text, translations, sessionContextRef.synthesisState)) {
            console.log('智能触发最终合成');
            await performSmartSynthesis(sessionContextRef, translations);
          } else if (config.enableSpeechSynthesis) {
            console.log('智能触发条件未满足，跳过合成');
          }
        } else if (event.result.reason === sdk.ResultReason.NoMatch) {
          console.warn('无法识别语音片段');
        } else {
          console.log(`其他识别结果，原因: ${event.result.reason}`);
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
          sendJson(socket, 'error', {
            message: '无法连接到 Azure Speech 服务，请检查网络连接'
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
              console.log('预热语音合成器连接...');
              const speechConfig = sdk.SpeechConfig.fromSubscription(config.apiKey, config.region);
              speechConfig.speechSynthesisVoiceName = config.voice;
              speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
              speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig);
              console.log('语音合成器预热完成');
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
              isProcessing: false
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
        console.log('翻译会话创建成功');
        return;
      }

      if (!session) {
        return;
      }

      if (!isBinary) {
        return;
      }

      const chunk = parseClientMessage(rawData);
      if (chunk instanceof Buffer) {
        const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
        session.pushStream.write(arrayBuffer);
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
