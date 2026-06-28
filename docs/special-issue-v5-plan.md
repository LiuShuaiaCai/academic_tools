# 特刊策划 V5 改造方案

> 状态：设计阶段 | 待实施
> 基于当前 V4 异步轮询架构升级

---

## 一、需求汇总

| # | 需求 | 现状 | 目标 |
|---|---|---|---|
| 1 | 语言切换 | 页面顶部有全局中/EN 切换 + 话题卡片内有切换 | **去掉顶部全局切换**，只保留话题卡片内的语言切换 |
| 2 | 搜索与创建 | 只有一个搜索输入框+搜索按钮 | 变成**搜索框+搜索按钮+创建话题按钮**；创建话题弹窗有大输入框，支持用户输入约束 |
| 3 | 话题列表 | 直接显示搜索结果，无列表 | 页面主体变为**任务列表**，显示关键词、进度、创建/完成时间、查看详情 |
| 4 | 积分系统 | 无积分扣费 | 创建话题**扣 30 积分**；点击创建时检查余额；**任务成功完成后才扣费**；弹窗提示 |
| 5 | 异步执行 | 已有 trigger+worker+poll 异步架构 | 保持并优化，查询论文/学者/LLM 已在 worker 中并行执行 |

---

## 二、架构变化（V4 → V5）

### 2.1 页面结构变化

```
V4（当前）
specialIssue/specialIssue  —— 单页：搜索框 → 直接显示结果

V5（目标）
specialIssue/specialIssue  —— 列表页：搜索框 + 创建按钮 + 任务列表
specialIssue/detail        —— 详情页：方案 Tab + 图表 + 客编 + 论文（原结果页内容）
```

### 2.2 数据流变化

```
V4：用户输入 → 触发云函数 → 前端轮询 → 直接渲染结果在当前页

V5：用户输入 → 弹窗确认 → 检查积分 → 创建任务 → 列表显示进度
                           ↓
                    Worker 后台执行 → 完成后扣积分
                           ↓
                    用户点击"查看详情" → 跳转 detail 页查看结果
```

---

## 三、数据模型变化

### 3.1 Task 集合字段（special_issue_tasks）

```js
{
  _id: 'si_1234567890_abcdef',
  _openid: 'oXXXXXXX',                 // 【新增】用户标识，用于查询个人任务列表

  keyword: 'Large Language Models',    // 研究关键词
  constraints: '请聚焦中国学者...',     // 【新增】用户输入的约束/限制

  status: 'processing' | 'completed' | 'failed',
  progress: 'searching' | 'fetching_authors' | 'generating' | 'completed',

  steps: [                             // 【新增】精细化进度步骤（首次创建有4步，重新生成仅 call_llm+parse_result 共2步）
    { key: 'search_papers',       label: '搜索论文数据',     status: 'completed', startedAt: 123456, completedAt: 123789 },
    { key: 'fetch_authors',       label: '提取论文作者并查询详情', status: 'completed', startedAt: 123789, completedAt: 124012 },
    { key: 'call_llm',            label: 'AI 生成策划方案',   status: 'running',   startedAt: 124012 },
    { key: 'parse_result',        label: '解析并保存结果',    status: 'pending' }
  ],

  // 【新增】最终传给 LLM 的原始数据（用于详情页展示来源文章和作者）
  sourcePapers: [
    {
      id: 'W123',
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani', '...'],
      citedByCount: 45000,
      pubYear: 2017,
      sourceUrl: 'https://openalex.org/works/W123'
    }
  ],
  sourceAuthors: [
    {
      id: 'A456',
      name: 'Ashish Vaswani',
      institution: 'Google Brain',
      hIndex: 85,
      citedByCount: 120000,
      worksByYear: { years: [...], counts: [...] },
      citationsByYear: { years: [...], counts: [...] }
    }
  ],

  result: null,        // 完成后写入 AI 返回的 JSON（单个方案，含 sourceArticleIds / sourceEditorIds）
  error: null,         // 失败时写入错误信息
  usage: null,         // LLM token 消耗

  // 【新增】重新生成相关
  regenerateCount: 0,          // 已重新生成次数
  regenerateHistory: [],       // 历史方案记录：每次重新生成时将旧 result 存档

  creditsDeducted: false,   // 【新增】积分是否已扣除
  creditsCost: 30,          // 【新增】消耗积分数（每次生成/重新生成均固定30）

  createdAt: Date.now(),
  updatedAt: Date.now(),/*  */
  completedAt: null         // 【新增】完成时间戳
}
```

> **说明**：`sourcePapers` 和 `sourceAuthors` 保存最终传给 LLM 的原始数据，详情页直接读取渲染来源文章和作者统计图表，无需再次调用 API。

### 3.2 步骤定义常量（4 步）

```js
var PIPELINE_STEPS = [
  { key: 'search_papers',        label: '搜索论文数据' },
  { key: 'fetch_authors',        label: '提取论文作者并查询详情' },
  { key: 'call_llm',             label: 'AI 生成策划方案' },
  { key: 'parse_result',         label: '解析并保存结果' }
];
```

> **说明**：论文搜索完成后，从论文 `authorships` 中提取所有作者，去重后通过 OpenAlex 批量接口 `GET /authors?filter=openalex_id:id1|id2|...` 一次性查询作者详情（含 `counts_by_year`），确保客编与论文有直接关联。

---

## 四、页面设计

### 4.1 列表页（specialIssue/specialIssue）

#### 顶部区域
- **搜索输入框**：输入关键词搜索已有话题列表（按关键词模糊匹配）
- **搜索按钮**：触发列表搜索
- **创建话题按钮**：点击打开创建弹窗

#### 创建话题弹窗
```
┌─────────────────────────────┐
│  📝 创建特刊策划话题          │
│                              │
│  研究关键词 *                │
│  ┌───────────────────────┐  │
│  │ Large Language Models │  │
│  └───────────────────────┘  │
│                              │
│  附加要求（可选）             │
│  ┌───────────────────────┐  │
│  │ 请聚焦中国学者研究成果  │  │
│  │ 客编至少包含2位女性学者 │  │
│  └───────────────────────┘  │
│                              │
│  💰 创建将消耗 30 积分       │
│  当前余额：128 积分          │
│                              │
│  [取消]      [确认创建(30积分)]│
└─────────────────────────────┘
```

#### 话题列表
每项卡片显示：
```
┌─────────────────────────────────────────────┐
│ 🔍 Large Language Models...        [已完成]  │
│ 进度：AI 生成策划方案 ████░░░░░░ 40%         │
│ 创建：2026-06-10 14:32                       │
│ 完成：--                                    │
│                              [查看详情] [进度]│
└─────────────────────────────────────────────┘
```

- **关键词**：默认显示 30 字符，超出用 `...`
- **进度**：点击"进度"按钮弹出详情，显示 4 个步骤的完成状态
- **状态标签**：processing（进行中）/ completed（已完成）/ failed（失败）
- **创建时间** / **完成时间**
- **查看详情**：点击进入 detail 页

#### 进度详情弹窗
```
┌─────────────────────────────┐
│  📊 任务执行进度             │
│                              │
│  ✅ 搜索论文数据（已完成）          │
│  ✅ 提取论文作者并查询详情（已完成）│
│  ⏳ AI 生成策划方案（未开始）       │
│  ⏳ 解析并保存结果（未开始）        │
│                              │
│  当前耗时：2分30秒            │
│  [关闭]                       │
└─────────────────────────────┘
```

### 4.2 详情页（specialIssue/detail）

接收参数：`taskId`，通过 taskId 查询数据库获取完整任务数据（`result` + `sourcePapers` + `sourceAuthors`）渲染。

#### 页面结构（从上到下）

```
┌─────────────────────────────────────────────┐
│ 🔍 关键词: Large Language Models    [中文/EN] │
│                                          补扣│
├─────────────────────────────────────────────┤
│ Topic Info                                  │
│   话题: xxxxxxxxxxxxx                       │
│   Topic Heat: 274                           │
│   Keywords: A, B, C, D                      │
│   Summary: ...                              │
├─────────────────────────────────────────────┤
│ 📄 Source Articles（来源文章）               │
│   ┌───────────────────────────────────────┐ │
│   │ 文章标题（蓝色可点击 → openAlex）       │ │
│   │ 发表日期: 2024-02-16   被引: 274       │ │
│   │ 来源: Signal Transduction...          │ │
│   │ Keywords: Gut-Brain axis              │ │
│   └───────────────────────────────────────┘ │
│   ...（每篇一个卡片，按被引量降序）          │
├─────────────────────────────────────────────┤
│ 👤 Recommend Guest Editors（推荐客编）       │
│   ┌───────────────────────────────────────┐ │
│   │ Georg Schett                          │ │
│   │ H-index: 147    Institution: ...      │ │
│   │                                       │ │
│   │  [逐年被引量/发文量柱状图]               │ │
│   │  Cited ████ Works ████               │ │
│   │  2025 2024 2023 2022 ...              │ │
│   └───────────────────────────────────────┘ │
│   ...（每个客编一个卡片）                    │
├─────────────────────────────────────────────┤
│ 🔄 重新生成      💰 消耗 30 积分              │
│                                              │
│ 已重新生成: 2 次    [查看历史]                │
└─────────────────────────────────────────────┘
```

#### 关键交互

- **语言切换**：保留话题卡片内的"中文/EN"切换（`content-lang-switch`），去掉顶部全局语言切换栏
- **文章标题可点击**：跳转到 OpenAlex 论文详情页
- **客编图表**：使用 `echarts-for-weixin` 或 Canvas 绘制逐年被引量/发文量柱状图（类似截图中的双柱图）
- **重新生成**：点击后**复用首次查询的 `sourcePapers` / `sourceAuthors`**，仅重新调用 LLM 生成新方案，消耗 30 积分。旧 result 存入 `regenerateHistory`，新 result 覆盖当前
- **查看历史**：弹窗展示历次生成的方案，用户可切换查看任一次结果

---

## 五、前端改动详情

### 5.1 列表页状态管理

```js
// specialIssue.js
data: {
  // 搜索
  keyword: '',

  // 列表
  taskList: [],
  loadingList: false,
  listPage: 0,
  listPageSize: 20,
  hasMore: true,

  // 创建弹窗
  showCreateModal: false,
  createKeyword: '',
  createConstraints: '',
  createLoading: false,

  // 进度弹窗
  showProgressModal: false,
  selectedTaskSteps: [],
  selectedTaskProgress: '',

  // 积分
  userCredits: 0,

  // 历史记录（保留，改为本地存储的快捷入口）
  history: []
}
```

### 5.2 生命周期

```js
onLoad: function() {
  // 加载 i18n
  // 加载用户积分
  // 加载任务列表（第一页）
  // 启动轮询定时器（检查进行中的任务进度）
}

onShow: function() {
  // 刷新列表（用户可能从详情页返回）
  // 刷新积分余额
}

onUnload: function() {
  // 清除轮询定时器
}
```

### 5.3 列表轮询机制

列表页需要自动刷新进行中的任务：

```js
// 每 5 秒刷新一次列表中 status === 'processing' 的任务
startListPolling: function() {
  var that = this;
  that._listPollTimer = setInterval(function() {
    var hasProcessing = that.data.taskList.some(function(t) { return t.status === 'processing'; });
    if (hasProcessing) {
      that.loadTaskList(false); // 静默刷新，不显示 loading
    }
  }, 5000);
}
```

### 5.4 积分检查流程

```js
onCreateTopicConfirm: function() {
  var that = this;
  var keyword = that.data.createKeyword.trim();
  if (!keyword) { wx.showToast({ title: '请输入关键词', icon: 'none' }); return; }

  // 1. 检查积分
  creditsUtil.getCreditsInfo().then(function(info) {
    var balance = info.balance || 0;
    if (balance < 30) {
      creditsUtil.showInsufficientDialog(balance, 30);
      return;
    }

    // 2. 确认弹窗（再次提示）
    wx.showModal({
      title: '确认创建',
      content: '创建「' + keyword + '」话题将消耗 30 积分\n当前余额：' + balance + ' 积分',
      confirmText: '确认创建',
      success: function(res) {
        if (res.confirm) {
          that.doCreateTopic(keyword, that.data.createConstraints);
        }
      }
    });
  });
}
```

### 5.5 详情页获取数据 + 重新生成

```js
// detail.js
onLoad: function(options) {
  var taskId = options.taskId;
  this.setData({ taskId: taskId });
  this.loadTaskDetail();
},

loadTaskDetail: function() {
  var that = this;
  wx.cloud.callFunction({
    name: 'specialIssueAgent',
    data: { action: 'poll', taskId: that.data.taskId }
  }).then(function(res) {
    var data = res.result.data;
    if (data.status === 'completed' && data.result) {
      that.setData({
        result: data.result,
        sourcePapers: data.sourcePapers || [],
        sourceAuthors: data.sourceAuthors || [],
        regenerateCount: data.regenerateCount || 0,
        hasResult: true
      });
      that.updateCharts();
    } else if (data.status === 'processing') {
      that.setData({ loading: true, progressText: '任务进行中...' });
      that.startPolling();
    } else {
      that.setData({ error: data.error || '任务失败' });
    }
  });
},

// 重新生成
onRegenerate: function() {
  var that = this;
  wx.showModal({
    title: '重新生成',
    content: '将消耗 30 积分重新生成策划方案，确认？',
    success: function(res) {
      if (res.confirm) {
        wx.showLoading({ title: '重新生成中...' });
        wx.cloud.callFunction({
          name: 'specialIssueAgent',
          data: { action: 'regenerate', taskId: that.data.taskId }
        }).then(function(res) {
          wx.hideLoading();
          if (res.result.success) {
            that.setData({ loading: true, progressText: '重新生成中...' });
            that.startPolling();
          } else {
            wx.showToast({ title: res.result.error, icon: 'none' });
          }
        });
      }
    }
  });
},

// 查看历史方案
onViewHistory: function() {
  // 拉取 regenerateHistory，弹窗展示历次方案摘要供切换
  var that = this;
  wx.cloud.callFunction({
    name: 'specialIssueAgent',
    data: { action: 'poll', taskId: that.data.taskId }
  }).then(function(res) {
    var history = res.result.data.regenerateHistory || [];
    if (history.length === 0) {
      wx.showToast({ title: '暂无历史记录', icon: 'none' });
      return;
    }
    var items = history.map(function(h) {
      var title = (h.result && h.result.plan && h.result.plan.zh && h.result.plan.zh.title) || ('方案 ' + h.index);
      return '第' + h.index + '次: ' + title;
    });
    wx.showActionSheet({
      itemList: items,
      success: function(actionRes) {
        var selected = history[actionRes.tapIndex];
        that.setData({
          result: selected.result,
          sourcePapers: res.result.data.sourcePapers,
          sourceAuthors: res.result.data.sourceAuthors,
          hasResult: true
        });
        that.updateCharts();
      }
    });
  });
}
```

---

## 六、云函数改动详情

### 6.1 specialIssueAgent 云函数

#### 新增 action: list（查询任务列表）

```js
if (event.action === 'list') {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var page = event.page || 0;
  var pageSize = event.pageSize || 20;

  var where = { _openid: openid };
  if (event.keyword) {
    where.keyword = db.RegExp({
      regexp: event.keyword,
      options: 'i'  // 忽略大小写
    });
  }

  var docs = await db.collection(TASK_COLLECTION)
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  // 脱敏：不返回完整的 result JSON（太大），只返回概要
  var list = docs.data.map(function(item) {
    return {
      _id: item._id,
      keyword: item.keyword,
      constraints: item.constraints,
      status: item.status,
      progress: item.progress,
      steps: item.steps,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      completedAt: item.completedAt,
      creditsDeducted: item.creditsDeducted,
      regenerateCount: item.regenerateCount || 0,
      // 概要信息（用于列表预览）
      firstTitle: item.result && item.result.plan ?
        (item.result.plan.zh && item.result.plan.zh.title) ||
        (item.result.plan.en && item.result.plan.en.title) || '' : ''
    };
  });

  return { success: true, list: list, page: page, pageSize: pageSize };
}
```

#### trigger 模式改造

```js
// 接收 constraints 参数
var constraints = (event.constraints || '').trim();

await db.collection(TASK_COLLECTION).add({
  data: {
    _id: taskId,
    _openid: cloud.getWXContext().OPENID,  // 新增
    keyword: keyword,
    constraints: constraints,               // 新增
    status: 'processing',
    progress: 'searching',
    steps: initSteps(),                     // 新增：初始化 4 个步骤为 pending
    creditsDeducted: false,                 // 新增
    creditsCost: 30,                        // 新增
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
});
```

#### regenerate 模式（重新生成）

> **核心设计**：重新生成**不重新搜索论文和作者**，直接从数据库读取首次保存的 `sourcePapers` / `sourceAuthors`，仅重新调用 LLM。跳过了 OpenAlex API 调用，速度快（仅 3~5 秒），且源数据一致确保方案可比性。

```js
// action === 'regenerate'
var taskId = event.taskId;

// 1. 查询当前任务，验证 sourcePapers / sourceAuthors 存在
var taskDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();
if (!taskDoc.data) return { success: false, error: '任务不存在' };
if (taskDoc.data.status === 'processing') return { success: false, error: '任务正在执行中' };
if (!taskDoc.data.sourcePapers || taskDoc.data.sourcePapers.length === 0) {
  return { success: false, error: '源数据缺失，无法重新生成' };
}

// 2. 检查积分
var creditsRes = await cloud.callFunction({ name: 'creditsAPI', data: { action: 'getCreditsInfo' } });
if ((creditsRes.result.balance || 0) < 30) {
  return { success: false, error: '积分不足', balance: creditsRes.result.balance };
}

// 3. 标记任务为重新生成中（步骤只有 LLM + 解析）
await db.collection(TASK_COLLECTION).doc(taskId).update({
  data: {
    status: 'processing',
    progress: 'generating',
    _regenerating: true,
    steps: [
      { key: 'call_llm',   label: 'AI 生成策划方案',  status: 'running',  startedAt: Date.now() },
      { key: 'parse_result', label: '解析并保存结果', status: 'pending' }
    ],
    creditsDeducted: false,
    updatedAt: Date.now()
  }
});

// 4. 触发精简 pipeline（仅 LLM + 解析，复用已有 sourcePapers / sourceAuthors）
await callSelfAsync({ action: 'regenerateProcess', taskId: taskId,
  keyword: taskDoc.data.keyword,
  constraints: taskDoc.data.constraints,
  sourcePapers: taskDoc.data.sourcePapers,
  sourceAuthors: taskDoc.data.sourceAuthors
});

return { success: true, taskId: taskId };
```

> **说明**：`regenerate` 走独立的 `doRegeneratePipeline`，与 `trigger` 的 `doFullPipeline` 分离。regen pipeline 仅包含 **调用 LLM** 和 **解析结果** 两步，跳过搜索论文和提取作者阶段。完成后同样检查 `_regenerating` 标记，将旧 result 存入 `regenerateHistory`。

#### Worker 改造（数据源：论文作者 + 批量查询 + 保存原始数据）

```js
async function doFullPipeline(keyword, constraints, taskId) {
  var steps = initSteps();

  // ===== Step 1: 搜索论文 =====
  await updateStepStatus(taskId, steps, 'search_papers', 'running');
  var worksRes = await callOpenAlex('searchWorks', {
    query: keyword,
    fromYear: 2021,
    perPage: 50,
    sort: 'cited_by_count:desc'
  });
  var rawPapers = worksRes.data.results || [];
  var sourcePapers = simplifyWorks(rawPapers);
  var totalPapers = worksRes.data.meta.count;
  await updateStepStatus(taskId, steps, 'search_papers', 'completed');

  // ===== Step 2: 从论文提取作者 → 批量查询作者详情 =====
  await updateStepStatus(taskId, steps, 'fetch_authors', 'running');

  // 2.1 提取所有作者 ID（去重）
  var authorIdSet = {};
  for (var i = 0; i < rawPapers.length; i++) {
    var authorships = rawPapers[i].authorships || [];
    for (var j = 0; j < authorships.length; j++) {
      var author = authorships[j].author;
      if (author && author.id) {
        authorIdSet[author.id] = true;
      }
    }
  }
  var authorIds = Object.keys(authorIdSet);

  // 2.2 批量查询作者详情（OpenAlex 支持 filter=openalex_id:id1|id2|...，每批最多 50 个）
  var BATCH_SIZE = 50;
  var sourceAuthors = [];
  for (var start = 0; start < authorIds.length; start += BATCH_SIZE) {
    var batchIds = authorIds.slice(start, start + BATCH_SIZE);
    var idFilter = batchIds.map(function(id) { return (id || '').split('/').pop(); }).join('|');
    var batchRes = await callOpenAlex('getAuthorsByIds', { ids: idFilter });
    var batchAuthors = simplifyAuthorsWithYearly(batchRes.data.results || []);
    sourceAuthors = sourceAuthors.concat(batchAuthors);
  }

  // 2.3 按 h-index 排序取前 20（传给 LLM 的候选客编池）
  sourceAuthors.sort(function(a, b) { return b.h - a.h; });
  var llmAuthors = sourceAuthors.slice(0, 20);

  await updateStepStatus(taskId, steps, 'fetch_authors', 'completed');

  // ===== Step 3: 调用 LLM =====
  await updateTaskProgress(taskId, 'generating');
  await updateStepStatus(taskId, steps, 'call_llm', 'running');
  var userMsg = buildUserMessage(keyword, sourcePapers, llmAuthors, totalPapers, authorIds.length, constraints);
  // ... 调用 LLM ...
  await updateStepStatus(taskId, steps, 'call_llm', 'completed');

  // ===== Step 4: 解析结果 =====
  await updateStepStatus(taskId, steps, 'parse_result', 'running');
  var json = extractJSON(llm.content);
  // 校验：确保每个 plan 都有 sourceArticleIds 和 sourceEditorIds
  validateSourceRefs(json, sourcePapers, llmAuthors);
  await updateStepStatus(taskId, steps, 'parse_result', 'completed');

  // ===== 写入结果 + 保存原始数据 + 扣除积分 =====
  var completedAt = Date.now();
  var deductResult = await deductCredits(taskId, 30);

  // 查询当前文档，如果是重新生成则先存档旧结果
  var currentDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();
  var updateData = {
    status: 'completed',
    result: json,
    sourcePapers: sourcePapers,
    sourceAuthors: sourceAuthors,
    usage: llm.usage,
    progress: 'completed',
    steps: steps,
    creditsDeducted: deductResult.success,
    completedAt: completedAt,
    updatedAt: completedAt
  };

  // 重新生成：存档旧方案
  var isRegenerate = currentDoc.data && currentDoc.data._regenerating;
  if (isRegenerate && currentDoc.data.result) {
    var history = currentDoc.data.regenerateHistory || [];
    history.push({
      result: currentDoc.data.result,
      usage: currentDoc.data.usage,
      completedAt: currentDoc.data.completedAt,
      index: history.length + 1
    });
    updateData.regenerateCount = (currentDoc.data.regenerateCount || 0) + 1;
    updateData.regenerateHistory = history;
  }

  await db.collection(TASK_COLLECTION).doc(taskId).update({ data: updateData });
}
```

#### 新增：`doRegeneratePipeline`（重新生成专用，仅 LLM）

```js
async function doRegeneratePipeline(keyword, constraints, taskId, sourcePapers, sourceAuthors) {
  var steps = [
    { key: 'call_llm',   label: 'AI 生成策划方案',  status: 'running',  startedAt: Date.now() },
    { key: 'parse_result', label: '解析并保存结果', status: 'pending' }
  ];

  // ===== Step 1: 调用 LLM（复用首次查询的 sourcePapers / sourceAuthors）=====
  await updateTaskProgress(taskId, 'generating');

  // 生成传给 LLM 的候选客编池（从 sourceAuthors 取 h-index 前 20）
  var llmAuthors = sourceAuthors.slice(0, 20);

  var userMsg = buildUserMessage(keyword, sourcePapers, llmAuthors, sourcePapers.length, sourceAuthors.length, constraints);
  var llm = await callKimi(userMsg);
  await updateStepStatus(taskId, steps, 'call_llm', 'completed');

  // ===== Step 2: 解析结果 =====
  await updateStepStatus(taskId, steps, 'parse_result', 'running');
  var json = extractJSON(llm.content);
  validateSourceRefs(json, sourcePapers, llmAuthors);
  await updateStepStatus(taskId, steps, 'parse_result', 'completed');

  // ===== 写入结果 + 扣除积分（不需要重复写入 sourcePapers/sourceAuthors）=====
  var completedAt = Date.now();
  var deductResult = await deductCredits(taskId, 30);
  var currentDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();

  var updateData = {
    status: 'completed',
    result: json,
    usage: llm.usage,
    progress: 'completed',
    steps: steps,
    creditsDeducted: deductResult.success,
    completedAt: completedAt,
    updatedAt: completedAt
  };

  // 存档旧方案
  if (currentDoc.data && currentDoc.data.result) {
    var history = currentDoc.data.regenerateHistory || [];
    history.push({
      result: currentDoc.data.result,
      usage: currentDoc.data.usage,
      completedAt: currentDoc.data.completedAt,
      index: history.length + 1
    });
    updateData.regenerateCount = (currentDoc.data.regenerateCount || 0) + 1;
    updateData.regenerateHistory = history;
  }

  await db.collection(TASK_COLLECTION).doc(taskId).update({ data: updateData });
}
```

> **对比**：`doFullPipeline` 调用 3~5 次 API（searchWorks + getAuthorsByIds×1~3 + LLM），`doRegeneratePipeline` 仅调用 **1 次 LLM**，速度从 10~20 秒降至 3~5 秒。

#### 新增：批量查询作者接口

```js
} else if (action === 'getAuthorsByIds') {
  // OpenAlex 批量查询：GET /authors?filter=openalex_id:W2741808907|W123|...
  var ids = params.ids || '';
  url = 'https://api.openalex.org/authors?filter=openalex_id:' + encodeURIComponent(ids) + '&per-page=50';
}
```

#### `simplifyWorks` 保留（已有）

```js
function simplifyWorks(rawWorks) {
  if (!Array.isArray(rawWorks)) return [];
  return rawWorks.map(function(w) {
    return {
      id: (w.id || '').split('/').pop(),
      title: w.display_name || '',
      authors: (w.authorships || []).map(function(a) {
        return (a.author && a.author.display_name) || '';
      }).filter(Boolean),
      cc: w.cited_by_count || 0,
      year: w.publication_year || 0,
      url: w.id || ''
    };
  });
}
```

#### `simplifyAuthorsWithYearly`（从批量接口结果提取）

```js
function simplifyAuthorsWithYearly(rawAuthors) {
  if (!Array.isArray(rawAuthors)) return [];
  return rawAuthors.map(function(a) {
    var cby = a.counts_by_year || [];
    var years = [], worksByYear = [], citationsByYear = [];
    for (var i = 0; i < cby.length; i++) {
      years.push(cby[i].year);
      worksByYear.push(cby[i].works_count || 0);
      citationsByYear.push(cby[i].cited_by_count || 0);
    }
    return {
      id: (a.id || '').split('/').pop(),
      n: a.display_name || '',
      inst: (a.last_known_institution && a.last_known_institution.display_name) || '',
      wc: a.works_count || 0,
      cc: a.cited_by_count || 0,
      h: (a.summary_stats && a.summary_stats.h_index) || 0,
      i10: (a.summary_stats && a.summary_stats.i10_index) || 0,
      top: (a.topics || []).slice(0, 3).map(function(t) { return t.display_name || ''; }),
      worksByYear: { years: years, counts: worksByYear },
      citationsByYear: { years: years, counts: citationsByYear }
    };
  });
}
```

#### `validateSourceRefs`：校验 LLM 返回的引用关系

```js
function validateSourceRefs(json, sourcePapers, sourceAuthors) {
  if (!json || !json.plan) return;
  var plan = json.plan;
  var validPaperIds = {};
  var validAuthorIds = {};
  for (var i = 0; i < sourcePapers.length; i++) validPaperIds[sourcePapers[i].id] = true;
  for (var i = 0; i < sourceAuthors.length; i++) validAuthorIds[sourceAuthors[i].id] = true;

  plan.sourceArticleIds = (plan.sourceArticleIds || []).filter(function(id) { return validPaperIds[id]; });
  plan.sourceEditorIds  = (plan.sourceEditorIds  || []).filter(function(id) { return validAuthorIds[id]; });
}
```

#### 积分扣费辅助函数

```js
async function deductCredits(taskId, points) {
  try {
    var res = await cloud.callFunction({
      name: 'creditsAPI',
      data: {
        action: 'spendCredits',
        actionType: 'special_issue',
        points: points,
        description: '特刊策划 -' + points,
        relatedId: taskId
      }
    });
    return { success: res.result && res.result.success, result: res.result };
  } catch (e) {
    console.error('[Worker] 积分扣费失败:', e);
    return { success: false, error: e.message };
  }
}
```

#### LLM Prompt 改造：要求返回引用关系

```js
function buildUserMessage(keyword, papers, authors, totalPapers, totalAuthors, constraints) {
  var msg = '';
  msg += '# 任务\n基于以下研究关键词的论文数据和作者数据，生成 1 个特刊策划方案。要求分析深入、建议具体，充分利用提供的论文和作者数据。\n\n';
  msg += '# 关键词\n' + keyword + '\n\n';
  msg += '# 论文数据（共 ' + totalPapers + ' 篇，展示前 ' + papers.length + ' 篇）\n' + JSON.stringify(papers, null, 2) + '\n\n';
  msg += '# 作者数据（共 ' + totalAuthors + ' 位，展示 h-index 前 ' + authors.length + ' 位）\n' + JSON.stringify(authors, null, 2) + '\n\n';

  if (constraints) {
    msg += '# 用户附加要求（必须严格遵守）\n' + constraints + '\n\n';
  }

  msg += '# 输出格式要求\n';
  msg += '请返回 JSON 格式，包含一个 plan 对象，字段如下：\n';
  msg += '- zh/en: 中英文标题、摘要、关键词\n';
  msg += '- guestEditors: 推荐客编数组（含 name, institution），每方案 3-5 位\n';
  msg += '- topicHeat: 话题热度评估（数字）\n';
  msg += '- **sourceArticleIds**: 该话题依据的论文 ID 数组（必须从提供的论文数据中选取）\n';
  msg += '- **sourceEditorIds**: 该话题推荐客编对应的作者 ID 数组（必须从提供的作者数据中选取）\n';
  msg += '\n注意：sourceArticleIds 和 sourceEditorIds 中的 ID 必须真实存在于输入数据中，禁止编造。';

  return msg;
}
```

System Prompt 补充：
```
1. 所有数据必须源自提供的真实论文和作者数据，禁止编造任何论文、作者或机构信息。
2. sourceArticleIds 必须是从输入论文中选取的真实 ID，sourceEditorIds 同理。
3. 如果用户提供了附加要求，请在生成方案时严格遵守，并将其融入话题描述、客编推荐等各个环节。
4. 每次生成独立判断，不参考已有方案（用户可能多次重新生成，需要多样化的结果）。
```

#### LLM 返回 JSON 格式示例

```json
{
  "plan": {
    "zh": {
      "title": "大语言模型在医学文本挖掘中的应用",
      "abstract": "...",
      "keywords": ["大语言模型", "医学文本挖掘", "自然语言处理"]
    },
    "en": {
      "title": "Large Language Models in Medical Text Mining",
      "abstract": "...",
      "keywords": ["Large Language Models", "Medical Text Mining", "NLP"]
    },
    "guestEditors": [
      { "name": "...", "institution": "..." },
      { "name": "...", "institution": "..." }
    ],
    "topicHeat": 274,
    "sourceArticleIds": ["W123", "W456", "W789"],
    "sourceEditorIds": ["A111", "A222"]
  }
}
```

### 6.2 creditsAPI 云函数

#### 新增积分规则

```js
var CREDITS_RULES = {
  // ... 现有规则 ...
  special_issue: 30    // 【新增】特刊策划
};

var ACTION_LABELS = {
  // ... 现有标签 ...
  special_issue: '特刊策划'  // 【新增】
};
```

#### 支持自定义 points 参数

creditsAPI 的 `spendCredits` 已经支持通过 `event.points` 覆盖默认值，所以无需改动扣费逻辑，只需新增规则即可。

---

## 七、积分流程设计

### 7.1 完整时序图

```
用户                        前端（列表页）              specialIssueAgent        creditsAPI
 │                              │                         │                      │
 │  点击"创建话题"               │                         │                      │
 │ ───────────────────────────> │                         │                      │
 │                              │                         │                      │
 │                              │  打开弹窗                │                      │
 │                              │  输入关键词+约束          │                      │
 │                              │                         │                      │
 │  点击"确认创建(30积分)"       │                         │                      │
 │ ───────────────────────────> │                         │                      │
 │                              │                         │                      │
 │                              │  getCreditsInfo()       │                      │
 │                              │ ───────────────────────>│                      │
 │                              │ <───────────────────────│  balance             │
 │                              │                         │                      │
 │                              │  balance < 30 ?         │                      │
 │                              │  ├─ 是 → 显示积分不足弹窗 │                     │
 │                              │  └─ 否 → 继续            │                      │
 │                              │                         │                      │
 │                              │  callFunction           │                      │
 │                              │  action=trigger         │                      │
 │                              │  keyword+constraints    │                      │
 │                              │ ───────────────────────>│                      │
 │                              │                         │                      │
 │                              │  <──────────────────────│  {success, taskId}   │
 │                              │                         │                      │
 │                              │  列表添加新任务条目       │                      │
 │                              │  启动轮询                │                      │
 │                              │                         │                      │
 │                              │                         │  触发 worker         │
 │                              │                         │  action=process      │
 │                              │                         │  ┌──────────────────┐│
 │                              │                         │  │ Step1 搜索论文    ││
 │                              │                         │  │ Step2 提取论文作者││  ← 批量查询详情
 │                              │                         │  │       并查询详情  ││
 │                              │                         │  │ Step3 调用LLM    ││
 │                              │                         │  │ Step4 解析保存    ││
 │                              │                         │  └──────────────────┘│
 │                              │                         │                      │
 │                              │  <──── 每5秒轮询 ────────│  status/progress     │
 │                              │                         │                      │
 │                              │                         │  成功完成后：        │
 │                              │                         │  call creditsAPI     │
 │                              │                         │  spendCredits        │
 │                              │                         │ ────────────────────>│
 │                              │                         │                      │
 │                              │                         │ <────────────────────│  {success}
 │                              │                         │                      │
 │                              │                         │  更新 task           │
 │                              │                         │  creditsDeducted=true│
 │                              │                         │                      │
 │                              │  <──── 轮询到 completed ─│                      │
 │                              │                         │                      │
│  点击"查看详情"               │                         │                      │
│ ───────────────────────────> │                         │                      │
│                              │  navigateTo detail      │                      │
│                              │  taskId=xxx             │                      │
│                              │                         │                      │
│  ── 重新生成（可选） ────────────────────────────────────────────────────────────── │
│                              │                         │                      │
│  详情页点击"重新生成"          │                         │                      │
│ ───────────────────────────> │                         │                      │
│                              │  callFunction           │                      │
│                              │  action=regenerate      │                      │
│                              │ ───────────────────────>│                      │
│                              │                         │                      │
│                              │                         │  检查积分 + 读取       │
│                              │                         │  sourcePapers/        │
│                              │                         │  sourceAuthors        │
│                              │                         │                      │
│                              │                         │  action=regenProcess  │
│                              │                         │  ┌──────────────────┐ │
│                              │                         │  │ Step1 仅调用LLM  │ │  ← 跳过搜索论文/作者
│                              │                         │  │ Step2 解析保存    │ │
│                              │                         │  └──────────────────┘ │
│                              │                         │                      │
│                              │  <──── 轮询到 completed ─│                      │
│                              │                         │                      │
│                              │  刷新详情页新方案         │                      │
```

### 7.2 边界情况处理

| 场景 | 处理方案 |
|---|---|
| 用户余额足够，但创建后、完成前消费了积分导致余额不足 | Worker 调用 creditsAPI 时会返回 `insufficient: true`，任务仍标记为 completed，但 `creditsDeducted: false`，前端显示"积分扣费失败，请补扣"按钮 |
| Worker 执行失败 | 不扣积分，status=failed，前端显示失败原因 |
| 用户关闭小程序后任务完成 | Worker 自主执行完扣积分，用户下次打开列表页看到已完成状态 |
| 重复点击创建 | 前端 `createLoading` 状态锁，避免重复提交 |
| 同一关键词重复创建 | 允许，每次创建都是独立任务 |
| 重新生成时积分不足 | `regenerate` action 先检查余额，不足时返回错误，不进入 pipeline |
| 重新生成时任务仍在执行 | `regenerate` action 检查 `status === 'processing'`，拒绝并发 |
| 重新生成后查看历史 | 旧方案在 `regenerateHistory`，前端通过 actionSheet 切换查看任一次结果 |
| 重新生成时 sourcePapers 缺失 | `regenerate` action 检查 `sourcePapers` 是否为空，为空返回"源数据缺失"错误 |

---

## 八、异步执行 & API 优化

### 8.1 执行架构

当前 V4 架构已经是完全异步的：

| 环节 | 当前实现 | 是否异步 |
|---|---|---|
| 前端触发任务 | `trigger` 立即返回 taskId（<1秒） | ✅ 异步 |
| 搜索论文 | `searchWorks` | ✅ 后台执行 |
| 提取论文作者 + 批量查询详情 | 串行（依赖论文数据） | ✅ 后台执行 |
| 调用 LLM | 串行（依赖作者数据） | ✅ 后台执行 |
| 前端获取结果 | `setInterval` 每5秒轮询 | ✅ 非阻塞 |

**V5 只需保持此架构，无需额外改造。**

优化点：列表页轮询间隔从 3 秒改为 5 秒（降低请求频率），且只在有 processing 任务时轮询。

### 8.2 API 调用统计

#### 首次创建

| 环节 | 调用次数 | 说明 |
|---|---|---|
| searchWorks | 1 次 | 搜索 50 篇论文 |
| getAuthorsByIds（批量） | 1~3 次 | 从论文提取作者后，用 `filter=openalex_id:id1\|id2\|...` 批量查询，每批最多 50 个 ID |
| Kimi LLM | 1 次 | 生成策划方案 |
| **总计** | **3~5 次** | 取决于论文作者去重后的数量 |

> 举例：50 篇论文约 100~150 位作者 → 分 3 批批量查询 → 共 5 次 API 调用。

#### 重新生成

| 环节 | 调用次数 | 说明 |
|---|---|---|
| Kimi LLM | **1 次** | 复用 DB 中的 `sourcePapers` / `sourceAuthors`，直接生成新方案 |
| **总计** | **1 次** | 无需搜索论文和查询作者，速度快 5~10 倍 |

> 重新生成直接读取数据库中保存的原始数据（`sourcePapers`、`sourceAuthors`），跳过所有 OpenAlex API 调用，仅 3~5 秒完成。

---

## 九、国际化调整

### 9.1 去掉顶部全局语言切换

删除 `specialIssue.wxml` 中的：
```xml
<!-- 删除这段 -->
<view class="lang-bar">
  <view class="lang-toggle" bindtap="toggleLang">...</view>
</view>
```

删除 `specialIssue.js` 中的 `toggleLang` 方法（或移动到 detail.js 中）。

### 9.2 保留话题卡片内的语言切换

在 `detail.wxml` 中保留：
```xml
<text class="content-lang-switch" bindtap="toggleContentLang">
  {{displayLang === 'zh' ? 'EN' : '中文'}}
</text>
```

### 9.3 新增文案 Key

```js
// locales/zh.js
specialIssue: {
  // ... 现有 ...
  createTopic: '创建话题',
  createTopicTitle: '创建特刊策划话题',
  keywordLabel: '研究关键词',
  constraintsLabel: '附加要求（可选）',
  constraintsPlaceholder: '例如：请聚焦中国学者；客编至少包含2位女性学者...',
  creditCostHint: '创建将消耗 {cost} 积分',
  currentBalance: '当前余额：{balance} 积分',
  confirmCreate: '确认创建',
  createSuccess: '任务创建成功',
  progressDetail: '执行进度',
  stepPending: '未开始',
  stepRunning: '进行中',
  stepCompleted: '已完成',
  createdAt: '创建时间',
  completedAt: '完成时间',
  viewDetail: '查看详情',
  taskStatus_processing: '进行中',
  taskStatus_completed: '已完成',
  taskStatus_failed: '失败',
  deductFailed: '积分扣费失败',
  retryDeduct: '补扣积分',
  noTasks: '暂无话题，点击"创建话题"开始',
  searchTasks: '搜索话题',
  regenerate: '重新生成',
  regenerateHint: '消耗 30 积分重新生成策划方案',
  regenerateCount: '已重新生成 {count} 次',
  viewHistory: '查看历史',
  noHistory: '暂无历史记录',
  sourceArticles: '来源文章',
  guestEditors: '推荐客编',
  topicInfo: '话题信息',
  topicHeat: '话题热度',
}
```

---

## 十、实施顺序

建议按以下顺序实施，每步可独立测试：

### Phase 1：数据层 + 云函数（后端先行）
1. **修改 creditsAPI**：新增 `special_issue: 30` 规则
2. **修改 specialIssueAgent**：
   - 新增 `_openid`、 `constraints`、 `steps`、 `completedAt`、 `creditsDeducted` 字段
   - 改造 `doFullPipeline`：改为从论文提取作者 → 批量查询详情 → 保存 `sourcePapers` + `sourceAuthors`
   - 新增 `getAuthorsByIds` 批量查询接口
   - 新增 `validateSourceRefs` 校验 LLM 返回的引用关系
   - 新增 `action=list` 接口
   - 新增 `deductCredits` 辅助函数，worker 成功后扣费
   - `buildUserMessage` 注入 constraints，要求 LLM 返回 `sourceArticleIds` 和 `sourceEditorIds`
3. 部署并测试云函数

### Phase 2：新建详情页
4. 新建 `pages/specialIssue/detail/detail.{js,wxml,wxss,json}`
5. 把当前 `specialIssue.wxml` 中的结果展示部分搬过去
6. 保留 `content-lang-switch`，去掉顶部 `lang-bar`
7. 通过 `taskId` 查询数据库获取 result
8. 在 `app.json` 中注册新页面路由

### Phase 3：改造列表页
9. 改造 `specialIssue.wxml`：
   - 删除顶部语言切换栏
   - 搜索区域改成"搜索框+搜索按钮+创建话题按钮"
   - 主体改成话题列表
   - 添加创建话题弹窗
   - 添加进度详情弹窗
10. 改造 `specialIssue.js`：
    - 新增列表加载、轮询、创建、积分检查逻辑
    - 删除直接调用 `chatBot.planSpecialIssue` 的旧逻辑
11. 改造 `specialIssue.wxss`：列表项样式、弹窗样式
12. 更新 `app.json` 中 specialIssue 的导航标题

### Phase 4：联调测试
13. 完整流程测试：创建 → 轮询 → 扣费 → 查看详情
14. 边界测试：积分不足、Worker 失败、网络中断恢复
15. 性能测试：列表分页、轮询频率

---

## 十一、技术风险与应对

| 风险 | 可能性 | 应对方案 |
|---|---|---|
| Worker 超时（>900s） | 低 | 已设置 900s 超时，moonshot-v1-32k 生成通常 2-5 分钟，留足余量 |
| 积分扣费失败但任务已完成 | 中 | 标记 `creditsDeducted: false`，前端提供补扣按钮 |
| 列表数据量大导致查询慢 | 低 | 按 `_openid` 分片 + `createdAt` 索引 + 分页 |
| 约束输入被 LLM 忽略 | 中 | System Prompt 中强调"必须严格遵守用户附加要求" |
| LLM 编造 sourceArticleIds / sourceEditorIds | 中 | `validateSourceRefs` 函数过滤掉不在 sourcePapers / sourceAuthors 中的 ID |
| 论文作者数量过多导致批量查询慢 | 低 | 50 篇论文通常 100~150 位作者，分 3 批查询，OpenAlex 批量接口性能良好 |
| 并发创建多个任务 | 低 | 前端 loading 锁 + 后端自然支持并发 |

---

## 附录：文件变更清单

### 修改文件
| 文件 | 改动内容 |
|---|---|
| `cloudfunctions/creditsAPI/index.js` | 新增 `special_issue` 积分规则 |
| `cloudfunctions/specialIssueAgent/index.js` | 数据模型升级、步骤追踪、积分扣费、list 接口、constraints 注入、**数据源改为论文作者提取+批量查询**、**保存 sourcePapers/sourceAuthors**、**LLM 返回 sourceArticleIds/sourceEditorIds** |
| `miniprogram/pages/specialIssue/specialIssue.js` | 改造为列表页逻辑 |
| `miniprogram/pages/specialIssue/specialIssue.wxml` | 列表页结构 |
| `miniprogram/pages/specialIssue/specialIssue.wxss` | 列表页样式 |
| `miniprogram/app.json` | 注册 detail 页面路由 |
| `miniprogram/utils/locales/zh.js` | 新增文案 |
| `miniprogram/utils/locales/en.js` | 新增文案 |

### 新增文件
| 文件 | 说明 |
|---|---|
| `miniprogram/pages/specialIssue/detail/detail.js` | 详情页逻辑 |
| `miniprogram/pages/specialIssue/detail/detail.wxml` | 详情页结构（从当前 specialIssue 提取） |
| `miniprogram/pages/specialIssue/detail/detail.wxss` | 详情页样式 |
| `miniprogram/pages/specialIssue/detail/detail.json` | 详情页配置 |
