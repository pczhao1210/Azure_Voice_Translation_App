const START_DELAY = 0.01; // 减少启动延迟从50ms到10ms
const MIN_BUFFER_SIZE = 1024; // 最小缓冲区大小

export class AudioPlayer {
  private context: AudioContext;
  private nextStartTime: number;
  private audioQueue: ArrayBuffer[]; // 音频队列用于流式播放
  private isPlaying: boolean;

  constructor(private readonly sampleRate: number) {
    this.context = new AudioContext({
      sampleRate: this.sampleRate
    });
    this.nextStartTime = this.context.currentTime;
    this.audioQueue = [];
    this.isPlaying = false;
  }

  async resume() {
    console.log(`AudioPlayer: 当前状态 ${this.context.state}`);
    if (this.context.state === 'suspended') {
      console.log('AudioPlayer: 恢复音频上下文');
      try {
        await this.context.resume();
        console.log(`AudioPlayer: 恢复后状态 ${this.context.state}`);
      } catch (error) {
        console.error('AudioPlayer: 恢复音频上下文失败', error);
        throw error;
      }
    }
    
    // 检查浏览器是否支持音频播放
    if (this.context.state === 'running') {
      console.log('AudioPlayer: 音频上下文已就绪，可以播放音频');
    } else {
      console.warn('AudioPlayer: 音频上下文状态异常:', this.context.state);
    }
  }

  enqueuePcmChunk(chunk: ArrayBuffer) {
    console.log(`AudioPlayer: 接收音频块 ${chunk.byteLength} 字节`);
    
    if (this.context.state !== 'running') {
      console.warn(`AudioPlayer: 音频上下文状态不是运行状态: ${this.context.state}`);
      // 尝试恢复音频上下文
      this.resume().catch(error => {
        console.error('AudioPlayer: 自动恢复音频上下文失败', error);
      });
      return;
    }

    // 添加到队列进行流式处理
    this.audioQueue.push(chunk);
    
    // 如果当前没有播放，立即开始处理队列
    if (!this.isPlaying) {
      this.processAudioQueue();
    }
  }

  private processAudioQueue() {
    if (this.audioQueue.length === 0 || this.isPlaying) {
      return;
    }

    this.isPlaying = true;
    console.log(`AudioPlayer: 开始处理音频队列，队列长度: ${this.audioQueue.length}`);
    
    const processNextChunk = () => {
      if (this.audioQueue.length === 0) {
        this.isPlaying = false;
        console.log('AudioPlayer: 音频队列处理完成');
        return;
      }

      const chunk = this.audioQueue.shift()!;
      this.playChunkImmediate(chunk, processNextChunk);
    };

    processNextChunk();
  }

  private playChunkImmediate(chunk: ArrayBuffer, onComplete: () => void) {
    const int16View = new Int16Array(chunk);
    
    if (int16View.length === 0) {
      console.warn('AudioPlayer: 接收到空的音频数据');
      onComplete();
      return;
    }

    try {
      const audioBuffer = this.context.createBuffer(
        1,
        int16View.length,
        this.sampleRate
      );
      const floatChannel = audioBuffer.getChannelData(0);

      // 转换 Int16 到 Float32 并检查音频幅度
      let maxAmplitude = 0;
      for (let i = 0; i < int16View.length; i += 1) {
        const sample = int16View[i] / 32768;
        floatChannel[i] = sample;
        maxAmplitude = Math.max(maxAmplitude, Math.abs(sample));
      }
      
      console.log(`AudioPlayer: 播放音频块，时长 ${audioBuffer.duration.toFixed(3)}s，幅度 ${maxAmplitude.toFixed(4)}`);

      const source = this.context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.context.destination);

      // 优化：减少播放延迟，更紧密的音频块连接
      const startAt = Math.max(
        this.nextStartTime,
        this.context.currentTime + START_DELAY
      );
      
      source.start(startAt);
      this.nextStartTime = startAt + audioBuffer.duration;
      
      // 音频块播放完成后处理下一个
      source.addEventListener('ended', () => {
        console.log('AudioPlayer: 音频块播放完成，处理下一个');
        setTimeout(onComplete, 10); // 小延迟确保平滑播放
      });
      
    } catch (error) {
      console.error('AudioPlayer: 创建或播放音频缓冲区失败', error);
      onComplete();
    }
  }

  reset() {
    this.nextStartTime = this.context.currentTime;
    this.audioQueue = [];
    this.isPlaying = false;
    console.log('AudioPlayer: 重置播放状态和队列');
  }

  async close() {
    if (this.context.state !== 'closed') {
      await this.context.close();
    }
  }
}
