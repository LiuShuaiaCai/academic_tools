# 智研学术助手

微信小程序学术助手，提供审稿识别、文献搜索、特刊话题策划等功能。

## 环境信息

| 项目 | 值 |
|------|-----|
| 环境 ID | `cloud1-d9gwkfeid5c310b5a` |
| 区域 | `ap-shanghai` |
| 套餐 | 个人版 |
| 静态托管域名 | `cloud1-d9gwkfeid5c310b5a-1300094911.tcloudbaseapp.com` |

## 云函数

| 函数名 | 说明 | Runtime |
|--------|------|---------|
| `openAlexProxy` | OpenAlex/Crossref API 代理（支持搜索论文、作者、引用） | Nodejs16.13 |
| `aiChat` | 多 Provider AI 调用统一入口（DeepSeek/Kimi/OpenAI 等） | Nodejs16.13 |
| `academicAPI` | 学术数据 API | Nodejs16.13 |
| `academicTools` | 学术工具集 | Nodejs16.13 |
| `creditsAPI` | 积分系统 API | Nodejs16.13 |
| `taskReminder` | 任务提醒定时推送 | Nodejs16.13 |
| `fileService` | 文件上传下载服务 | Nodejs16.13 |
| `submitFeedback` | 用户反馈提交 | Nodejs16.13 |
| `quickstartFunctions` | 快速入门示例函数 | Nodejs16.13 |

## Agent（特刊话题策划）

| 项目 | 值 |
|------|-----|
| Agent ID | `ibot-special-iztmg` |
| 功能 | 基于 OpenAlex 数据库生成特刊话题策划方案 |
| 工具 | `search_papers`（搜索论文）、`search_authors`（搜索学者） |
| 管理入口 | [AI+ Agent 管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/ai/agent) |

## 控制台入口

| 功能 | 链接 |
|------|------|
| 环境概览 | [控制台](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/overview) |
| 云函数 | [云函数管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/scf) |
| 数据库 | [数据库管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/db/doc) |
| 存储 | [存储管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/storage) |

## 云函数

| 函数名 | 说明 | Runtime |
|--------|------|---------|
| `openAlexProxy` | OpenAlex/Crossref API 代理（支持搜索论文、作者、引用） | Nodejs16.13 |
| `aiChat` | 多 Provider AI 调用统一入口（DeepSeek/Kimi/OpenAI 等） | Nodejs16.13 |
| `academicAPI` | 学术数据 API | Nodejs16.13 |
| `academicTools` | 学术工具集 | Nodejs16.13 |
| `creditsAPI` | 积分系统 API | Nodejs16.13 |
| `taskReminder` | 任务提醒定时推送 | Nodejs16.13 |
| `fileService` | 文件上传下载服务 | Nodejs16.13 |
| `submitFeedback` | 用户反馈提交 | Nodejs16.13 |
| `specialIssueAgent` | 特刊策划代理（调用 Agent CloudRun 服务） | Nodejs18.15 |
| `quickstartFunctions` | 快速入门示例函数 | Nodejs16.13 |

## Agent（特刊话题策划）

| 项目 | 值 |
|------|-----|
| Agent ID | `ibot-special-iztmg` |
| 模型 | `deepseek-v4-flash` |
| 功能 | 基于 OpenAlex 数据库生成中英双语特刊话题策划方案 |
| 工具 | `search_papers`（搜索论文）、`search_authors`（搜索学者） |
| 输出 | 双语 JSON（zh + en），含话题信息、趋势数据、客编推荐、来源论文 |
| 域名 | `ibot-special-268464-4-1300094911.sh.run.tcloudbase.com` |
| 管理入口 | [AI+ Agent 管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/ai/agent) |

## 特刊策划页面

| 项目 | 值 |
|------|-----|
| 页面路径 | `/pages/specialIssue/specialIssue` |
| 功能 | 输入关键词 → 调用 Agent 生成中英双语特刊方案 → 页面支持中英文切换展示 |
| i18n | `miniprogram/utils/i18n.js` + `locales/zh.js` + `locales/en.js` |

## 控制台入口

| 功能 | 链接 |
|------|------|
| 环境概览 | [控制台](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/overview) |
| 云函数 | [云函数管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/scf) |
| 数据库 | [数据库管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/db/doc) |
| 存储 | [存储管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d9gwkfeid5c310b5a#/storage) |

## 部署记录

- **上次部署**: 2026-06-10
- **部署方式**: CloudBase MCP 工具
- **更新内容**: 
  - Agent 升级为**中英双语输出**（zh/en 双版本 JSON）
  - 新增 `specialIssue` 小程序页面（支持中英文切换显示）
  - 新增 `specialIssueAgent` 云函数（代理 Agent API）
  - 新增 i18n 国际化系统（中文/English 语言包）
  - `academicTools` 新增 `specialIssue` 工具注册
