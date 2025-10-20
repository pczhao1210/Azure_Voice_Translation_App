# 🚀 快速配置指南

## 🎯 5分钟快速上手

### 1. 获取 Azure 服务密钥
1. 访问 [Azure 门户](https://portal.azure.com)
2. 创建 Speech 服务资源
3. 复制 **密钥** 和 **区域**

### 2. 启动项目
```bash
# 一键启动
./start.sh dev

# 访问应用
open http://localhost:5173
```

### 3. 配置应用
在浏览器中输入：
- **API Key**: 您的 Azure Speech 密钥
- **Region**: 您的 Azure 区域（如 eastus2）
- **源语言**: 选择您要说的语言
- **目标语言**: 选择要翻译的语言

### 4. 开始使用
1. 点击"启动会话"
2. 允许麦克风权限
3. 开始说话！

---

## ⚙️ 语音合成调优快速指南

### 常见问题快速解决

| 问题 | 快速解决方案 | 配置参数 |
|------|-------------|---------|
| 🔄 **触发太频繁** | 减少敏感度 | `SYNTHESIS_LENGTH_GROWTH_THRESHOLD=2.0` |
| ⏰ **响应太慢** | 增加敏感度 | `SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.5` |
| 🤫 **短句不播放** | 降低长度要求 | `SYNTHESIS_MIN_TEXT_LENGTH=2` |
| ✂️ **长句被分割** | 增加增长阈值 | `SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=12` |

### 一键应用预设配置

**混合响应模式**（⭐ 推荐，适合所有场景）：
```bash
echo 'DEFAULT_SYNTHESIS_MODE=Hybrid
HYBRID_QUICK_SENTENCE_COUNT=3
QUICK_RESPONSE_PUNCTUATION=，。！？；：、,.!?;:
QUICK_RESPONSE_MIN_LENGTH=2
STANDARD_RESPONSE_MIN_LENGTH=5' >> server/.env
./start.sh dev
```

**快速响应模式**（适合实时对话）：
```bash
echo 'DEFAULT_SYNTHESIS_MODE=Quick
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.5
SYNTHESIS_TIME_INTERVAL_MS=1500
SYNTHESIS_MIN_TEXT_LENGTH=2' >> server/.env
./start.sh dev
```

**标准响应模式**（适合正式会议）：
```bash
echo 'DEFAULT_SYNTHESIS_MODE=Standard
STANDARD_RESPONSE_MIN_LENGTH=8' >> server/.env
./start.sh dev
```

---

## 🔧 故障排除检查清单

### ✅ 基础检查
- [ ] Azure 密钥和区域正确
- [ ] 防火墙允许端口 3001, 5173
- [ ] 浏览器允许麦克风权限
- [ ] 网络连接稳定

### 🎤 语音问题
- [ ] 麦克风工作正常
- [ ] 音量足够大
- [ ] 说话语言与设置匹配
- [ ] 环境噪音较小

### 🔊 合成问题
- [ ] 启用了语音合成选项
- [ ] 音响/耳机工作正常
- [ ] 检查服务器日志输出
- [ ] 尝试不同的触发参数

### 📊 性能问题
- [ ] 服务器 CPU/内存正常
- [ ] 网络延迟 < 200ms
- [ ] Azure 服务区域选择合适
- [ ] 浏览器性能良好

---

## 📞 需要帮助？

1. **查看日志**: 服务器控制台有详细的触发判断信息
2. **调整参数**: 参考 `synthesis-config-examples.md`
3. **重置配置**: `cp env.sample server/.env`
4. **技术支持**: 查看 `optimize.md` 了解技术细节

---

🎉 **享受智能语音翻译的乐趣！**