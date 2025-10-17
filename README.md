# Azure 实时语音翻译演示项目

[![快速开始](https://img.shields.io/badge/📚-快速开始-blue)](./QUICK-START.md)
[![配置示例](https://img.shields.io/badge/⚙️-配置示例-green)](./synthesis-config-examples.md)
[![优化记录](https://img.shields.io/badge/🚀-优化记录-orange)](./optimize.md)

本项目展示如何使用 **Azure AI Speech (Real-time Translation)** 能力，实现从浏览器实时采集语音、转写并翻译为目标语言文本，同时合成目标语音播放的端到端流程。旨在尽可能降低从说话到播放译文的延迟。

## 🚀 快速开始

**第一次使用？** 👉 [5分钟快速上手指南](./QUICK-START.md)

**需要调优？** 👉 [语音合成配置示例](./synthesis-config-examples.md)

**技术细节？** 👉 [性能优化记录](./optimize.md)

## 架构概览

- **前端 (`client/`)**：基于 React + Vite，负责采集麦克风音频、通过 WebSocket 推送 16 kHz PCM 流，并呈现实时转写 / 翻译文本。提供 UI 用于配置 API Key、Region、语言、音色等。
- **后端 (`server/`)**：Node.js + Express，通过 `ws` 建立 WebSocket 服务。使用 `microsoft-cognitiveservices-speech-sdk` 的 Translation Recognizer，将前端推送的音频流实时转写、翻译，并在启用时返回 24 kHz PCM 的目标语音。
- **Azure 服务**：需要在同一 Speech 资源下启用实时翻译与语音合成功能。

实时性设计要点：

1. 浏览器端使用 `ScriptProcessorNode` 将音频块降采样至 16 kHz，最小化网络传输负载。
2. WebSocket 直接转发音频字节，避免多余包装。
3. Azure 端使用连续识别 (`startContinuousRecognitionAsync`)，实时推送 `recognizing`、`recognized` 事件。
4. 返回的合成语音以 PCM 流式发送，前端使用 Web Audio 逐块排队播放，保持低延迟。

## 快速启动

### 使用启动脚本（推荐）

项目提供了智能启动脚本 `start.sh`，可以自动处理依赖安装、环境配置和端口冲突等问题：

```bash
# 启动完整开发环境（前端+后端）
./start.sh dev

# 仅启动后端开发环境
./start.sh server-dev

# 仅启动前端开发环境  
./start.sh client-dev

# 构建项目
./start.sh build

# 启动生产环境
./start.sh start

# 查看帮助信息
./start.sh -h
```

**启动脚本特性**：
- ✅ 自动检查和安装依赖
- ✅ 自动创建环境配置文件（从 `env.sample` 复制到 `server/.env`）
- ✅ 智能处理端口冲突
- ✅ 优雅的进程管理和信号处理

### 手动安装与运行步骤

如果您prefer手动控制，也可以按照以下步骤：

1. **克隆代码仓库**：
   ```bash
   git clone <repo-url>
   cd voice-translate-app
   ```

2. **安装依赖**：
   ```bash
   npm install
   ```

3. **配置环境变量**：
   ```bash
   # 复制环境变量模板
   cp env.sample server/.env
   
   # 编辑配置文件，设置您的 Azure Speech 服务密钥
   nano server/.env
   ```

4. **启动开发环境**：
   ```bash
   # 同时启动前端和后端
   npm run dev
   
   # 或者分别启动
   npm run dev:server  # 后端：http://localhost:3001
   npm run dev:client  # 前端：http://localhost:5173
   ```

5. **构建和生产部署**：
   ```bash
   npm run build  # 构建前后端
   npm run start  # 启动生产环境（仅后端）
   ```

## 环境配置说明

### Azure 资源准备

1. **创建 Speech 服务**：
   - 在 [Azure 门户](https://portal.azure.com) 创建 Speech 服务资源
   - 记录 **Key** 和 **Region**（如：`eastus2`, `eastasia` 等）
   - 确保已启用实时翻译与语音合成功能

2. **配置环境变量**：
   
   编辑 `server/.env` 文件中的关键配置：
   
   ```env
   # Azure Speech 服务配置
   AZURE_SPEECH_KEY=your_speech_service_key
   AZURE_SPEECH_REGION=eastus2
   
   # 服务端口配置
   PORT=3001
   
   # 支持的语言配置
   DEFAULT_FROM_LANGUAGE=en-US
   DEFAULT_TARGET_LANGUAGES=zh-Hans
   DEFAULT_VOICE=zh-CN-XiaoxiaoNeural
   
   # 智能语音合成触发配置（新增）
   SYNTHESIS_MIN_TEXT_LENGTH=3
   SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.8
   SYNTHESIS_MIN_LENGTH_FOR_GROWTH=8
   SYNTHESIS_TIME_INTERVAL_MS=2000
   SYNTHESIS_MIN_LENGTH_FOR_TIME=5
   SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=8
   ```

### 重要配置项说明

#### 基础配置
- **AZURE_SPEECH_KEY**: Azure Speech 服务密钥
- **AZURE_SPEECH_REGION**: Azure 服务区域
- **SUPPORTED_FROM_LANGUAGES**: 源语言选项（格式：`code:显示名称`）
- **SUPPORTED_TARGET_LANGUAGES**: 目标语言选项
- **DEFAULT_AUTO_DETECT_SOURCE_LANGUAGES**: 自动检测候选语言
- **DEFAULT_VOICE**: 默认语音合成音色

#### 智能语音合成配置 🎯

系统使用智能触发条件来决定何时进行语音合成，避免过于频繁或不完整的语音播放：

- **SYNTHESIS_MIN_TEXT_LENGTH** (默认: 3)
  - 触发语音合成的最小文本长度
  - 过短的文本不会触发合成

- **SYNTHESIS_LENGTH_GROWTH_THRESHOLD** (默认: 1.8)  
  - 文本长度增长触发阈值（倍数）
  - 当文本比上次合成增长80%时触发

- **SYNTHESIS_MIN_LENGTH_FOR_GROWTH** (默认: 8)
  - 长度增长触发的最小文本长度
  - 避免短文本的频繁触发

- **SYNTHESIS_TIME_INTERVAL_MS** (默认: 2000)
  - 基于时间间隔的触发阈值（毫秒）
  - 距离上次合成超过此时间且有新内容时触发

- **SYNTHESIS_MIN_LENGTH_FOR_TIME** (默认: 5)
  - 时间间隔触发的最小文本长度

- **SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD** (默认: 8)
  - 语义停顿后的文本增长触发阈值
  - 检测到逗号后文本增长超过此值时触发

> 💡 **安全提示**: 生产环境建议将 Azure 密钥留空，让用户在前端界面手动输入

## 使用说明

### 启动应用

1. **启动服务**：
   ```bash
   ./start.sh dev
   ```

2. **访问应用**：
   - 前端界面：http://localhost:5173
   - 后端 API：http://localhost:3001
   - 健康检查：http://localhost:3001/health

### 浏览器端操作

1. **配置参数**：
   - `API Key`：输入您的 Azure Speech 服务密钥
   - `Region`：选择 Azure 服务区域（如 `eastus2`）
   - `源语言`：选择识别语言（如：中文、英语）
   - `目标语言`：选择翻译目标语言
   - `目标音色`：选择语音合成音色

2. **功能选项**：
   - ☑️ 启用文字翻译：显示翻译文本
   - ☑️ 启用语音合成：播放目标语言语音
   - ☑️ 自动语言检测：自动识别说话语言

3. **开始使用**：
   - 点击"启动会话"
   - 允许浏览器访问麦克风
   - 开始说话，查看实时转写和翻译结果

### API 端点

- `GET /health` - 健康检查
- `GET /api/options` - 获取服务配置选项  
- `WS /api/translate` - WebSocket 实时翻译连接

## 技术特性

### 🎯 智能语音合成系统

**核心优势**：
- 🚫 **避免重复播放**：智能检测避免同一内容重复合成
- 🎯 **精准触发时机**：4种触发条件确保合适的合成时机
- ⚡ **实时响应**：连续说话中识别到句号立即触发
- 🔧 **参数化配置**：支持不同场景的个性化调优

**触发条件**：
1. **句子结束** - 检测到句号、感叹号、问号
2. **长度增长** - 文本长度显著增加时
3. **时间间隔** - 距离上次合成超过设定时间
4. **语义停顿** - 检测到逗号后的完整语义

### 实时性优化

- 🎯 **低延迟音频处理**：16kHz PCM 音频流，最小化传输延迟
- 🔄 **流式识别**：Azure Speech SDK 连续识别模式
- 📡 **WebSocket 通信**：实时双向数据传输
- 🎵 **流式语音合成**：24kHz PCM 音频流式播放

### 支持的语言

**源语言**（语音识别）：
- 🇺🇸 英语 (美国) - `en-US`
- 🇨🇳 中文 (普通话) - `zh-CN` 
- 🇯🇵 日语 - `ja-JP`
- 🇫🇷 法语 - `fr-FR`
- 🇩🇪 德语 - `de-DE`

**目标语言**（翻译输出）：
- 🇺🇸 英语 - `en`
- 🇨🇳 中文 (简体) - `zh-Hans`
- 🇯🇵 日语 - `ja`
- 🇫🇷 法语 - `fr` 
- 🇩🇪 德语 - `de`

## 🎛️ 语音合成调优指南

### 触发机制说明

系统使用4种智能触发条件来决定何时进行语音合成：

1. **句子结束检测** - 识别到 `.!?。！？` 等标点符号
2. **文本长度增长** - 当翻译文本显著增长时
3. **时间间隔触发** - 距离上次合成超过设定时间
4. **语义停顿检测** - 检测到逗号后的较长内容

### 常用调优配置

#### 🚀 快速响应配置（更敏感）
适合希望更快听到翻译结果的场景：
```env
SYNTHESIS_MIN_TEXT_LENGTH=2
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.5
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=6
SYNTHESIS_TIME_INTERVAL_MS=1500
SYNTHESIS_MIN_LENGTH_FOR_TIME=4
SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=6
```

#### 🎭 高质量配置（更保守）
适合希望听到完整、不被打断的翻译：
```env
SYNTHESIS_MIN_TEXT_LENGTH=5
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=2.2
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=12
SYNTHESIS_TIME_INTERVAL_MS=3000
SYNTHESIS_MIN_LENGTH_FOR_TIME=8
SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=12
```

#### ⚖️ 平衡配置（推荐）
适合大多数使用场景：
```env
SYNTHESIS_MIN_TEXT_LENGTH=4
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.6
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=10
SYNTHESIS_TIME_INTERVAL_MS=2500
SYNTHESIS_MIN_LENGTH_FOR_TIME=6
SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=10
```

### 调优步骤

1. **修改配置**：编辑 `server/.env` 文件中的参数
2. **重启服务**：`./start.sh dev`
3. **测试效果**：
   - 说短句：测试最小长度和快速响应
   - 说长句：测试增长阈值
   - 停顿说话：测试时间间隔
   - 复杂句子：测试语义停顿
4. **观察日志**：服务器会输出详细的触发判断信息

### 常见调优问题

**问题：触发太频繁，听到重复/碎片**
```env
# 解决：增加所有阈值参数
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=2.0    # 增加增长阈值
SYNTHESIS_TIME_INTERVAL_MS=3000          # 增加时间间隔
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=12       # 提高最小长度
```

**问题：响应太慢，等待时间长**
```env
# 解决：减少所有阈值参数
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.5    # 降低增长阈值
SYNTHESIS_TIME_INTERVAL_MS=1500          # 减少时间间隔
SYNTHESIS_MIN_TEXT_LENGTH=2              # 降低最小长度
```

**问题：短句不播放**
```env
# 解决：降低长度要求
SYNTHESIS_MIN_TEXT_LENGTH=2
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=6
```

**问题：长句被分割播放**
```env
# 解决：增加增长和语义阈值
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=2.0
SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=12
```

## 故障排除

### 常见问题

1. **端口被占用**：
   ```bash
   # 启动脚本会自动处理，或手动清理
   lsof -ti:3001 | xargs kill -9
   lsof -ti:5173 | xargs kill -9
   ```

2. **依赖安装失败**：
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **TypeScript 编译错误**：
   ```bash
   npm run lint  # 检查类型错误
   ```

4. **Azure 服务配置问题**：
   - 确认 API Key 和 Region 正确
   - 检查 Speech 服务是否启用翻译功能
   - 验证所选音色在目标 Region 可用

5. **语音合成问题**：
   ```bash
   # 检查触发条件日志
   tail -f server/logs/*.log  # 查看触发判断详情
   
   # 重置为默认配置
   cp env.sample server/.env
   ```

6. **连续说话不触发合成**：
   - 确认已启用语音合成选项
   - 查看服务器日志中的触发条件判断
   - 尝试调整 `SYNTHESIS_MIN_TEXT_LENGTH` 参数

7. **合成音频质量问题**：
   - 检查网络连接稳定性
   - 尝试更换 Azure 服务区域
   - 调整音频播放缓冲参数

## 开发建议

### 性能优化

- 考虑使用 `AudioWorklet` 替换 `ScriptProcessorNode`
- 实现音频数据压缩以减少网络传输
- 添加连接重试和错误恢复机制

### 功能扩展

- 支持多目标语言同时翻译
- 添加会话历史记录和导出功能
- 实现文本编辑和手动翻译功能
- 集成语音情感分析

### 语音合成优化

- 智能触发条件已实现，支持参数化配置
- 避免重复播放和不完整片段
- 实时识别过程中支持句号等强制触发
- 详细的调试日志帮助调优

## 📁 项目文件说明

### 核心文件
- `start.sh` - 智能启动脚本
- `server/.env` - 服务器环境配置
- `server/src/index.ts` - 主服务器逻辑
- `client/src/App.tsx` - 前端主界面
- `optimize.md` - 性能优化记录
- `synthesis-config-examples.md` - 合成配置示例

### 配置文件
- `env.sample` - 环境变量模板
- `package.json` - 项目依赖和脚本
- `server/tsconfig.json` - TypeScript 配置
- `client/vite.config.ts` - Vite 构建配置

## 参考文档

- [Azure AI Speech Translation](https://learn.microsoft.com/azure/ai-services/speech-service/speech-translation)
- [Azure Speech SDK for JavaScript](https://learn.microsoft.com/azure/ai-services/speech-service/speech-sdk)
- [Speech Service Language Support](https://learn.microsoft.com/azure/ai-services/speech-service/language-support)
- [Neural Voice Gallery](https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts)

## 📚 相关文档

- [`optimize.md`](./optimize.md) - 详细的性能优化记录和技术分析
- [`synthesis-config-examples.md`](./synthesis-config-examples.md) - 语音合成配置示例和调优指南
- [`env.sample`](./env.sample) - 完整的环境变量配置模板

## 🚀 最新特性

### v2.0 - 智能语音合成系统
- ✅ 4种智能触发条件，避免重复播放
- ✅ 实时识别过程中支持句号触发
- ✅ 参数化配置，支持不同使用场景
- ✅ 详细的调试日志和调优指南
- ✅ 预设配置（快速响应/高质量/平衡）

### v1.0 - 基础功能
- ✅ 实时语音识别和翻译
- ✅ 多语言支持
- ✅ WebSocket 流式传输
- ✅ 语音合成播放

---

如需技术支持或功能定制，请随时联系开发团队。
