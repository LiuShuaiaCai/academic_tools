# 特刊策划 V6：混合话题推荐方案

> 状态：设计阶段 | 基于 V5 两阶段架构升级
> 核心变化：引入 OpenAlex Topics 预标注体系，替代纯 AI 聚类

---

## 一、为什么改

### 当前 V5 的 Phase 1 问题

```
关键词搜索 → 50篇论文 → 丢掉 topics 字段 → 交给 AI 聚类 → 等 15-30 秒 → 出 3-5 个方向
```

| 问题 | 影响 |
|---|---|
| AI 每次聚类结果不一致 | 用户无法对比不同任务的结果 |
| 15-30 秒等待 | 用户体验差 |
| 3-5 个方向太少 | 用户可能找不到想要的 |
| 方向粒度完全由 AI 定 | 不可控 |
| 无视 OpenAlex 已有标注 | 浪费了权威分类数据 |

### OpenAlex Topics 能提供什么

每篇论文已自动标注 topics，四层层级结构：

```
域名 Domain          → 计算机科学 (Computer Science)
 └ 领域 Field        → 人工智能 (Artificial Intelligence)
    └ 子领域 Subfield → 自然语言处理 (Natural Language Processing)
       └ 话题 Topic   → 大语言模型 (Large Language Models)
```

每个 topic 自带：
- `id`: 持久化标识（如 `T10572`）
- `display_name`: 英文名称
- `description`: 话题描述
- `works_count`: 该话题下总论文数
- `cited_by_count`: 该话题总被引数
- `subfield` / `field` / `domain`: 父级信息
- `siblings`: 同级话题列表

---

## 二、新架构：三阶段流水线

```
┌──────────────────────────────────────────────────────────────┐
│  Phase 1A: 话题扫描（OpenAlex Topics，零 AI 成本，< 3 秒）    │
│                                                              │
│  关键词搜索 → 50 篇论文 → 提取 topics 字段 → 按 topic 聚合   │
│  → 多维排序 → 返回 Top 10 话题卡片                           │
│                                                              │
│  每个卡片包含：                                               │
│  - 话题名 + 层级路径（子领域 / 领域 / 域名）                    │
│  - 论文数量 + 总被引量                                        │
│  - 趋势箭头（近 3 年 ↑/→/↓）                                  │
│  - 开放获取比例                                               │
│  - 国家/机构多样性                                            │
│                                                              │
│  积分消耗：0（纯数据聚合）                                     │
└──────────────────────────────────────────────────────────────┘
                             ↓ 用户选择 1-3 个话题
┌──────────────────────────────────────────────────────────────┐
│  Phase 1B: 方向定制（AI 深度分析，耗时 10-20 秒）              │
│                                                              │
│  传入：{ topicInfo, topic下论文数据, 用户约束 }                 │
│  → AI 生成：中文标题/摘要/关键词 + searchKeywords              │
│                                                              │
│  积分消耗：10 积分/话题                                       │
└──────────────────────────────────────────────────────────────┘
                             ↓ 用户确认方向
┌──────────────────────────────────────────────────────────────┐
│  Phase 2: 方案生成（同 V5，耗时 30-60 秒）                    │
│                                                              │
│  用 searchKeywords 重搜 20 篇论文 → 查作者详情                 │
│  → AI 生成完整方案 + 推荐 3-5 位客编                           │
│                                                              │
│  积分消耗：20 积分（Phase 1B 已扣 10，总计 30）               │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、Phase 1A 详细设计

### 3.1 数据提取：改造 simplifyWorks

```js
// 当前：丢弃 topics
function simplifyWorks(rawWorks) {
  return rawWorks.map(function(w) {
    return {
      id: (w.id || '').split('/').pop(),
      title: w.display_name || '',
      authors: ...,
      cc: w.cited_by_count || 0,
      year: w.publication_year || 0,
      // ❌ 没有提取 topics
    };
  });
}

// 改造后：保留 topics
function simplifyWorksV6(rawWorks) {
  return rawWorks.map(function(w) {
    // 提取 primary_topic 信息
    var pt = w.primary_topic || {};
    var primaryTopicId = (pt.id || '').split('/').pop();
    var primaryTopicName = pt.display_name || '';

    // 提取所有 topics（包括 primary_topic 之外的）
    var allTopics = (w.topics || []).map(function(t) {
      var subfield = t.subfield || {};
      var field = t.field || {};
      var domain = t.domain || {};
      return {
        id: (t.id || '').split('/').pop(),
        name: t.display_name || '',
        score: t.score || 0,  // OpenAlex 置信度
        subfield: { id: subfield.id, name: subfield.display_name || '' },
        field: { id: field.id, name: field.display_name || '' },
        domain: { id: domain.id, name: domain.display_name || '' }
      };
    });

    return {
      id: (w.id || '').split('/').pop(),
      title: w.display_name || '',
      authors: ...,
      cc: w.cited_by_count || 0,
      year: w.publication_year || 0,
      oa: (w.open_access && w.open_access.is_oa) || false,
      doi: w.doi || '',
      // V6 新增
      primaryTopicId: primaryTopicId,
      primaryTopicName: primaryTopicName,
      topics: allTopics
    };
  });
}
```

### 3.2 话题聚合与排序

```js
function aggregateTopics(papers) {
  var topicMap = {};

  papers.forEach(function(paper) {
    var topics = paper.topics || [];

    topics.forEach(function(t) {
      if (!topicMap[t.id]) {
        topicMap[t.id] = {
          id: t.id,
          name: t.name,
          score: t.score,
          subfield: t.subfield,
          field: t.field,
          domain: t.domain,
          papers: [],
          paperCount: 0,
          totalCitations: 0,
          oaCount: 0,
          years: {},
          countries: {},
          institutions: {}
        };
      }
      var entry = topicMap[t.id];
      entry.papers.push(paper.id);
      entry.paperCount++;
      entry.totalCitations += paper.cc;
      if (paper.oa) entry.oaCount++;
      entry.years[paper.year] = (entry.years[paper.year] || 0) + 1;
      // 国家和机构从论文的 authorships 中提取
    });
  });

  // 转为数组并计算额外指标
  var list = Object.values(topicMap).map(function(t) {
    return {
      ...t,
      avgCitations: t.paperCount > 0 ? Math.round(t.totalCitations / t.paperCount) : 0,
      oaRate: t.paperCount > 0 ? Math.round(t.oaCount / t.paperCount * 100) : 0,
      trend: calcTrend(t.years),  // 'up' | 'flat' | 'down'
      heatScore: calcHeatScore(t)  // 0-1000 综合热度分
    };
  });

  // 排序：热度分降序
  list.sort(function(a, b) { return b.heatScore - a.heatScore; });

  return list.slice(0, 10); // Top 10
}
```

### 3.3 热度评分算法（heatScore 0-1000）

```js
function calcHeatScore(topic) {
  // 权重配置
  var W_CITE = 0.40;      // 被引量权重
  var W_COUNT = 0.25;     // 论文数量权重
  var W_TREND = 0.20;     // 趋势权重
  var W_OA = 0.10;        // 开放获取权重（传播力指标）
  var W_DIVERSITY = 0.05; // 国家多样性权重

  // 各维度归一化到 0-1000（相对于 Top 10 话题中的 max 值做归一化）
  // 简化版：先按被引量分段映射
  var citeScore = Math.min(1000, Math.log10(topic.totalCitations + 1) * 250);
  var countScore = Math.min(1000, Math.log10(topic.paperCount + 1) * 300);
  var trendScore = topic.trend === 'up' ? 1000 : (topic.trend === 'flat' ? 500 : 200);
  var oaScore = Math.min(1000, topic.oaRate * 10);
  var diversityScore = Math.min(1000, Object.keys(topic.countries).length * 100);

  return Math.round(
    citeScore * W_CITE +
    countScore * W_COUNT +
    trendScore * W_TREND +
    oaScore * W_OA +
    diversityScore * W_DIVERSITY
  );
}

function calcTrend(years) {
  // 计算近 3 年论文数量的趋势
  var sortedYears = Object.keys(years).sort();
  if (sortedYears.length < 2) return 'flat';
  var recent = sortedYears.slice(-3);
  var counts = recent.map(function(y) { return years[y] || 0; });
  var delta = counts[counts.length - 1] - counts[0];
  if (delta > counts[0] * 0.1) return 'up';
  if (delta < -counts[0] * 0.1) return 'down';
  return 'flat';
}
```

### 3.4 Topic 卡片展示

```
┌─────────────────────────────────────────────────────────┐
│  🏷️ Large Language Models                     🔥 892   │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 层级：AI → Natural Language Processing             │ │
│  │ 📄 32 篇论文   📈 趋势 ↑   🔓 OA 占比 65%           │ │
│  │ 🌍 涉及 12 个国家 / 45 个机构                       │ │
│  │ 📊 总被引 4,280 次   均被引 134 次/篇              │ │
│  └────────────────────────────────────────────────────┘ │
│                                   [选择] [了解更多论文]  │
└─────────────────────────────────────────────────────────┘
```

### 3.5 UX 流程：话题扫描页

```
Phase 1A 页面：
┌─────────────────────────────────────────────┐
│  📝 创建特刊策划话题                          │
│                                               │
│  研究关键词 *                                 │
│  ┌──────────────────────────────────────┐   │
│  │ Large Language Models                │   │
│  └──────────────────────────────────────┘   │
│                                               │
│  附加要求（可选）                              │
│  ┌──────────────────────────────────────┐   │
│  │ 请聚焦中国学者...                      │   │
│  └──────────────────────────────────────┘   │
│                                               │
│  [搜索话题]    💰 搜索免费（选择后扣费）      │
│                                               │
├─────────────────────────────────────────────┤
│  搜索结果：发现 10 个相关话题                  │
│                                               │
│  ☑ Topic 1 卡片  🔥892  ↑趋势 32篇          │
│  ☐ Topic 2 卡片  🔥743  →平稳 18篇          │
│  ☐ Topic 3 卡片  🔥621  ↑趋势 25篇          │
│  ...                                          │
│                                               │
│  [已选 1/3]   [进入深度分析 (10积分)]         │
└─────────────────────────────────────────────┘
```

---

## 四、Phase 1B 详细设计

### 4.1 AI 深度分析动作

用户选择 1-3 个话题后，点击"进入深度分析"：

**输入**：每个话题 + 该话题下的论文数据 + 用户约束

**新版 Phase1 Prompt**（相比 V5 的改动）：

```
角色：学术趋势分析专家

任务：
1. 用户已选定 OpenAlex 话题「Large Language Models」（id: T10572）
   请基于下方该话题的真实论文数据，为该话题生成 1 份深度方向分析

2. 输出包含：
   - zh/en: 中英文标题、摘要(200-400字)、关键词
   - searchKeywords: 用于第二阶段的精准搜索关键词（英文2-5个）
   - topicHeat: 基于被引量 0-1000
   - paperCount: 依据论文数量

关键规则：
- 标题不可直接照搬 OpenAlex 话题名，要有期刊特刊的吸引力
- 摘要要包含该方向的研究现状、热点子方向、待探索的 gap
- searchKeywords 要比话题名更具体，用于精准搜索论文
```

### 4.2 扣费策略

| 阶段 | 调用 | 积分消耗 | 说明 |
|---|---|---|---|
| Phase 1A | 纯数据聚合 | **0** | 用户可反复搜索，不花钱 |
| Phase 1B | AI 分析 1 个话题 | **10** | 每个话题 10 积分 |
| Phase 2 | AI 生成方案 + 作者搜索 | **20** | 总流程 30 积分 |

> 用户可以选择只做 Phase 1B 得到方向建议，也可以继续做 Phase 2 得到完整方案。

---

## 五、数据模型变化

### 5.1 Task 集合新增字段

```js
{
  // ===== 新增：Phase 1A 话题 =====
  phase1aTopics: [
    {
      topicId: 'T10572',
      topicName: 'Large Language Models',
      paperCount: 32,
      totalCitations: 4280,
      avgCitations: 134,
      trend: 'up',
      oaRate: 65,
      countryCount: 12,
      heatScore: 892,
      sourceArticleIds: ['W123', ...],
      subfield: { id: '...', name: 'Natural Language Processing' },
      field: { id: '...', name: 'Artificial Intelligence' },
      domain: { id: '...', name: 'Computer Science' }
    }
  ],

  // ===== 新增：Phase 1B 选中的方向 =====
  selectedDirections: [
    {
      topicId: 'T10572',
      key: 'd1',           // 同 V5 的 direction key
      zh: { title, abstract, keywords },
      en: { title, abstract, keywords },
      searchKeywords: [...],
      topicHeat: 820,
      sourceArticleIds: [...]
    }
  ],

  // ===== 新增：阶段标记 =====
  phase: '1a' | '1b' | '2' | 'completed',

  // ===== 积分消耗拆分 =====
  creditsDeducted1b: false,   // Phase 1B 是否已扣
  creditsDeducted2: false,    // Phase 2 是否已扣
  creditsCost1b: 10,          // Phase 1B 消耗
  creditsCost2: 20,           // Phase 2 消耗
}
```

---

## 六、前端改动

### 6.1 详情页改造

详情页从 V5 的简单"方案 Tab"变成**四个 Tab**：

```
┌─────────────────────────────────────────────┐
│ [📊 话题扫描] [🔬 深度分析] [📝 方案] [👤 客编] │
├─────────────────────────────────────────────┤
│ （根据当前 phase 决定哪个 Tab 有数据）        │
│                                              │
│  Phase 1A 完成后 → 话题扫描 Tab 有内容        │
│  Phase 1B 完成后 → 深度分析 Tab 有内容        │
│  Phase 2  完成后 → 方案 Tab + 客编 Tab 有内容 │
└─────────────────────────────────────────────┘
```

### 6.2 话题扫描 Tab 内容

- **横向对比卡片**：selectedDirections 中每个方向一张卡片
- **热力对比图**：柱状图对比 heatScore / paperCount / oaRate 等
- **趋势图**：逐年论文数小折线图

---

## 七、实施计划

### Step 1: 改造 simplifyWorks（1 小时）
- 提取 `primary_topic` 和 `topics` 数组
- 保留原有字段不变

### Step 2: 实现 Phase 1A 云函数逻辑（3 小时）
- `action: 'scanTopics'` 入口
- 论文搜索 → 话题聚合 → 排序 → 返回 Top 10
- 保存 phase1aTopics 到数据库

### Step 3: 前端话题扫描页（4 小时）
- 列表页改造：搜索后直接展示话题卡片
- 多选逻辑（最多选 3 个）
- 无积分消耗提示

### Step 4: 改造 Phase 1（1 小时）
- 将 V5 的 `doFullPipeline` 改为 `doPhase1bPipeline`
- 基于选定话题做 AI 深度分析（不再是自由聚类）

### Step 5: Phase 2 保持不变（0.5 小时）
- V5 的 `doPhase2Pipeline` 已满足需求

### Step 6: 前端详情页 Tab 改造（3 小时）
- 新增 Tab 导航
- 话题扫描 Tab 的对比图表
- 深度分析 Tab 的内容展示

### Step 7: 积分系统适配（1 小时）
- Phase 1A 免费
- Phase 1B 扣 10 积分（或按话题数扣）
- Phase 2 扣 20 积分

**总预估工作量：13.5 小时**

---

## 八、风险与取舍

| 风险 | 应对 |
|---|---|
| 部分论文没有 topics 标注 | 过滤掉无 topic 的论文，优先用有标注的 |
| 关键词搜索范围过小导致 topics 太少 | 尝试扩展搜索策略（同义词、上级领域） |
| OpenAlex topics 只有英文 | UI 用中英文对照，或 Phase 1B 期间 AI 翻译 |
| 话题有交叉（一篇论文属于多个话题） | 按 topic.score 加权，高置信度优先 |
| Phase 1A 数据聚合可能慢 | 50 篇论文的 topics 本地处理，预计 < 500ms |

---

## 九、与 V5 的兼容

V5 的 `action: 'trigger'` → `doFullPipeline` 保留（降级方案），新增：

| action | 功能 | 积分 |
|---|---|---|
| `scanTopics` | Phase 1A：话题扫描（新增） | 0 |
| `analyzeDirection` | Phase 1B：方向定制（新增） | 10 |
| `selectDirection` | Phase 2：方案生成（同 V5） | 20 |
| `trigger` | 一键全流程（兼容旧版） | 30 |
