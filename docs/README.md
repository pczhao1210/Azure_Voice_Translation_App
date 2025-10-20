# 📚 文档中心

本目录包含了Azure语音翻译系统的完整文档集合。

## 📖 文档导航

### 🚀 快速上手
- **[5分钟快速开始](./QUICK-START.md)** - 新用户必读，快速部署和运行指南

### ⚙️ 功能配置
- **[语音分段策略](./SEGMENTATION_STRATEGY.md)** - 语义分段vs静音分段的选择和配置
- **[语音合成配置](./synthesis-config-examples.md)** - 三种响应模式的详细配置指南

### 🔧 技术文档
- **[性能优化记录](./optimize.md)** - 系统架构演进和优化历程记录

## 🎯 核心特性

### 三种语音合成模式

| 模式类型 | 首次响应 | 平均延迟 | 准确性 | 连贯性 | 推荐场景 |
|---------|---------|---------|-------|-------|----------|
| **混合模式** ⭐ | 0.2-0.5s | 1-2s | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **所有场景** |
| 快速模式 | 0.2-0.5s | 0.5-1.0s | ⭐⭐⭐ | ⭐⭐⭐ | 实时对话、客服 |
| 标准模式 | 2-5s | 2-5s | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 正式场合、文档 |

### 混合响应模式优势

- **🚀 快速启动**: 前几句提供即时反馈，用户体验流畅
- **🎯 准确保障**: 后续句子确保翻译质量，适合重要内容
- **⚖️ 完美平衡**: 结合快速和标准模式优点，避免各自缺点
- **🔧 灵活配置**: 可根据具体场景调整参数和行为

## 🛠️ 配置概览

### 混合模式配置示例

```bash
# 混合响应模式（推荐）
DEFAULT_SYNTHESIS_MODE=Hybrid
HYBRID_QUICK_SENTENCE_COUNT=3        # 前3句使用快速响应
HYBRID_MODE_SWITCH_NOTIFICATION=false

# 快速响应参数
QUICK_RESPONSE_PUNCTUATION=，。！？；：、,.!?;:
QUICK_RESPONSE_MIN_LENGTH=2
QUICK_RESPONSE_INTERVAL_MS=500

# 标准响应参数
STANDARD_RESPONSE_MIN_LENGTH=5
```

### 语音分段配置

```bash
# 语义分段（推荐）
DEFAULT_SEGMENTATION_STRATEGY=Semantic
SEMANTIC_SEGMENTATION_MAX_SILENCE_MS=1500

# 静音分段（传统）
SILENCE_SEGMENTATION_MAX_SILENCE_MS=800
```

## 🚀 快速开始

1. **新用户** → 先阅读 [快速开始指南](./QUICK-START.md)
2. **配置调优** → 参考 [合成配置示例](./synthesis-config-examples.md)
3. **了解分段** → 查看 [分段策略文档](./SEGMENTATION_STRATEGY.md)
4. **深入了解** → 阅读 [优化记录](./optimize.md)

## 🤝 技术支持

- **配置问题**: 查看各文档中的故障排除章节
- **性能调优**: 参考 `synthesis-config-examples.md` 中的参数调优指南
- **架构理解**: 阅读 `optimize.md` 了解系统设计思路

---

💡 **提示**: 推荐使用混合响应模式，它为95%的使用场景提供了最佳的速度和准确性平衡。