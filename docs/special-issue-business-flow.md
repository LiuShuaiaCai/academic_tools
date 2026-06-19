# 特刊策划 (Special Issue) 业务全流程 & 数据模型

---

## 一、数据模型（三层级联）

```
special_issue_tasks (任务主表)
 ├── _id: "task_1718736000_abc123"
 ├── keyword / constraints / status / progress / steps
 ├── creditsDeducted / creditsCost / phase1Usage
 ├── activeSchemeId / regenerateCount / regenerateHistory
 └── createdAt / updatedAt / completedAt

   1 : N ──→  special_issue_directions (方向表)
              ├── _id: "taskId_A"    ← 外键 = taskId + '_' + key
              ├── taskId → tasks._id
              ├── key / zh / en / searchKeywords
              ├── topicHeat / avgCitations / avgFWCI / topJournalRatio / hotRecentAvg / paperCount
              ├── sourceArticleIds / sourcePapers
              └── createdAt

               1 : N ──→  special_issue_schemes (方案表)
                          ├── _id: "taskId_s_1718736100_x7k2"
                          ├── taskId → tasks._id
                          ├── directionId → directions._id (显式外键)
                          ├── directionKey (冗余，兼容)
                          ├── keyword / constraints
                          ├── status / progress / steps
                          ├── plan (方案JSON) / phase1Plans / sourcePapers / sourceAuthors
                          ├── usage / error
                          └── createdAt / completedAt / updatedAt
```

---

## 二、完整流程

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: 创建任务 (Trigger)                                     │
├─────────────────────────────────────────────────────────────────┤
│ 前端: specialIssue.js → doCreateTopic(keyword, constraints)    │
│ 云函数: 无 action 参数 → 默认 Trigger                            │
│                                                                  │
│ → 写入 special_issue_tasks:                                      │
│   { _id, _openid, keyword, constraints,                         │
│     status: "processing", progress: "searching",                │
│     steps: [{search_papers,running},{trend_analysis,pending},  │
│             {parse_result,pending}],                            │
│     creditsDeducted: false, creditsCost: 30 }                   │
│                                                                  │
│ → 返回 { success: true, taskId } 给前端                         │
│ → fire-and-forget: invokeWorker → action: "process"            │
│                                                                  │
│ 前端: 收到 taskId → 跳转 detail 页 → startPolling() 轮询        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Phase1 趋势分析 (doFullPipeline)                        │
│  消费: 30 积分（首次），重试不扣                                │
├─────────────────────────────────────────────────────────────────┤
│ Step 2.1 - search_papers                                       │
│   OpenAlex: searchWorks(keyword, fromYear=2024, perPage=50,    │
│                         sort=relevance_score:desc)              │
│   → simplifyWorks() 精简为: { id, title, cc, fwci, hotRecent,  │
│       citationPercentile, keywords, primary_topic, year }       │
│   → 得到 sourcePapers[] (实际返回 ≤50 篇)                      │
│                                                                  │
│ Step 2.2 - trend_analysis                                      │
│   调用 Kimi LLM:                                                │
│   - System: "你是学术趋势分析专家，从论文中挖掘3个差异化方向"     │
│   - User: buildPhase1UserMessage(keyword, sourcePapers, ...)    │
│           把 50 篇论文的 (id,title,year,citations,topic) 发给AI  │
│   要求 AI 返回 JSON:                                            │
│   { plans: [                                                    │
│     { key:"A", zh:{title,abstract,keywords}, en:{...},          │
│       searchKeywords:[...], topicHeat:0-1000,                   │
│       sourceArticleIds:[论文id列表] }                           │
│   ] }                                                           │
│                                                                  │
│ Step 2.3 - parse_result                                        │
│   extractJSON() 解析 AI 返回 → validateSourceRefs() 校验id     │
│   代码层计算统计量（从论文真实数据，不用AI给的）:                  │
│     avgCitations = mean(cited_by_count)                         │
│     avgFWCI = mean(fwci)                                        │
│     hotRecentAvg = mean(hotRecent)                              │
│     topJournalRatio = count(journal) / total                    │
│     paperCount = matched.length                                 │
│   过滤 referencedPapers = sourcePapers ∩ allReferencedIds       │
│                                                                  │
│ Step 2.4 - 持久化                                              │
│   → 更新 tasks: status="awaiting_selection", phase1Usage        │
│   → 写入 directions (每个方向一条):                              │
│     _id = taskId_A, taskId, key, zh, en, searchKeywords,       │
│     topicHeat, avgCitations, avgFWCI, topJournalRatio,          │
│     hotRecentAvg, paperCount, sourceArticleIds, sourcePapers    │
│                                                                  │
│   注意: tasks 表不再存 result / sourcePapers / selectedPlanKey  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: 方向选择 (前端展示)                                      │
├─────────────────────────────────────────────────────────────────┤
│ 前端轮询 → poll → 检测 status != "processing"                   │
│ → loadTrendDetail()                                            │
│   云函数 action: getTrendDetail(taskId)                         │
│   → 从 directions 集合读取所有方向                               │
│   → 从 schemes 集合按 directionId 分组                           │
│   返回: { keyword, status, directions[], schemesByDir,          │
│           schemeCount, generatingSchemeId }                    │
│                                                                  │
│ 前端渲染方向卡片列表:                                            │
│   - 每个方向显示 zh/en title, topicHeat 热度条                   │
│   - 趋势对比柱状图 (topicHeat 归一化)                            │
│   - 指标: avgCitations, avgFWCI, topJournalRatio, paperCount    │
│   - _matchedPapers 论文列表 (从 direction.sourcePapers 读取)     │
│   - [生成方案] 按钮                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                    用户点击 [生成方案]
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: 生成方案 (startScheme + runPhase2)                     │
├─────────────────────────────────────────────────────────────────┤
│ 前端: onGenerateScheme(e)                                       │
│   → callFunction({ action:"startScheme", taskId, directionKey })│
│                                                                  │
│ startScheme:                                                    │
│   → 从 directions 集合验证方向存在                               │
│   → 检查是否已有 generating 状态的 scheme (防重复)               │
│   → 写入 special_issue_schemes:                                  │
│     { _id:schemeId, taskId, directionId, directionKey,          │
│       keyword, constraints, status:"generating",                │
│       progress:"phase2_searching",                              │
│       steps:[search_papers_2/running, fetch_authors_2/pending,  │
│              generate_plan/pending, parse_result_2/pending] }    │
│   → 更新 tasks.activeSchemeId                                   │
│   → fire-and-forget: invokeWorker → action:"runPhase2"          │
│   → 返回 { success:true, schemeId }                             │
│                                                                  │
│ 前端: 收到 schemeId → loadSchemeDetail(schemeId) 轮询           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Phase2 方案生成 (doPhase2Pipeline)                      │
├─────────────────────────────────────────────────────────────────┤
│ Step 5.1 - search_papers_2 (按方向关键词重搜)                    │
│   用 direction.searchKeywords 构建 searchQuery                   │
│   OpenAlex: searchWorks(searchQuery, perPage=20, relevance)     │
│   → sourcePapers[]                                              │
│                                                                  │
│ Step 5.2 - fetch_authors_2 (提取作者)                            │
│   从 sourcePapers 提取作者 ID → 去重                             │
│   OpenAlex: 批量 getAuthors(ids) → 去重 + 按 h-index 排序       │
│   只取 top 20 作者                                              │
│   → sourceAuthors[]                                             │
│                                                                  │
│ Step 5.3 - generate_plan (AI 生成方案)                           │
│   System: PHASE2_SYSTEM_PROMPT (期刊客编角色)                    │
│   User: 方向信息 + 论文数据 + 作者数据 + phase1Plans            │
│   要求返回 JSON:                                                 │
│   { plan: { zh:{title,abstract,keywords}, en:{...},              │
│       guestEditors:[{id,name,institution,h_index,...}],         │
│       topicHeat, sourceArticleIds, sourceEditorIds, ... } }     │
│                                                                  │
│ Step 5.4 - parse_result_2 (解析并持久化)                        │
│   extractJSON + validateSourceRefs                              │
│   → 更新 scheme 文档:                                            │
│     status:"completed", plan, sourcePapers, sourceAuthors,      │
│     phase1Plans, usage, completedAt                             │
│   → (不更新 task 表)                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: 方案详情展示                                            │
├─────────────────────────────────────────────────────────────────┤
│ 前端 loadSchemeDetail(schemeId) 轮询                            │
│   getSchemeStatus → 检测 status === "completed"                 │
│   getSchemeDetail → 获取完整 plan + sourcePapers + sourceAuthors│
│                                                                  │
│   前端渲染:                                                      │
│   - 方案标题/摘要/关键词 (中/英切换)                              │
│   - 推荐客编列表 (h-index, institution...)                       │
│   - 参考论文列表 (displayPapers)                                 │
│   - buildEditorCharts() 客编统计图表                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、每个集合的数据 Schema

### `special_issue_tasks`（任务主表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | `"task_" + timestamp + "_" + random6` |
| `_openid` | string | 用户标识 |
| `keyword` | string | 研究关键词 |
| `constraints` | string | 用户附加约束 |
| `status` | enum | `processing` → `awaiting_selection` → (`failed`) |
| `progress` | string | `searching` / `trending` / `awaiting_selection` |
| `steps` | array | `[{key,label,status,startedAt,completedAt}]` |
| `creditsDeducted` | bool | 是否已扣积分 |
| `creditsCost` | number | 消耗积分数 (30) |
| `phase1Usage` | object | LLM token 用量 |
| `activeSchemeId` | string | 当前活跃的 scheme._id |
| `regenerateCount` | number | 重新生成次数 |
| `regenerateHistory` | array | `[{directions,usage,completedAt,index}]` |
| `createdAt` | number | 时间戳 |
| `updatedAt` | number | 时间戳 |
| `completedAt` | number | 时间戳 |

### `special_issue_directions`（方向表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | `taskId + "_" + key`，如 `task_xxx_A` |
| `taskId` | string | 归属任务 |
| `_openid` | string | 用户标识 |
| `key` | string | AI 分配的 key，如 `"A"`, `"B"`, `"C"` |
| `zh` | object | `{title, abstract, keywords}` 中文方向信息 |
| `en` | object | `{title, abstract, keywords}` 英文方向信息 |
| `searchKeywords` | array | AI 推荐的搜索关键词，用于 Phase2 重搜 |
| `topicHeat` | number | 热度值 0-1000 |
| `avgCitations` | number | 平均引用量（代码层计算） |
| `avgFWCI` | number | 平均 FWCI |
| `topJournalRatio` | number | 顶刊比例 |
| `hotRecentAvg` | number | 近期热度均值 |
| `paperCount` | number | 关联论文数 |
| `sourceArticleIds` | array | 引用的论文 ID 列表 |
| `sourcePapers` | array | 引用的论文详情（从搜索数据匹配，约 5-20 篇） |
| `createdAt` | number | 时间戳 |

### `special_issue_schemes`（方案表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | `taskId + "_s_" + ts + "_" + random4` |
| `taskId` | string | 归属任务 |
| `directionId` | string | 外键 → directions._id |
| `directionKey` | string | 冗余，兼容 |
| `_openid` | string | 用户标识 |
| `keyword` | string | 关键词 |
| `constraints` | string | 约束 |
| `status` | enum | `generating` → `completed` / `failed` |
| `progress` | string | `phase2_searching` / `phase2_fetching` / `phase2_generating` |
| `steps` | array | 4 步 `[{key,label,status,...}]` |
| `plan` | object | `{zh:{title,abstract,keywords}, en:{...}, guestEditors:[...], topicHeat, sourceArticleIds, sourceEditorIds}` |
| `phase1Plans` | array | Phase1 方向列表快照 |
| `sourcePapers` | array | Phase2 搜索的论文 (≤20篇) |
| `sourceAuthors` | array | Phase2 提取的作者 (≤20位) |
| `usage` | object | LLM token 用量 |
| `error` | string | 失败原因 |
| `createdAt` | number | 时间戳 |
| `completedAt` | number | 时间戳 |
| `updatedAt` | number | 时间戳 |

---

## 四、关键 API Action 一览

| action | 输入 | 输出 | 说明 |
|--------|------|------|------|
| `(default)` | keyword, constraints | taskId | 创建任务 + 触发 Phase1 |
| `process` | taskId, keyword, constraints | — | Worker: 执行 doFullPipeline |
| `poll` | taskId | {status,progress,steps,error,...} | 轮询任务状态 |
| `list` | page, pageSize, keyword? | [{_id,keyword,status,firstTitle,...}] | 用户任务列表 |
| `getTrendDetail` | taskId | {directions[], schemesByDir, ...} | 获取方向 + 方案概览 |
| `startScheme` | taskId, directionKey | {schemeId} | 选择方向，创建 scheme + 触发 Phase2 |
| `runPhase2` | taskId, schemeId | — | Worker: 执行 doPhase2Pipeline |
| `getSchemeStatus` | schemeId | {status,progress,steps} | 轮询方案进度 |
| `getSchemeDetail` | schemeId | {plan,sourcePapers,sourceAuthors,...} | 获取方案详情 |
| `listSchemes` | taskId | [{schemeId,directionId,status,title,...}] | 某任务的所有方案 |
| `regenerate` | taskId | taskId | 重新搜索+AI 分析，覆盖方向 |
| `retry` | taskId, directionKey? | taskId | 断点重试 Phase1 或 Phase2 |

---

## 五、用户操作路径

```
首页 → 输入关键词 → [创建任务] → 等待60-90s
  → 方向选择面板 (3个方向卡片)
      ├── 点 [生成方案] → 等待30-60s → 方案详情
      │      ├── 查看客编推荐
      │      ├── 查看参考论文
      │      └── 回到方向面板，选另一个方向再生成方案
      │
      ├── 点 [重新生成方向] → 重新搜索+分析 → 新的3个方向
      │
      └── 点 [查看历史生成] → 选择历史方向结果
```

每个任务可以生成 **N 个方向 × N 个方案**（即每个方向都可以独立生成方案，互不干扰）。
