# 长期记忆 - academic_tools 项目

## 项目基本信息

- **项目名称**：学术工具（academic_tools）
- **项目定位**：开发学术功能，解决学术日常痛点
- **目标用户**：科研人员、审稿人、学术编辑
- **技术栈**：微信小程序 + 微信云开发
- **AppID**：wx81328607a82cd47e

## 产品规划（来自 prototype/原型.html）

### 核心工具（4个）
1. **投稿管理** - 跟踪稿件投稿进度（含完整时间线）
2. **审稿任务** - 管理审稿 deadline
3. **学术会议** - 跟踪会议截稿日期
4. **资料归档** - 统一管理附件文件

### 扩展工具（4个，部分 Coming Soon）
5. **文献引用** - GB/T 7714、APA 格式化
6. **期刊预警** - 预警期刊、假会议检测
7. **成果汇总** - 自动汇总论文、导出 CV
8. **学术笔记** - 文献阅读笔记管理

### 页面结构（原型规划）
- 底部 4 个 Tab：首页 | 工具箱 | 日历 | 我的
- 首次引导页：角色选择（科研人员/审稿人/学术编辑）
- 首页：统计数据 + 快速操作 + 即将到来的事项
- 学术日历：月历视图，标注截稿/审稿日期

## 数据库关键字段约定

- **deadline 字段**：存储格式为字符串 `"2026-05-03 23:53:50"`，不是 Date 对象
- 云数据库查询时必须用**同格式字符串**比较，用 `new Date()` 对象匹配不上
- `new Date("2026-05-06 00:00:00")` 在 iOS 下不兼容，需先 `.replace(' ', 'T')` 转为 ISO 格式
- **`completed` 字段**（投稿+审稿均有）：布尔值，根据**时间线最大时间 ≥ deadline** 自动计算
  - 保存时：`deadlineDate && maxTlDate && maxTlDate >= deadlineDate` → `completed = true`
  - 列表查询用 `completed: _.neq(true)` 筛出未完成项
  - 与 `decision`（accept/reject）解耦，只看时间线
- 投稿有 `deadline` 字段（不是 `revisionDeadline`，那是旧命名）
- 审稿无 `completed` 字段时属于未完成状态

## 首页工具卡片显示

- 文案：`图标 + X 任务待完成`（投稿排除已完成项）
- 右上角红色圆形角标显示紧急数（0-3天内截止）
- 图标文件：`/images/icon-task.png`（三横线列表图标）

## 近期截止跳转逻辑

- 首页点击近期截止项，跳转到列表页带 `?targetId=ID&targetTitle=标题&autoEdit=true`
- 列表页 `onLoad` 接收参数存为 `targetId` / `targetTitle` / `pendingAutoEdit`
- 列表加载完成后：先在 list 中查找 targetId → 找到则填充标题到搜索栏并弹窗
- 如果 targetId 不在已加载列表中，调用 `locateById()` 用 `doc(id).get()` 精确定位
- `targetTitle` 仅用于填充搜索栏显示，定位靠 `targetId`（因为 title 可能重复）
- `onShow` 检查 `targetId` 避免重复加载

## 搜索机制

- 所有列表页搜索走**服务端 db.RegExp 模糊搜索**，不再客户端过滤
- 投稿：搜索 title / journal / coauthors / tags（_.or 多字段 RegExp）
- 审稿：搜索 paperTitle / journal
- 会议：搜索 name / shortName / location
- 搜索时调用 `loadList()` 重新请求服务端，`applyFilter()` 只做状态/高级筛选
- 云数据库 `.get()` 默认最多返回 20 条，需注意数据量

## 云函数架构

- `academicAPI`：业务接口（用户配置、工具开关、投稿/审稿统计等），无AI依赖
- `aiService`：文件文本提取 + 模型配置查询，**不含 AI 调用**
  - AI 调用在**小程序端**用 `wx.cloud.extend.AI.createModel()` 实现
  - `cloud.AI.createModel()` 在云函数端**不稳定**（有时报 undefined），已弃用
  - API Key 和 BaseURL 在云开发后台 AI+ 模块配置，代码中不管理
  - 默认模型：`hunyuan-exp`（混元 Turbo），无模型选择功能
  - 小程序端正确写法：`wx.cloud.extend.AI.createModel(groupName)` — 有 `extend`
  - 小程序端 generateText 参数**直接传**，不包在 data 里；streamText 才需要 `{ data: {...} }`
  - AI 调用逻辑已提取到 `utils/ai-review.js`，form.js 只负责调云函数提取文本 + 调用 aiReviewUtil

## 用户偏好

- 偏好简洁的中文指令与结构化输出
- 喜欢对比表格和详细分类分析
- 习惯编号描述 → AI 确认 → 逐步修改 → 验证总结的需求模式
- 重视在线预览快速确认效果
- **用户取消操作时不要继续修改，等用户明确指令再动**
