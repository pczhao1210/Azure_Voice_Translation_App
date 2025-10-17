# 语音合成触发参数调优示例

## 🎯 当前默认配置
```bash
# 基础设置
SYNTHESIS_MIN_TEXT_LENGTH=3                    # 最小3字符才考虑合成
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.8          # 文本增长80%触发
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=8              # 增长触发需>8字符
SYNTHESIS_TIME_INTERVAL_MS=2000                # 2秒间隔触发
SYNTHESIS_MIN_LENGTH_FOR_TIME=5                # 时间触发需>5字符
SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=8          # 语义停顿后需增长8字符
```

## 🚀 快速响应配置（更敏感）
适合：希望更快听到翻译结果的用户
```bash
SYNTHESIS_MIN_TEXT_LENGTH=2                    # 2字符即可
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.5          # 50%增长即触发
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=6              # 6字符即可触发
SYNTHESIS_TIME_INTERVAL_MS=1500                # 1.5秒间隔
SYNTHESIS_MIN_LENGTH_FOR_TIME=4                # 4字符即可
SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=6          # 6字符增长即可
```

## 🎭 高质量配置（更保守）  
适合：希望听到完整、不被打断的翻译
```bash
SYNTHESIS_MIN_TEXT_LENGTH=5                    # 至少5字符
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=2.2          # 需增长120%
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=12             # 至少12字符
SYNTHESIS_TIME_INTERVAL_MS=3000                # 3秒间隔
SYNTHESIS_MIN_LENGTH_FOR_TIME=8                # 至少8字符
SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=12         # 需增长12字符
```

## ⚖️ 平衡配置（推荐）
适合：大多数使用场景
```bash
SYNTHESIS_MIN_TEXT_LENGTH=4                    # 4字符起步
SYNTHESIS_LENGTH_GROWTH_THRESHOLD=1.6          # 60%增长
SYNTHESIS_MIN_LENGTH_FOR_GROWTH=10             # 10字符触发
SYNTHESIS_TIME_INTERVAL_MS=2500                # 2.5秒间隔
SYNTHESIS_MIN_LENGTH_FOR_TIME=6                # 6字符起步
SYNTHESIS_SEMANTIC_GROWTH_THRESHOLD=10         # 10字符增长
```

## 🧪 测试场景对比

### 场景1：短句测试
**用户说**: "Hello"
- **快速响应**: 2字符 → 立即合成 ✅
- **默认配置**: 3字符 → 立即合成 ✅  
- **高质量**: 5字符 → 等待更多内容 ⏸️

### 场景2：长句测试  
**用户说**: "How are you doing today"
- **快速响应**: 文本增长50% → 多次触发 ⚡
- **默认配置**: 文本增长80% → 适度触发 ⚖️
- **高质量**: 文本增长120% → 完整后触发 🎯

### 场景3：停顿测试
**用户说**: "Hello..." (停顿2秒) "How are you"
- **快速响应**: 1.5秒 → 触发"Hello" ⚡
- **默认配置**: 2秒 → 触发"Hello" ⚖️  
- **高质量**: 3秒 → 等待更久 ⏳

## 🔧 调优步骤

### 1. 修改配置
编辑 `server/.env` 文件中的参数

### 2. 重启服务
```bash
./start.sh dev
```

### 3. 测试效果
- 说短句：测试最小长度和快速响应
- 说长句：测试增长阈值
- 停顿说话：测试时间间隔
- 复杂句子：测试语义停顿

### 4. 观察日志
服务器会输出详细的触发判断信息：
```
智能触发判断: {
  currentLength: 15,
  lastLength: 8, 
  timeSinceLastSynthesis: 1200,
  config: { lengthGrowthThreshold: 1.8, ... }
}
触发条件：文本长度显著增加 { growth: "1.88", threshold: 1.8 }
```

## 💡 调优建议

### 如果遇到问题：

**问题**: 触发太频繁，听到重复/碎片
**解决**: 增加所有阈值参数 ⬆️

**问题**: 响应太慢，等待时间长  
**解决**: 减少所有阈值参数 ⬇️

**问题**: 短句不播放
**解决**: 减少 `MIN_TEXT_LENGTH` 和 `MIN_LENGTH_FOR_GROWTH`

**问题**: 长句被分割播放
**解决**: 增加 `LENGTH_GROWTH_THRESHOLD` 和 `SEMANTIC_GROWTH_THRESHOLD`

### 最佳实践：
1. 从默认配置开始测试
2. 根据个人习惯微调
3. 测试多种说话场景  
4. 记录最适合的配置组合