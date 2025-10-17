import { useCallback, useRef, useState } from 'react';
import { AudioPlayer } from '../audio/AudioPlayer';
import { SessionConfig, SessionPhase, TranscriptEntry } from '../types';

const RECOGNIZER_SAMPLE_RATE = 16000;
const SYNTHESIZER_SAMPLE_RATE = 24000;

interface MessageBase {
  type: string;
  [key: string]: unknown;
}

interface TranscriptPayload {
  id: string;
  sourceText: string;
  translations: Record<string, string>;
}

interface StateSnapshot {
  phase: SessionPhase;
  transcripts: TranscriptEntry[];
  partialSource?: string;
  partialTranslation?: string;
  error?: string;
}

const initialState: StateSnapshot = {
  phase: 'idle',
  transcripts: []
};

function downsampleBuffer(
  buffer: Float32Array,
  sampleRate: number,
  outSampleRate: number
) {
  if (outSampleRate === sampleRate) {
    return convertToPCM(buffer);
  }

  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (
      let i = offsetBuffer;
      i < nextOffsetBuffer && i < buffer.length;
      i += 1
    ) {
      accum += buffer[i];
      count += 1;
    }

    const value = count > 0 ? accum / count : 0;
    result[offsetResult] = Math.max(-1, Math.min(1, value)) * 0x7fff;

    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function convertToPCM(buffer: Float32Array) {
  const result = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return result;
}

function arrayBufferFromInt16(view: Int16Array) {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

function extractPayload(message: MessageBase) {
  return message.payload as TranscriptPayload | undefined;
}

export function useTranslationSession() {
  const [state, setState] = useState<StateSnapshot>(initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const pendingSegmentRef = useRef<string | null>(null);
  const configRef = useRef<SessionConfig | null>(null);

  const cleanupAudioInput = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const cleanupAudioOutput = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.close().catch(() => undefined);
      audioPlayerRef.current = null;
    }
  }, []);

  const cleanupWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
  }, []);

  const stop = useCallback(async () => {
    cleanupWebSocket();
    cleanupAudioInput();
    cleanupAudioOutput();
    pendingSegmentRef.current = null;
    configRef.current = null;

    setState((prev) => ({
      ...prev,
      phase: 'idle'
    }));
  }, [cleanupAudioInput, cleanupAudioOutput, cleanupWebSocket]);

  const start = useCallback(
    async (config: SessionConfig) => {
      if (state.phase !== 'idle') {
        return;
      }

      if (!config.apiKey || !config.region) {
        setState((prev) => ({
          ...prev,
          error: '请提供有效的 API Key 与 Region。'
        }));
        return;
      }

      if (config.useAutoDetect && config.autoDetectLanguages.length === 0) {
        setState((prev) => ({
          ...prev,
          error: '请至少选择一个用于自动识别的候选语言。'
        }));
        return;
      }

      if (!config.useAutoDetect && !config.fromLanguage) {
        setState((prev) => ({
          ...prev,
          error: '请指定语音识别语言或启用自动识别。'
        }));
        return;
      }

      setState({
        phase: 'connecting',
        transcripts: [],
        partialSource: undefined,
        partialTranslation: undefined,
        error: undefined
      });

      configRef.current = config;

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        mediaStreamRef.current = mediaStream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        const sourceNode = audioContext.createMediaStreamSource(mediaStream);
        const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0;

        sourceNode.connect(processorNode);
        processorNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        if (config.enableSpeechSynthesis) {
          console.log('初始化音频播放器...');
          const audioPlayer = new AudioPlayer(SYNTHESIZER_SAMPLE_RATE);
          
          // 确保用户交互后才能播放音频
          const enablePlayback = async () => {
            try {
              await audioPlayer.resume();
              console.log('音频播放器已激活，可以播放声音');
            } catch (error) {
              console.error('激活音频播放器失败:', error);
            }
          };
          
          // 立即尝试激活
          await enablePlayback();
          audioPlayerRef.current = audioPlayer;
          console.log('音频播放器初始化完成');
        }

        // 在开发环境中，直接连接到后端服务器
        const wsUrl = new URL('/api/translate', window.location.href);
        wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        
        // 如果是开发环境，使用 Vite 代理
        console.log('尝试连接 WebSocket:', wsUrl.toString());
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket 连接已建立');
          ws.send(
            JSON.stringify({
              type: 'config',
              payload: config
            })
          );
          console.log('已发送配置信息:', config);
          setState((prev) => ({
            ...prev,
            phase: 'running',
            transcripts: [],
            partialSource: undefined,
            partialTranslation: undefined,
            error: undefined
          }));
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const message: MessageBase = JSON.parse(event.data);
              if (message.type === 'transcript.partial') {
                const payload = extractPayload(message);
                if (!payload) {
                  return;
                }
                pendingSegmentRef.current = payload.id;
                const target =
                  payload.translations[config.targetLanguage] ?? '';
                console.log('实时翻译:', {
                  source: payload.sourceText,
                  target,
                  targetLanguage: config.targetLanguage,
                  translations: payload.translations
                });
                setState((prev) => ({
                  ...prev,
                  partialSource: payload.sourceText,
                  partialTranslation: target,
                  error: undefined
                }));
              } else if (message.type === 'transcript.final') {
                const payload = extractPayload(message);
                if (!payload) {
                  return;
                }
                const target =
                  payload.translations[config.targetLanguage] ?? '';
                console.log('最终翻译:', {
                  source: payload.sourceText,
                  target,
                  targetLanguage: config.targetLanguage,
                  translations: payload.translations
                });
                setState((prev) => ({
                  ...prev,
                  transcripts: [
                    ...prev.transcripts,
                    {
                      id: payload.id,
                      sourceText: payload.sourceText,
                      translationText: target,
                      isFinal: true,
                      updatedAt: Date.now()
                    }
                  ],
                  partialSource:
                    pendingSegmentRef.current === payload.id
                      ? undefined
                      : prev.partialSource,
                  partialTranslation:
                    pendingSegmentRef.current === payload.id
                      ? undefined
                      : prev.partialTranslation,
                  error: undefined
                }));
                pendingSegmentRef.current = null;
              } else if (message.type === 'session.ended') {
                stop().catch(() => undefined);
              } else if (message.type === 'error') {
                const description =
                  typeof message.message === 'string'
                    ? message.message
                    : '会话出现未知错误。';
                setState((prev) => ({
                  ...prev,
                  error: description,
                  phase: 'error'
                }));
                stop().catch(() => undefined);
              }
            } catch (error) {
              console.error('解析服务端消息失败', error);
            }
          } else if (event.data instanceof ArrayBuffer) {
            console.log(`收到音频数据: ${event.data.byteLength} 字节`);
            audioPlayerRef.current?.enqueuePcmChunk(event.data);
          } else if (event.data instanceof Blob) {
            console.log(`收到音频 Blob: ${event.data.size} 字节`);
            event.data
              .arrayBuffer()
              .then((buffer) => {
                console.log(`转换后的 ArrayBuffer: ${buffer.byteLength} 字节`);
                audioPlayerRef.current?.enqueuePcmChunk(buffer);
              })
              .catch((error) => {
                console.error('处理音频数据失败', error);
              });
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket 连接错误:', event);
          setState((prev) => ({
            ...prev,
            error: 'WebSocket 连接出现错误。',
            phase: 'error'
          }));
        };

        ws.onclose = (event) => {
          console.log('WebSocket 连接已关闭:', event.code, event.reason);
          cleanupAudioInput();
          cleanupAudioOutput();
          wsRef.current = null;
          setState((prev) => ({
            ...prev,
            phase: 'idle'
          }));
        };

        processorNode.onaudioprocess = (event) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
          }
          const input = event.inputBuffer.getChannelData(0);
          const pcm16 = downsampleBuffer(
            input,
            audioContext.sampleRate,
            RECOGNIZER_SAMPLE_RATE
          );
          wsRef.current.send(arrayBufferFromInt16(pcm16));
        };

        processorRef.current = processorNode;
      } catch (error) {
        console.error(error);
        setState((prev) => ({
          ...prev,
          error: '初始化音频或网络连接失败，请检查权限与配置。',
          phase: 'error'
        }));
        await stop();
      }
    },
    [cleanupAudioInput, cleanupAudioOutput, state.phase, stop]
  );

  return {
    phase: state.phase,
    transcripts: state.transcripts,
    partialSource: state.partialSource,
    partialTranslation: state.partialTranslation,
    error: state.error,
    start,
    stop
  };
}
