# Special Issue V6 重构方案

## 一、现状问题

### 1. 数据库单文档过大
- `special_issue_tasks` 一个文档包含：Phase1 方向数据 + Phase2 论文 + Phase2 作者 + Phase2 方案 + 步骤状态
- **Phase2 覆盖 Phase1 的 sourcePapers/sourceAuthors**，丢失原始趋势分析数据
- 单文档字段过多（30+ 字段），查询冗余

### 2. 流程不合理
- 当前：列表页直接显示方向卡片，点击"选择"进入详情 → 直接生成方案
- 用户无法对比多个方向的趋势详情后再决定
- 一个任务只能生成**一个方案**（选择方向后覆盖）

### 3. 按钮状态不清晰
- 没有明确的：未生成 → 进行中 → 已完成/失败 状态流转
- 不支持异步轮询

---

## 二、新流程设计

```
┌─────────────┐     点击      ┌──────────────────┐     选择方向      ┌─────────────────┐
│   列表页     │ ───────────→ │  趋势分析详情页    │ ─────────────→ │  方案生成页/弹窗  │
│ (任务列表)   │              │ (展示3个方向+图表) │                │ (可生成多个方案)  │
└─────────────┘              └──────────────────┘                └─────────────────┘
                                     ↓                                    ↓
                              可查看每个方向                         点击每个方案→详情
                              的详细论文/关键词                      （客编/摘要等）
```

### 页面职责划分

| 页面 | 路径 | 展示内容 |
|------|------|---------|
| 列表页 | `/pages/specialIssue/specialIssue` | 任务卡片列表：关键词、状态、创建时间 |
| 趋势分析页 | `/pages/specialIssue/trend/trend` | Phase1 结果：3 个方向卡片 + 论文引用趋势图 |
| 方案列表+生成 | 在趋势分析页内或独立页面 | 该方向下已生成的多个方案；按钮触发新方案 |
| 方案详情页 | `/pages/specialIssue/detail/detail` | 单个方案的完整信息：摘要、客编、论文依据 |

---

## 三、数据库重构（核心）

### 新集合结构

```
special_issue_tasks          ← 任务主表（轻量）
  ├── _id, _openid, keyword, constraints
  ├── status: pending | phase1_running | awaiting_selection | completed | failed
  ├── progress, steps
  ├── createdAt, updatedAt
  └── creditsDeducted, creditsCost, regenerateCount

special_issue_directions     ← 方向表（每方向一条记录）
  ├── _id (auto), taskId (关联)
  ├── key: "d1", "d2", "d3"
  ├── zh/en: { title, abstract, keywords }
  ├── searchKeywords: []
  ├── topicHeat, avgCitations, avgFWCI, paperCount
  ├── sourceArticleIds: []
  └── createdAt

special_issue_schemes        ← 方案表（每方案一条记录，支持多个）
  ├── _id (auto), taskId, directionKey (关联)
  ├── zh/en: { title(细分), abstract, keywords }
  ├── guestEditors: [{ name, institution, id, hIndex, ... }]
  ├── topicHeat, sourceArticleIds, sourceEditorIds
  ├── status: generating | completed | failed
  ├── steps: [Phase2步骤]
  ├── sourcePapers: [...]        ← 不再覆盖，独立存储
  ├── sourceAuthors: [...]
  ├── usage, error
  ├── createdAt, completedAt, updatedAt
```

### 数据关系

```
tasks (1)
  ├── directions (1~3)
  │     └── schemes (0~N)   ← 一个方向可以生成多个方案
  └── schemes (0~N)         ← 也可以直接关联到 task
```

### 关键改进

1. **不再覆盖**：sourcePapers/sourceAuthors 存在 scheme 文档中，每次生成新方案新建文档
2. **多方案支持**：同一 directionKey 下可以有 N 个 scheme 文档
3. **任务主表轻量化**：只存元数据和状态，不做大数据存储

---

## 四、按钮状态机

每个方向的方案操作按钮：

```
                    ┌──────────────┐
                    │  生成方案     │  status=无scheme 或 手动触发
                    └──────┬───────┘
                           │ 点击 / 自动开始
                           ▼
                    ┌──────────────┐
              ┌────▶│  ● 进行中     │◀──────┐
              │     │  进度: 3/4   │       │
              │     └──────┬───────┘       │
              │            │ 完成           │ 失败
              │            ▼               │
              │     ┌──────────────┐       │
              │     │  查看方案     │       │
              │     │  (+生成新方案) │───────┘
              │     └──────────────┘       │
              │                            │
              └──────────── 重新生成 ◄──────┘
                    
                    ┌──────────────┐
                    │  重新生成     │  失败状态或用户主动重新生成
                    └──────────────┘
```

### 状态定义

| 状态值 | 按钮文案 | 行为 |
|--------|---------|------|
| 无 scheme 或 idle | **生成方案** (消耗 30 积分) | 调用云函数启动 Phase2 |
| generating | **进度条** (搜索论文... AI 分析中...) | 禁用点击，前端轮询 |
| completed | **查看方案** / **+ 生成新方案** | 查看已有 / 触发新 scheme |
| failed | **重新生成** (重试) | 重新调用 Phase2 |

---

## 五、API 接口变更

### 云函数 specialIssueAgent action 变更

| 原有 action | 变更 |
|-------------|------|
| `create` | 保持不变，只写 tasks 集合 |
| `list` | 返回任务列表 + 每任务的 scheme_count |
| ~~`selectDirection`~~ | **拆分为 `startScheme(directionKey)`** — 创建 scheme 文档并返回 schemeId |
| ~~`getStatus`~~ | **改为 `getSchemeStatus(schemeId)`** — 查询单个方案进度 |
| ~~`getDetail`~~ | **改为 `getSchemeDetail(schemeId)`** — 获取单个方案完整数据 |
| **新增** `listSchemes(taskId)` | 获取某任务下的所有方案 |
| **新增** `getTrendDetail(taskId)` | 获取趋势分析详情（directions + 图表数据） |

### 前端轮询机制

```
startScheme(directionKey) → 返回 { schemeId, status: 'generating' }
                          ↓ 每 3s 轮询
getSchemeStatus(schemeId) → { status: 'completed' | steps: [...] }
                          ↓ 完成时
getSchemeDetail(schemeId) → 完整方案数据
```

---

## 六、实施步骤

### Step 1：数据库迁移层（后端）
1. 新增 `special_issue_directions` 和 `special_issue_schemes` 集合的 CRUD 操作
2. 改造 Phase1 写入逻辑：完成后同时写入 directions 表
3. 改造 Phase2 写入逻辑：结果写入 schemes 表（而非覆盖 tasks）
4. 兼容旧数据：读取时兼容旧的嵌套格式

### Step 2：云函数接口改造
1. 新增 `startScheme`、`listSchemes`、`getTrendDetail` 等 action
2. `selectDirection` 废弃但保留兼容
3. 每个 scheme 有独立的 steps 数组和 status

### Step 3：前端列表页改造
- 精简为任务卡片：关键词 + 状态标签 + 时间
- 点击进入趋势分析页（非当前的方向卡片页）

### Step 4：趋势分析页（新建/改造）
- 展示该任务 3 个方向的热度/关键词/论文数
- 每个方向下方显示：
  - 已生成的方案数量
  - 操作按钮（根据上述状态机）

### Step 5：方案详情页改造
- 接收 schemeId 参数
- 从 schemes 表读取完整数据
- 展示客编详情（含 countsByYear 图表、affiliations 时间线）

### Step 6：按钮 + 轮询
- 实现状态机 UI
- 添加 setInterval 轮询（3s 间隔，最多 60 次 = 3 分钟超时）

---

## 七、非目标范围

- ~~历史数据自动迁移~~ → 采用**读写兼容**策略：新代码优先读新表，回退读旧格式
- ~~方案编辑功能~~ → 后续迭代
- ~~方案对比/评分~~ → 后续迭代
- ~~导出 PDF/Word~~ → 后续迭代

---

## 八、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 旧数据兼容 | 正在进行的任务可能中断 | 双路径读取，新旧格式都支持 |
| 单文档大小限制 | 微信云开发单文档 1MB 限制 | 拆分后每个文档大幅减小 |
| 并发生成方案 | 同一方向同时生成多个 | 前端限制 + 后端检查 generating 状态 |
