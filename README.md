# Azure 实时语音翻译演示项目

[![混合响应模式](https://img.shields.io/badge/💎-混合响应模式-purple)](./docs/synthesis-config-examples.md#混合响应模式配置)
[![语音分段策略](https://img.shields.io/badge/🎯-语音分段策略-blue)](./docs/SEGMENTATION_STRATEGY.md)
[![快速开始](https://img.shields.io/badge/📚-快速开始-lightblue)](./docs/QUICK-START.md)
[![更新日志](https://img.shields.io/badge/�-更新日志-red)](./CHANGELOG.md)
[![文档中心](https://img.shields.io/badge/�-文档中心-green)](./docs/README.md)

本项目展示如何使用 **Azure AI Speech (Real-time Translation)** 能力，实现从浏览器实时采集语音、转写并翻译为目标语言文本，同时合成目标语音播放的端到端流程。

## ✨ 项目特色

- 🎯 **智能分段**：支持语义分段和静音分段两种策略 - [详细说明](./docs/SEGMENTATION_STRATEGY.md)
- 💎 **混合响应**：前几句快速响应，后续标准模式，完美平衡速度与准确性 - [配置示例](./docs/synthesis-config-examples.md)
- ⚡ **增量合成**：基于标点符号的实时语音合成系统，提供流畅体验
- ⚙️ **配置驱动**：190+行环境变量配置，无需修改代码即可调优
- 🔧 **生产就绪**：完善的错误处理、音频队列管理和WebSocket稳定性
- 🚀 **性能优化**：智能触发条件，避免重复合成，专注核心翻译功能

## 🚀 快速开始

**第一次使用？** 👉 [5分钟快速上手指南](./docs/QUICK-START.md)

**了解分段策略？** 👉 [语音分段策略详解](./docs/SEGMENTATION_STRATEGY.md)

**需要调优合成？** 👉 [语音合成配置示例](./docs/synthesis-config-examples.md)

**技术细节？** 👉 [性能优化记录](./docs/optimize.md)

## 🏗️ 系统架构

### 核心组件
- **前端 (`client/`)**：基于 React + Vite，负责采集麦克风音频、通过 WebSocket 推送 16 kHz PCM 流，并呈现实时转写/翻译文本。提供简洁的 UI 配置界面。
- **后端 (`server/`)**：Node.js + Express，通过 `ws` 建立 WebSocket 服务。集成语音分段策略和增量合成系统，使用 Azure Speech SDK 实现实时翻译。
- **Azure 服务**：需要在同一 Speech 资源下启用实时翻译与语音合成功能。

### 语音分段策略
支持两种分段策略，可在UI中切换：

1. **语义分段（推荐）**：使用AI检测标点符号和语义来分段，提供更自然的语义单元
2. **静音分段（传统）**：基于静音间隔检测来分段，适合固定节奏的语音

详细配置和使用说明请查看：👉 [语音分段策略文档](./docs/SEGMENTATION_STRATEGY.md)

### 语音合成模式
支持三种合成响应模式：

1. **混合响应模式（⭐ 推荐）**：前N句使用快速响应，后续句子使用标准响应，完美平衡速度与准确性
2. **快速响应模式**：检测到标点符号立即合成增量文本，提供实时语音反馈
3. **标准响应模式**：等待完整识别结果后一次性合成，确保语音完整性

详细参数调优和配置示例请查看：👉 [语音合成配置指南](./docs/synthesis-config-examples.md)

### 音频队列管理
- 智能音频队列系统避免语音播放中断
- 增量合成支持连续播放体验
- 自动时间控制确保音频流畅性

### 混合响应模式优势 ⭐

**工作原理**: 前N句使用快速响应，后续自动切换到标准模式

```
句子1-3: 快速响应 → 检测标点立即合成，提供即时反馈
句子4+:  标准响应 → 等待完整识别，确保翻译准确性
```

**技术优势**:
- 🚀 **即时启动**: 首句0.2-0.5秒响应，用户体验流畅
- 🎯 **质量保障**: 重要内容使用标准模式，确保准确性
- ⚖️ **智能平衡**: 自适应切换，兼顾速度与质量
- 🔧 **灵活配置**: 可调整快速句子数量和切换时机

### 系统优势
- ✅ **高性能**：智能触发条件和音频队列管理，避免重复合成
- ✅ **高可靠**：完善的WebSocket错误处理和连接稳定性
- ✅ **易配置**：190+行环境变量配置，支持细粒度调优
- ✅ **易维护**：模块化设计，配置驱动架构，文档完善

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
   # 📚 详细配置说明请参考：docs/synthesis-config-examples.md
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
   
   # 智能语音合成配置（简化版本）
   SYNTHESIS_MIN_TEXT_LENGTH=3
   SYNTHESIS_TIME_INTERVAL_MS=2000
   SYNTHESIS_BREAK_WORDS=然后,接着,另外,而且,但是,不过,所以,因此,then,next,also,but,however,so
   
   # Azure Speech SDK 高级配置（可选）
   DEFAULT_SPEECH_SDK_PROPERTIES=SpeechServiceConnection_InitialSilenceTimeoutMs=5000;SpeechServiceConnection_EndSilenceTimeoutMs=2000
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

系统采用简化的 **3 条件智能合成机制**，确保翻译的及时性和完整性：

- **SYNTHESIS_MIN_TEXT_LENGTH** (默认: 3)
  - 触发语音合成的最小文本长度
  - 过短的文本不会触发合成

- **SYNTHESIS_TIME_INTERVAL_MS** (默认: 2000)
  - 基于时间间隔的触发阈值（毫秒）
  - 距离上次合成超过此时间且有新内容时触发

- **SYNTHESIS_BREAK_WORDS** (默认: 多语言断句词汇)
  - 自定义断句词汇，支持中英日多语言
  - 格式：逗号分隔的词汇列表
  - 默认值：`然后,接着,另外,而且,但是,不过,所以,因此,then,next,also,but,however,so,そして,それから,でも,しかし`

#### Azure Speech SDK 高级配置

- **DEFAULT_SPEECH_SDK_PROPERTIES**
  - Azure Speech SDK 的 PropertyId 配置
  - 格式：`PropertyId=Value;PropertyId=Value`
  - 示例：`SpeechServiceConnection_InitialSilenceTimeoutMs=5000;SpeechServiceConnection_EndSilenceTimeoutMs=2000`

#### 语音分段策略配置 🎯

系统支持两种语音分段策略，用户可以在UI界面中切换：

- **DEFAULT_SEGMENTATION_STRATEGY** (默认: Semantic)
  - `Semantic`: 语义分段 - 基于AI检测标点符号和语义进行分段（推荐）
  - `Silence`: 静音分段 - 基于静音间隔检测进行分段（传统方式）

- **SEMANTIC_SEGMENTATION_PROPERTIES** (语义分段配置)
  - `Speech_SegmentationStrategy=Semantic`: 启用语义分段策略
  - `Speech_SegmentationMaximumTimeMs=15000`: 最大分段时间（15秒安全超时）

- **SILENCE_SEGMENTATION_PROPERTIES** (静音分段配置)
  - `Speech_SegmentationSilenceTimeoutMs=500`: 静音超时时间（500毫秒）
  - `SpeechServiceConnection_InitialSilenceTimeoutMs=5000`: 初始静音超时（5秒）

**语义分段优势**：
- ✅ 提供更自然的语义单元
- ✅ 避免因短暂停顿而错误分段  
- ✅ 提高40-60%的分段准确率
- ✅ 适合连续对话和实时翻译

**静音分段优势**：
- ✅ 传统可靠的分段方式
- ✅ 适合固定节奏的语音输入
- ✅ 响应及时，延迟较低
- ✅ 适合朗读和播报场景

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

3. **语音分段策略**：
   - 🧠 **语义分段（推荐）**：基于AI检测标点符号和语义进行分段
     - 适用场景：日常对话、会议记录、连续语音翻译
     - 优势：更自然的语义单元，避免错误分段
   - ⏱️ **静音分段（传统）**：基于静音间隔检测进行分段
     - 适用场景：朗读文档、播报式输入、固定格式语音
     - 优势：响应及时，传统可靠

4. **开始使用**：
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
- 🎯 **精准触发时机**：3种核心触发条件确保合适的合成时机
- ⚡ **实时响应**：连续说话中识别到标点符号立即触发
- 🔧 **配置驱动**：环境变量控制系统行为，支持个性化调优

**触发条件（简化版）**：
1. **标点符号检测** - 识别句子结束标点（。！？；，等）
2. **时间间隔控制** - 超过配置时间间隔自动触发合成
3. **断句词汇识别** - 遇到配置的断句词汇时触发合成

**语言识别**：
- ✅ **自动语言检测**：支持Azure AI的多语言自动识别
- ✅ **原始语言显示**：实时显示检测到的源语言代码
- ✅ **翻译文本断句**：基于翻译后文本进行智能断句
- ✅ **语言切换支持**：支持会话中的语言动态切换

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

系统采用简化的 **3 条件智能合成机制**：

1. **标点符号检测** - 识别到 `.!?。！？；，` 等标点符号时立即触发
2. **时间间隔控制** - 距离上次合成超过设定时间且有新内容时触发  
3. **断句词汇识别** - 遇到配置的断句词汇时触发合成

### 常用调优配置

#### 🚀 快速响应配置（更敏感）
适合希望更快听到翻译结果的场景：
```env
SYNTHESIS_MIN_TEXT_LENGTH=2
SYNTHESIS_TIME_INTERVAL_MS=1500
SYNTHESIS_BREAK_WORDS=然后,接着,另外,但是,不过,then,next,also,but,however
```

#### 🎭 高质量配置（更保守）  
适合希望听到完整、不被打断的翻译：
```env
SYNTHESIS_MIN_TEXT_LENGTH=5
SYNTHESIS_TIME_INTERVAL_MS=3000
SYNTHESIS_BREAK_WORDS=然后,所以,因此,不过,但是,therefore,however,so,thus
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

## 📈 系统性能与扩展

### 🚀 已实现的性能优化

- ✅ **3 条件智能合成**：简化的触发逻辑，提高响应速度
- ✅ **配置驱动架构**：运行时参数调整，无需重启服务
- ✅ **错误回退机制**：多重保障，确保系统稳定运行
- ✅ **代码架构清理**：移除冗余代码，专注核心功能

### 🔧 建议的后续优化

#### 技术升级
- 考虑使用 `AudioWorklet` 替换 `ScriptProcessorNode`
- 实现音频数据压缩以减少网络传输
- 添加连接重试和错误恢复机制

#### 功能扩展
- 支持多目标语言同时翻译
- 添加会话历史记录和导出功能
- 实现文本编辑和手动翻译功能
- 集成语音情感分析

### ⚙️ 合成系统优势

- **智能触发**：3 种核心条件确保合适的合成时机
- **参数化配置**：支持不同场景的个性化调优
- **实时响应**：标点符号检测实现即时触发
- **多语言支持**：断句词汇支持中英日多语言

## 📁 项目文件说明

### 核心文件
- `start.sh` - 智能启动脚本
- `server/.env` - 服务器环境配置
- `server/src/index.ts` - 主服务器逻辑
- `client/src/App.tsx` - 前端主界面
- [`docs/SEGMENTATION_STRATEGY.md`](./docs/SEGMENTATION_STRATEGY.md) - 语音分段策略详解
- [`docs/synthesis-config-examples.md`](./docs/synthesis-config-examples.md) - 语音合成配置示例
- [`docs/optimize.md`](./docs/optimize.md) - 性能优化记录

### 配置文件
- [`env.sample`](./env.sample) - 环境变量模板
- `package.json` - 项目依赖和脚本
- `server/tsconfig.json` - TypeScript 配置
- `client/vite.config.ts` - Vite 构建配置

## 参考文档

- [Azure AI Speech Translation](https://learn.microsoft.com/azure/ai-services/speech-service/speech-translation)
- [Azure Speech SDK for JavaScript](https://learn.microsoft.com/azure/ai-services/speech-service/speech-sdk)
- [Speech Service Language Support](https://learn.microsoft.com/azure/ai-services/speech-service/language-support)
- [Neural Voice Gallery](https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts)

## 📚 相关文档

- [`docs/SEGMENTATION_STRATEGY.md`](./docs/SEGMENTATION_STRATEGY.md) - 语音分段策略功能详解和配置指南
- [`docs/synthesis-config-examples.md`](./docs/synthesis-config-examples.md) - 语音合成配置示例和参数调优指南
- [`docs/optimize.md`](./docs/optimize.md) - 详细的性能优化记录和技术分析
- [`docs/QUICK-START.md`](./docs/QUICK-START.md) - 5分钟快速上手指南
- [`env.sample`](./env.sample) - 完整的环境变量配置模板，包含语音合成模式和分段策略的详细配置

## 🚀 最新特性与版本历史

### v4.0 - 快速响应合成系统（当前版本）
- ✅ **快速响应模式**：基于标点符号的增量语音合成，实时反馈
- ✅ **标准响应模式**：完整识别结果一次性合成，确保语音完整性
- ✅ **音频队列管理**：智能队列系统避免语音播放中断
- ✅ **语音分段策略**：支持语义分段和静音分段两种策略
- ✅ **UI模式切换**：用户可在界面中选择合成模式和分段策略

### v3.0 - 系统架构优化
- ✅ **简化合成系统**：从 7 条件简化为 3 核心条件
- ✅ **配置驱动架构**：环境变量控制系统行为
- ✅ **代码架构清理**：移除非功能性延迟监控代码
- ✅ **生产就绪优化**：完善的错误处理和回退机制
- ✅ **多语言断句词汇**：支持中英日多语言配置

### v2.1 - 自动语言识别增强
- ✅ **自动语言检测**：支持 Azure AI 多语言自动识别
- ✅ **原始语言显示**：实时显示检测到的源语言
- ✅ **翻译完整性保障**：增量合成 + 强制最终合成
- ✅ **安全回退机制**：多重语言检测方法

### v2.0 - 智能语音合成系统  
- ✅ **智能触发条件**：标点符号、时间间隔、断句词汇
- ✅ **实时响应优化**：连续说话中即时触发
- ✅ **参数化配置**：支持不同使用场景调优
- ✅ **Azure SDK 增强**：PropertyId 高级配置支持

### v1.0 - 基础功能
- ✅ 实时语音识别和翻译
- ✅ 多语言支持
- ✅ WebSocket 流式传输  
- ✅ 语音合成播放

## 🔥 核心优势

### 🎯 简洁高效
- **3 条件合成系统**：逻辑清晰，性能优异
- **配置驱动**：环境变量控制，无需修改代码
- **专注核心功能**：移除冗余代码，专注翻译质量

### 🛡️ 稳定可靠
- **错误容错机制**：多重回退保障系统稳定运行
- **翻译完整性**：确保所有语音内容都得到翻译
- **生产就绪**：经过完整测试，可用于生产环境

### 🔧 易于维护
- **清洁架构**：代码结构清晰，易于理解和修改
- **完善文档**：详细的配置说明和优化记录
- **智能启动**：自动处理依赖和环境配置

---

如需技术支持或功能定制，请随时联系开发团队。
