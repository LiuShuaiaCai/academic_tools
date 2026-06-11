# 特刊话题策划助手 V2 方案

## 1. 问题描述

当前 V1 版本仅生成单一特刊话题方案，输出格式为纯 JSON，缺少直观的数据可视化支撑。用户（期刊编辑）无法基于多维度数据对比来决策，也无法直观看到话题的学术热度趋势和客编的学术影响力变化。参考行业标杆产品后，需要升级输出为**3 个备选话题方案**，每个方案自带中英双语内容、按年引用趋势、源文章详情、以及客编逐年学术数据。

## 2. 目标

- 用户输入 1 个关键词，系统自动生成 **3 个差异化特刊话题方案**
- 每个方案必须同时输出 **中文和英文** 的完整特刊信息
- 提供**按年份聚合的引用数据**（支持前端绘制柱状图）
- 提供每位推荐客编的**逐年发文数和被引数**（支持前端绘制柱状图）
- 源文章列表展示关键元数据（标题、DOI、发表日期、期刊、关键词、引用数）
- 每个话题附带**热度值（Topic Heat）**和**推荐理由**

## 3. 非目标（V1 不做）

- 不实现前端图表渲染库（ECharts/F2），仅输出结构化数据供后续接入
- 不做话题之间的对比分析功能（如投票、打分排序）
- 不接入实时引用追踪（引用数为 OpenAlex 快照值）
- 不实现 PDF/Word 导出功能
- 不做多轮对话式修改（如"把方案 2 的客编换掉"）

## 4. 用户故事

- **作为期刊编辑**，我想输入一个关键词后看到 3 个不同角度的特刊话题方案，以便选择最契合期刊定位的那个。
- **作为期刊编辑**，我想看到每个话题近 5 年每年的引用数据，以便判断该领域是否处于上升期。
- **作为期刊编辑**，我想看到每位推荐客编每年的发文和被引趋势，以便判断其学术活跃度和影响力是否在持续增长。
- **作为英文期刊编辑**，我希望每个方案同时提供中英双语内容，方便向国际客编发邀请。

## 5. 需求分级

### P0 - Must Have

- **P0-1** 系统提示词升级：要求 AI 基于同一批搜索数据，生成 3 个差异化话题方案（角度/细分领域不同）
- **P0-2** 输出格式升级：每个方案包含 `topic`（中英双语）、`rationale`（中英双语）、`topicHeat`、`keywords`、`summary`（中英双语）、`citationByYear`（按年引用数数组）、`sourceArticles`（文章详情列表）、`recommendedEditors`（客编列表）
- **P0-3** 客编逐年数据：每位客编附带 `worksByYear`（每年发文数）和 `citationsByYear`（每年被引数），覆盖近 10 年
- **P0-4** 源文章数据细化：每篇文章包含 `title`、`authors`、`publicationDate`、`sourceJournal`、`keywords`、`citationCount`、`doi`、`isOA`
- **P0-5** 新增 CloudRun 工具 `get_author_works`：通过 OpenAlex API 获取指定学者的全部论文，用于按年聚合

### P1 - Should Have

- **P1-1** 热度值算法：`topicHeat = 近3年论文总数 × 0.4 + 近3年总引用数 × 0.6`，AI 基于工具数据计算
- **P1-2** 客户端展示优化：3 个方案用卡片/Tab 切换，每个方案内部折叠展开式展示
- **P1-3** 客编排序：按 h-index 降序排列，同时展示 `worksCount`、`citedByCount`、`hIndex`

### P2 - Future

- **P2-1** 接入图表库在前端渲染 `citationByYear`、`worksByYear` 柱状图
- **P2-2** 支持用户点击"重新生成"仅替换不满意的单个方案
- **P2-3** 支持导出为 PDF 策划书

## 6. JSON 输出格式规范（AI 返回）

```json
{
  "keyword": "用户输入的关键词",
  "plans": [
    {
      "index": 1,
      "topicHeat": 274,
      "zh": {
        "title": "话题中文标题",
        "summary": "中文摘要 200-400 字",
        "keywords": ["关键词1", "关键词2"],
        "rationale": "中文推荐理由：为什么这个话题适合出特刊"
      },
      "en": {
        "title": "English Title",
        "summary": "English abstract 200-400 words",
        "keywords": ["keyword1", "keyword2"],
        "rationale": "English rationale"
      },
      "citationByYear": {
        "years": [2019, 2020, 2021, 2022, 2023, 2024, 2025],
        "counts": [5, 12, 45, 89, 130, 106, 0]
      },
      "sourceArticles": [
        {
          "title": "论文标题",
          "authors": ["Author A", "Author B"],
          "publicationDate": "2024-02-16",
          "sourceJournal": "Signal Transduction and Targeted Therapy",
          "keywords": ["Gut-brain axis"],
          "citationCount": 274,
          "doi": "10.1038/xxx",
          "isOA": true
        }
      ],
      "recommendedEditors": [
        {
          "name": "Scholar Name",
          "institution": "University Name",
          "researchInterests": ["Immunology", "Neuroscience"],
          "worksCount": 1123,
          "citedByCount": 45678,
          "hIndex": 92,
          "worksByYear": {
            "years": [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
            "counts": [20, 25, 30, 45, 50, 60, 55, 70, 65, 30]
          },
          "citationsByYear": {
            "years": [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
            "counts": [100, 200, 500, 1000, 2000, 3500, 5000, 7000, 8000, 3000]
          }
        }
      ]
    }
  ]
}
```

## 7. API / 工具变更

### 7.1 新增工具 `get_author_works`

```typescript
get_author_works: tool({
  description: '获取指定学者的全部论文列表，用于按年份统计发文量和被引量。',
  parameters: z.object({
    authorId: z.string().describe('OpenAlex 学者 ID，如 "A123456789"'),
    fromYear: z.number().optional().describe('起始年份，默认 2016'),
    perPage: z.number().optional().describe('每页数量，默认 100，最大 200')
  }),
  execute: async ({ authorId, fromYear, perPage }) => {
    // 调用 openAlexProxy 云函数
    // action: 'getAuthorWorks'，按 publication_year 降序
  }
})
```

> **Token 风险控制**：`get_author_works` 可能返回大量论文。返回前需精简：
> - 只保留 `title`、`publication_year`、`cited_by_count` 三个字段
> - CloudRun 端聚合为 `worksByYear` 和 `citationsByYear` 后再传给 LLM
> - 或直接在工具层完成聚合，只返回年份数组和计数数组

### 7.2 现有工具调整

- `search_papers`：保持精简策略（前 20 篇），但增加 `publicationDate` 和 `sourceJournal` 字段
- `search_authors`：保持前 10 位，但增加 `authorId`（用于后续调用 `get_author_works`）

### 7.3 调用流程（单方案）

```
1. search_papers(query, fromYear=2021)  → 精简论文列表
2. search_authors(query)                 → 精简学者列表（含 authorId）
3. 对每位推荐客编：
   get_author_works(authorId, fromYear=2016)  → 聚合为逐年数据
4. LLM 综合所有数据生成 3 个方案 JSON
```

> **注意**：步骤 3 可能产生多次工具调用（最多 10 次），128K 上下文足够容纳，但需要关注响应延迟。建议只取前 5 位客编调用 `get_author_works`。

## 8. 页面设计方案

### 8.1 整体布局

- 顶部：搜索输入框 + 生成按钮
- 中部：**3 个方案 Tab 卡片**（方案 1 / 方案 2 / 方案 3）
- 每个方案内部纵向分区：
  1. **话题概览区**：热度值徽章 + 标题 + 双语切换按钮 + 摘要
  2. **引用趋势区**：按年引用数数据（P2 阶段渲染为柱状图）
  3. **源文章区**：文章列表（可折叠，默认展开前 3 篇）
  4. **客编推荐区**：客编卡片列表，每位客编展示
     - 头像/名称/机构
     - 统计数据（Works / Cited by / H-index）
     - 逐年发文/被引数据（P2 阶段渲染为柱状图）
  5. **推荐理由区**：中英双语推荐理由

### 8.2 参考截图风格

- 左栏固定信息（Topic / Topic Heat / Keywords / Summary）
- 右栏图表（Cited by Count 柱状图）
- 下方 Source Articles 列表（标题蓝色链接 + 元数据）
- 客编区域左侧信息卡片 + 右侧柱状图

## 9. 成功指标

- **生成成功率**：3 个方案完整生成且 JSON 可解析率 ≥ 95%
- **端到端延迟**：从用户提交到 3 个方案全部展示 ≤ 30s（含工具调用）
- **Token 控制**：单次请求总 tokens ≤ 100K（128K 模型安全水位）

## 10. 开放问题

| 问题 | 负责人 | 状态 |
|---|---|---|
| `get_author_works` 返回数据量控制策略：是 CloudRun 端聚合后再给 LLM，还是让 LLM 自己聚合？ | 开发 | ✅ 已决策：用 `get_author_detail` 替代，直接取 OpenAlex 作者详情 API 的 `counts_by_year`，工具层只返回逐年数组 |
| 客编逐年数据是否可以直接用 `search_authors` 返回的 `counts_by_year` 字段（如果 OpenAlex 提供）？ | 开发 | ✅ 已调研：搜索端点（/authors?search=）不返回 counts_by_year，需单独调用 /authors/{id} 详情端点 |
| 3 个方案是否需要 3 次独立 LLM 调用（更稳定但慢），还是 1 次调用生成 3 个（更快但可能格式不统一）？ | 开发 | ✅ 已决策：1 次调用生成 3 个方案，token 可控且效率高 |
| 前端是否引入 ECharts 迷你版来渲染柱状图，还是先纯文本展示数字？ | 前端 | ✅ 已决策：使用项目已有的 qiun-wx-ucharts 组件渲染柱状图 |

---

## 附录：估算 Token 消耗（moonshot-v1-128k）

| 数据源 | 条数 | 每条估算 tokens | 小计 |
|---|---|---|---|
| 系统提示词 + 用户消息 | - | - | ~2K |
| 论文列表（精简后） | 20 | ~80 | ~1.6K |
| 学者列表（精简后） | 10 | ~50 | ~0.5K |
| 客编逐年论文（5人 × 10年） | - | - | ~0.3K |
| AI 输出（3 个方案 JSON） | - | - | ~8K-15K |
| **合计** | | | **~15K-25K** |

结论：128K 上下文完全够用，甚至可以适当放宽论文/学者数量限制。
