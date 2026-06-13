# 特刊策划 V5 技术文档

> 状态：生产环境 | 两阶段异步架构 | V5.1
> 最后更新：2026-06-13

---

## 一、架构概述

```
用户输入关键词
  │
  ├─ Trigger（主入口）
  │   ├─ 创建 DB 任务记录（status: processing）
  │   ├─ 返回 taskId 给前端
  │   └─ fire-and-forget → 触发 process Worker
  │
  ├─ Phase 1 Worker（doFullPipeline）
  │   ├─ Step 1: OpenAlex 搜索 200 篇论文（relevance 排序）
  │   ├─ Step 2: 代码层按引用量重排 → top 100 → simplifyWorks 精简
  │   ├─ Step 3: 调用 Kimi LLM 聚类 3-5 个研究方向（每方向 15-20 篇论文）
  │   ├─ Step 4: 解析 JSON、校验 sourceArticleIds
  │   ├─ Step 5: 代码层从论文真实数据计算统计量（avgCitations/avgFWCI/...）
  │   ├─ Step 6: 过滤只保留被引用的论文（不存全部 100 篇）
  │   ├─ 扣 30 积分（creditsAPI）
  │   └─ 写入 DB（status: awaiting_selection）
  │
  ├─ 用户选择方向 → selectDirection
  │   └─ fire-and-forget → 触发 runPhase2 Worker
  │
  └─ Phase 2 Worker（doPhase2Pipeline）
      ├─ Step 1: 按方向 searchKeywords 重搜 20 篇论文
      ├─ Step 2: 提取作者 ID → 批量查询作者详情（h-index 排序 top 20）
      ├─ Step 3: Kimi LLM 生成完整方案 + 推荐 3-5 位客编
      ├─ Step 4: 解析 JSON、校验引用关系
      └─ 写入 DB（status: completed）
```

---

## 二、API 端点

### 2.1 OpenAlex 论文搜索

```
GET https://api.openalex.org/works
  ?search={query}
  &per-page=200
  &sort=relevance_score:desc
  &select=id,display_name,authorships,cited_by_count,publication_year,doi,primary_location,primary_topic,concepts,keywords,fwci,citation_normalized_percentile,counts_by_year,type
  &filter=from_publication_date:2024-01-01
```

**select 字段说明：**

| 字段 | 说明 | 用途 |
|---|---|---|
| `id` | 论文唯一标识（如 `https://openalex.org/W123`） | sourceArticleIds |
| `display_name` | 论文标题 | LLM 聚类依据 |
| `authorships` | 作者列表（含 author.id, author.display_name） | 后续查作者详情 |
| `cited_by_count` | 总被引次数 | 排序 + topicHeat 计算 |
| `publication_year` | 发表年份 | 时效性筛选 |
| `doi` | DOI 标识符 | 论文链接 |
| `primary_location` | 主要来源（含 source.display_name = 期刊名） | topJournalRatio 计算 |
| `primary_topic` | OpenAlex 主话题（单对象，含 display_name, subfield, field, domain） | 论文领域标注 |
| `concepts` | OpenAlex 概念标签（含 display_name） | 论文领域标注 |
| `keywords` | 论文关键词（含 display_name） | LLM 聚类辅助 |
| `fwci` | 领域加权引用影响力（Field-Weighted Citation Impact） | avgFWCI 计算 |
| `citation_normalized_percentile` | 引用百分位（含 is_in_top_1_percent, is_in_top_10_percent） | topJournalRatio 判断 |
| `counts_by_year` | 逐年被引量数组 [{year, cited_by_count}] | hotRecent 计算 |
| `type` | 文献类型（article/review 等） | 类型筛选 |

**返回结构（OpenAlex API 原始响应）：**

```json
{
  "meta": {
    "count": 15234,
    "db_response_time_ms": 45,
    "page": 1,
    "per_page": 200
  },
  "results": [
    {
      "id": "https://openalex.org/W4398732891",
      "display_name": "Paper Title",
      "authorships": [
        {
          "author": {
            "id": "https://openalex.org/A5032427290",
            "display_name": "Author Name"
          },
          "institutions": [
            {
              "id": "https://openalex.org/Ixxx",
              "display_name": "University Name"
            }
          ]
        }
      ],
      "cited_by_count": 45,
      "publication_year": 2024,
      "doi": "https://doi.org/10.xxx/xxx",
      "primary_location": {
        "source": {
          "id": "https://openalex.org/Sxxx",
          "display_name": "Nature"
        }
      },
      "primary_topic": {
        "id": "https://openalex.org/T10572",
        "display_name": "Large Language Models",
        "score": 0.95,
        "subfield": { "id": "...", "display_name": "..." },
        "field": { "id": "...", "display_name": "..." },
        "domain": { "id": "...", "display_name": "..." }
      },
      "concepts": [
        { "id": "...", "display_name": "Artificial Intelligence", "score": 0.9 }
      ],
      "keywords": [
        { "id": "...", "display_name": "machine learning" }
      ],
      "fwci": 3.2,
      "citation_normalized_percentile": {
        "value": 95,
        "is_in_top_1_percent": false,
        "is_in_top_10_percent": true
      },
      "counts_by_year": [
        { "year": 2024, "cited_by_count": 12 },
        { "year": 2025, "cited_by_count": 28 },
        { "year": 2026, "cited_by_count": 5 }
      ],
      "type": "article",
      "abstract_inverted_index": { "word1": [0, 5], "word2": [1] }
    }
  ]
}
```

### 2.2 OpenAlex 作者查询

```
GET https://api.openalex.org/authors
  ?filter=openalex_id:A5032427290|A5032427291|...
  &per-page=50
```

**返回结构：**

```json
{
  "meta": { "count": 30, "per_page": 50 },
  "results": [
    {
      "id": "https://openalex.org/A5032427290",
      "display_name": "Author Name",
      "works_count": 120,
      "cited_by_count": 4500,
      "last_known_institution": {
        "id": "https://openalex.org/Ixxx",
        "display_name": "University Name"
      },
      "summary_stats": {
        "h_index": 35,
        "i10_index": 80
      },
      "topics": [
        { "id": "...", "display_name": "Topic Name" }
      ],
      "counts_by_year": [
        { "year": 2024, "works_count": 8, "cited_by_count": 150 }
      ]
    }
  ]
}
```

### 2.3 Kimi LLM（Moonshot API）

```
POST https://api.moonshot.cn/v1/chat/completions

Headers:
  Content-Type: application/json
  Authorization: Bearer {KIMI_API_KEY}

Body:
{
  "model": "moonshot-v1-128k",
  "messages": [
    { "role": "system", "content": "{PHASE1_SYSTEM_PROMPT}" },
    { "role": "user", "content": "{USER_MESSAGE}" }
  ],
  "max_tokens": 16384
}
```

**返回结构：**

```json
{
  "choices": [
    {
      "message": {
        "content": "{ \n  \"plans\": [...] \n }"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 4500,
    "completion_tokens": 2500,
    "total_tokens": 7000
  }
}
```

---

## 三、数据精简（simplifyWorks）

### 3.1 输入 → 输出映射

OpenAlex 原始字段 → `simplifyWorks` 精简后字段：

| 输出字段 | 来源 | 说明 |
|---|---|---|
| `id` | `w.id.split('/').pop()` | 如 `W4398732891` |
| `title` | `w.display_name` | 论文标题 |
| `abstract` | `rebuildAbstract(w.abstract_inverted_index)` | 还原纯文本摘要（截取前 600 字符） |
| `authors` | `w.authorships[].author.display_name` | 作者姓名数组 |
| `cc` | `w.cited_by_count` | 总被引次数 |
| `year` | `w.publication_year` | 发表年份 |
| `url` | `w.id` | OpenAlex 完整 URL |
| `doi` | `w.doi` | DOI |
| `citationsByYear` | `w.counts_by_year` | `{ years: [...], counts: [...] }` |
| `type` | `w.type` | 文献类型 |
| `journal` | `w.primary_location.source.display_name` | 期刊名 |
| `topics` | `w.primary_topic.display_name` | OpenAlex 主话题名（单元素数组） |
| `concepts` | `w.concepts[].display_name` | OpenAlex 概念标签数组 |
| `keywords` | `w.keywords[].display_name` | 论文关键词数组 |
| `fwci` | `w.fwci` | 领域加权引用影响力 |
| `citationPercentile.value` | `w.citation_normalized_percentile.value` | 引用百分位值 |
| `citationPercentile.isTop1` | `w.citation_normalized_percentile.is_in_top_1_percent` | 是否 Top 1% |
| `citationPercentile.isTop10` | `w.citation_normalized_percentile.is_in_top_10_percent` | 是否 Top 10% |
| `hotRecent` | `calcHotRecent(w.counts_by_year)` | 近两年引用次数之和 |

### 3.2 simplifyWorks 精简后的论文结构

```json
{
  "id": "W4398732891",
  "title": "Paper Title",
  "abstract": "This paper presents...",
  "authors": ["Author A", "Author B"],
  "cc": 45,
  "year": 2024,
  "url": "https://openalex.org/W4398732891",
  "doi": "https://doi.org/10.xxx/xxx",
  "citationsByYear": {
    "years": [2024, 2025, 2026],
    "counts": [12, 28, 5]
  },
  "type": "article",
  "journal": "Nature",
  "topics": ["Large Language Models"],
  "concepts": ["Artificial Intelligence", "Machine Learning"],
  "keywords": ["deep learning", "transformer"],
  "fwci": 3.2,
  "citationPercentile": {
    "value": 95,
    "isTop1": false,
    "isTop10": true
  },
  "hotRecent": 33
}
```

### 3.3 simplifyAuthors 精简后的作者结构

```json
{
  "id": "A5032427290",
  "n": "Author Name",
  "inst": "University Name",
  "wc": 120,
  "cc": 4500,
  "h": 35,
  "i10": 80,
  "top": ["Topic1", "Topic2", "Topic3"],
  "worksByYear": { "years": [2020,2021,2022], "counts": [8,10,12] },
  "citationsByYear": { "years": [2020,2021,2022], "counts": [100,150,200] }
}
```

---

## 四、Phase 1 完整流程

### 4.1 入口

```
action: "process" (Worker 模式)
```

### 4.2 Step 1: 搜索论文

**搜索策略**：关键词预处理 → OpenAlex 搜索 → 代码层排序

```
关键词预处理：
  "ai, material; 半导体" → "ai material 半导体"
  （逗号/顿号/分号 → 空格）

OpenAlex 请求：
  search=ai%20material%20半导体
  per-page=200
  sort=relevance_score:desc
  filter=from_publication_date:2024-01-01

代码层后处理：
  1. 按 cited_by_count 降序重排（相关性由 OpenAlex 保证，引用量体现影响力）
  2. slice(0, 100) — 取 Top 100 篇
  3. simplifyWorks(rawPapers) — 精简为结构化数据
```

**传给 LLM 的论文数量**：100 篇（全量传入，不裁剪）

### 4.3 Step 2: AI 趋势分析

**系统提示词** (`PHASE1_SYSTEM_PROMPT`)：
- 角色：学术趋势分析专家
- 任务：从论文数据中挖掘 3-5 个差异化明显的研究方向
- 每个方向必须基于真实论文数据
- 输出纯 JSON

**用户消息** (`buildPhase1UserMessage`)：
- 研究关键词
- 100 篇论文精简数据
- 用户附加约束（可选）
- 论文字段说明 + 输出格式要求

### 4.4 Step 3: 解析结果

**LLM 输出格式**（Phase 1）：

```json
{
  "plans": [
    {
      "key": "d1",
      "zh": {
        "title": "方向中文标题",
        "abstract": "方向中文摘要 200-400 字",
        "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]
      },
      "en": {
        "title": "Direction English Title",
        "abstract": "Direction English abstract 200-400 words",
        "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]
      },
      "searchKeywords": ["keyword1 for search", "keyword2 for search"],
      "topicHeat": 750,
      "sourceArticleIds": ["W123", "W456", "...", "W789"]
    }
  ]
}
```

> **关键变化**（V5.1）：`sourceArticleIds` 从 3 篇增至 **15-20 篇**，每个方向用更多论文支撑。`avgCitations` / `avgFWCI` / `topJournalRatio` / `hotRecentAvg` / `paperCount` 不再由 LLM 输出，改为**代码层精确计算**。

**解析流程**：
1. `extractJSON(llm.content)` — 提取 JSON
2. `validateSourceRefs(json, sourcePapers, [])` — 校验 `sourceArticleIds` 是否存在，过滤幻觉 ID
3. **代码层计算统计量**（新增 V5.1）：
   - 构建 `paperMap: { id → paper对象 }` 快速索引
   - 对每个 plan，遍历 `sourceArticleIds`，从 paperMap 查找对应论文数据
   - 精确计算 `avgCitations`（平均被引量）、`avgFWCI`（平均 FWCI）、`topJournalRatio`（isTop10 占比）、`hotRecentAvg`（平均近两年引用）、`paperCount`（实际匹配数）
   - 这些统计量直接注入 plan 对象，前端可直接展示

### 4.5 Step 4: 扣积分 + 写库

**扣费**：
- 调用 `creditsAPI` → `action: spendCredits`
- `actionType`: `special_issue`
- `points`: 30
- 返回 `{ success, balance, insufficient }`

**写入 special_issue_tasks 集合**：

```json
{
  "_id": "si_1718000000000_abc123",
  "_openid": "xxx",
  "keyword": "ai material",
  "constraints": "",
  "status": "awaiting_selection",
  "result": {
    "plans": [
      {
        "key": "d1",
        "zh": { "title": "...", "abstract": "...", "keywords": [...] },
        "en": { "title": "...", "abstract": "...", "keywords": [...] },
        "searchKeywords": [...],
        "topicHeat": 750,
        "paperCount": 28,
        "sourceArticleIds": [...],
        "avgCitations": 134,
        "avgFWCI": 3.2,
        "topJournalRatio": 0.15,
        "hotRecentAvg": 33
      }
    ]
  },
  "sourcePapers": [
    // 仅保存被 sourceArticleIds 引用的论文（约 50-80 篇，而非全部 100 篇）
    // V5.1 优化：不存全部论文，只保留有价值的引用论文
    { "id": "W123", "title": "...", "cc": 45, ... },
    ...
  ],
  "sourceAuthors": [],
  "phase1Usage": { "prompt_tokens": 4500, "completion_tokens": 2500, "total_tokens": 7000 },
  "progress": "awaiting_selection",
  "steps": [
    { "key": "search_papers", "label": "搜索论文数据", "status": "completed" },
    { "key": "trend_analysis", "label": "AI 趋势分析（聚类方向）", "status": "completed" },
    { "key": "parse_result", "label": "解析并保存结果", "status": "completed" }
  ],
  "creditsDeducted": true,
  "creditsCost": 30,
  "completedAt": 1718000000000,
  "createdAt": 1717999900000,
  "updatedAt": 1718000000000
}
```

### 4.6 前端轮询

```
action: "poll"
请求: { taskId: "si_xxx" }
返回: { success: true, data: { status, progress, result, steps, sourcePapers, ... } }
```

---

## 五、Phase 2 完整流程

### 5.1 入口

```
action: "selectDirection" → fire-and-forget → action: "runPhase2"
```

### 5.2 Step 1: 按方向关键词重搜论文

```
搜索词: selectedDirection.searchKeywords 取前 3 个拼接
per-page=20
sort=relevance_score:desc
filter=from_publication_date:2024-01-01
```

### 5.3 Step 2: 提取作者并查询详情

1. 遍历 20 篇论文的 `authorships`，提取所有 `author.id`
2. 去重后按 50 个一批调用 `getAuthorsByIds`
3. 结果按 `h_index` 降序排序
4. 取 Top 20 传给 LLM

### 5.4 Step 3: AI 生成完整方案

**用户消息** (`buildPhase2UserMessage`)：
- `directionInfo`：选定方向的基本信息
- `sourcePapers`：20 篇精准论文
- `llmAuthors`：Top 20 作者详情
- 用户约束

**LLM 输出格式**（Phase 2）：

```json
{
  "plan": {
    "zh": {
      "title": "话题中文标题",
      "abstract": "中文摘要 300-500 字",
      "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]
    },
    "en": {
      "title": "English Title",
      "abstract": "English abstract 300-500 words",
      "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]
    },
    "guestEditors": [
      { "name": "Scholar Name", "institution": "University Name" }
    ],
    "topicHeat": 820,
    "sourceArticleIds": ["W123", "W456"],
    "sourceEditorIds": ["A111", "A222"]
  }
}
```

### 5.5 Step 4: 解析 + 写库

```
写入 DB:
  status: "completed"
  result: { plan: plan, plans: phase1Plans }
  selectedPlanKey: "d1"
  sourcePapers: [...]
  sourceAuthors: [...]
  phase2Usage: { ... }
```

---

## 六、积分系统

### 6.1 扣费时机

```
Phase 1 完成 → 扣 30 积分（一次性）
Phase 2 → 不再扣费
regenerate → 再次扣 30 积分（先查余额）
```

### 6.2 creditsAPI 接口

**调用方式**：

```js
cloud.callFunction({
  name: 'creditsAPI',
  data: {
    action: 'spendCredits',
    actionType: 'special_issue',
    points: 30,
    description: '特刊策划 -30',
    relatedId: taskId,
    _openid: openid
  }
})
```

**返回**：

```json
{
  "success": true,
  "balance": 120,
  "insufficient": false
}
```

**失败场景**：

```json
{
  "success": false,
  "insufficient": true,
  "balance": 10,
  "error": "积分不足"
}
```

---

## 七、数据库集合 `special_issue_tasks`

### 7.1 完整字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 任务 ID（`si_{timestamp}_{random}`） |
| `_openid` | string | 用户 openid |
| `keyword` | string | 研究关键词 |
| `constraints` | string | 用户附加要求 |
| `status` | string | `processing` / `awaiting_selection` / `completed` / `failed` |
| `progress` | string | `searching` / `trend_analysis` / `regenerating` / `phase2_*` / `awaiting_selection` / `completed` |
| `steps` | array | 步骤状态数组 |
| `result` | object | `{ plans: [...] }` 或 `{ plan: {...}, plans: [...] }` |
| `sourcePapers` | array | Phase 1 或 Phase 2 的论文精简数据 |
| `sourceAuthors` | array | Phase 2 的作者精简数据 |
| `phase1Usage` | object | Phase 1 LLM token 用量 |
| `phase2Usage` | object | Phase 2 LLM token 用量 |
| `usage` | object | 最新 LLM token 用量 |
| `creditsDeducted` | boolean | Phase 1 是否已扣费 |
| `creditsCost` | number | 积分消耗（30） |
| `selectedPlanKey` | string | 用户选中的方向 key |
| `selectedDirectionAt` | number | 选中方向的时间戳 |
| `regenerateCount` | number | 重新生成次数 |
| `regenerateHistory` | array | 历史结果存档 |
| `_regenerating` | boolean | 是否正在重新生成 |
| `createdAt` | number | 创建时间戳 |
| `updatedAt` | number | 更新时间戳 |
| `completedAt` | number | 完成时间戳 |

### 7.2 状态机

```
processing → awaiting_selection → processing → completed
     │              │                   │
     └── failed     └── failed          └── failed
     
regenerate: awaiting_selection → processing → awaiting_selection
```

---

## 八、所有 action 一览

| action | 触发方式 | 功能 | 积分 |
|---|---|---|---|
| `trigger`（默认） | 前端请求 | 创建任务 + fire-and-forget process | 0（创建时） |
| `process` | Worker | 执行 Phase 1 完整流水线 | 完成后扣 30 |
| `poll` | 前端轮询 | 查询任务状态 | 0 |
| `list` | 前端请求 | 查询用户任务列表 | 0 |
| `delete` | 前端请求 | 删除任务 | 0 |
| `selectDirection` | 前端请求 | 用户选方向 → 触发 Phase 2 | 0 |
| `runPhase2` | Worker | 执行 Phase 2 完整流水线 | 0 |
| `regenerate` | 前端请求 | 触发重新生成 → fire-and-forget | 先校验余额 |
| `regenerateProcess` | Worker | 执行重新生成（仅 LLM） | 完成后扣 30 |

---

## 九、关键设计决策

### 9.1 搜索排序策略演变

| 版本 | 策略 | 问题 |
|---|---|---|
| 初始 | `sort=cited_by_count:desc` | 搜 "ai material" 返回医学论文（高引但不相关） |
| 当前 | `sort=relevance_score:desc` + 代码层按 `cited_by_count` 重排 | 先保证主题相关，再体现影响力 |

### 9.2 两阶段异步架构

- **为什么异步**：Phase 1 耗时 15-30 秒，不能阻塞前端
- **方案**：前端先拿 taskId，通过 `poll` 轮询获取结果
- **Phase 2 同样异步**：`selectDirection` 触发 Worker 后前端继续轮询

### 9.3 论文传全量给 LLM

- Phase 1 传 100 篇全量论文数据给 LLM
- Phase 2 传 20 篇全量论文 + 20 位作者
- 不预裁剪，让 LLM 自己判断哪些论文属于哪个方向

### 9.4 引用校验

- `validateSourceRefs` 对 LLM 输出的 `sourceArticleIds` / `sourceEditorIds` 做白名单校验
- 过滤掉不存在的 ID，防止 LLM 幻觉

### 9.5 统计量计算策略（V5.1）

| 版本 | 策略 | 问题 |
|---|---|---|
| V5.0 | LLM 估算 avgCitations/avgFWCI/topJournalRatio/hotRecentAvg | LLM 不擅长精确数值计算，3 篇样本无统计意义 |
| V5.1 | LLM 只输出 15-20 篇 sourceArticleIds，代码层从论文真实数据精确计算统计量 | 精确可靠，15-20 篇样本有统计意义 |

### 9.6 论文存储策略（V5.1）

- **不保存全部 100 篇**：DB 只存储被 `sourceArticleIds` 实际引用的论文（约 50-80 篇）
- **保留价值**：只有被方向引用的论文才有存档价值，用于 regenerate 时使用
- **节省空间**：减少 DB 文档大小约 20-50%
