# 期刊分析工具 - 开发完成总结

## ✅ 已完成工作

### 1. 后端云函数 (journalAPI)

**文件**: `cloudfunctions/journalAPI/`

#### 主要功能
- ✅ **多源数据聚合**: OpenAlex（主）+ Crossref + DOAJ + NCBI
- ✅ **核心指标获取**: works_count、cited_by_count、h_index、i10_index、2yr_mean_citedness
- ✅ **年度趋势数据**: counts_by_year按年展开
- ✅ **学科主题分类**: OpenAlex Topics四级层次 + DOAJ LCC
- ✅ **收录状态检测**: DOAJ、PubMed、PMC
- ✅ **文章列表查询**: 走OpenAlex /works API实时查询（不存表）

#### 接口清单
| action | 说明 |
|--------|------|
| searchJournals | 搜索期刊（关键词/出版社/学科/OA筛选） |
| getJournalDetail | 获取期刊详情（含学科、年度统计） |
| compareJournals | 对比2-5本期刊 |
| recommendJournals | 智能选荐（学科+OA偏好） |
| getWarningJournals | 获取预警期刊列表 |
| getJournalArticles | 获取文章列表（OpenAlex API） |
| getSubjects | 获取学科分类树 |
| syncJournals | 同步单本期刊数据 |
| addJournal/updateJournal | 增改期刊（管理员） |
| addJournalSubject | 添加学科分类（管理员） |
| addJournalMetrics | 添加年度指标（管理员，二期） |
| initDatabase | 初始化数据库集合+索引 |

### 2. 数据库设计 (4张表)

#### journals - 期刊主表
- 基础信息：openalex_id、title、issn、homepage_url、publisher等
- OA状态：is_open_access、oa_type
- 收录状态：is_in_doaj、has_pmid、has_pmc、pmid_count、pmc_count
- **核心指标快照**：works_count_latest、cited_by_count_latest、h_index_latest、i10_index_latest、two_year_mean_citedness_latest ⭐
- 学科主题快照：top_topics（Top5）⭐

#### journal_subject - 学科分类表
- 支持OpenAlex Topics四级层次（Domain→Field→Subfield→Topic）
- 支持DOAJ LCC分类
- 一对多关系（一本期刊多个学科）

#### journal_metrics_yearly - 年度统计合并表
- 年度发文量/被引量（从counts_by_year展开）
- 核心指标（h_index、i10_index等）
- 文章类型分布（research/review/editorial）
- 作者画像（top_authors、top_institutions、top_countries）⭐
- 学科主题分布（top_topics）⭐

#### journal_warnings - 预警期刊表
- 预警级别（high/medium/low）
- 预警原因、来源、状态

### 3. 数据同步脚本

**文件**: `scripts/sync-journals.js`

#### 功能
- ✅ 从OpenAlex/Crossref/DOAJ/NCBI多源拉取数据
- ✅ 自动聚合并输出JSON文件
- ✅ 支持单本同步（--issn / --openalex-id）
- ✅ 支持批量同步（--batch）
- ✅ 速率控制（避免API限流）
- ✅ 详细日志和错误处理

#### 使用方法
```bash
# 单本同步
node scripts/sync-journals.js --issn 0028-0836
node scripts/sync-journals.js --openalex-id S137773546

# 批量同步
node scripts/sync-journals.js --batch journals.txt

# 同步默认列表
node scripts/sync-journals.js --all
```

#### 输出
- 单本：`output/journals/<openalex_id>.json`
- 批量：`output/sync-report.json`

### 4. 配置文件更新

#### academicTools/index.js
- ✅ COLLECTIONS列表更新为4张表（去掉旧表）

#### app.json
- ✅ 路由更新：favorites → warnings

#### journalAPI/init-db.js
- ✅ 创建4张集合
- ✅ 索引建议文档

---

## 📋 待完成工作

### 前端页面（5个）

| 页面 | 路径 | 优先级 |
|------|------|--------|
| 期刊搜索 | `/pages/journal/search/search` | P0 |
| 期刊详情 | `/pages/journal/detail/detail` | P0 |
| 期刊对比 | `/pages/journal/compare/compare` | P1 |
| 智能选荐 | `/pages/journal/recommend/recommend` | P1 |
| 预警期刊 | `/pages/journal/warnings/warnings` | P2 |

### 清理工作
- ❌ 删除 `pages/journal/favorites/` 目录（已废弃）

---

## 🔑 关键技术点

### 1. OpenAlex字段映射

| 截图显示 | OpenAlex字段 | 存储位置 |
|---------|-------------|---------|
| Homepage | `homepage_url` | journals.homepage_url |
| ISSN | `issns[]` | journals.issn_print/online |
| Publisher | `publisher` | journals.publisher |
| Works count | `works_count` | journals.works_count_latest |
| Citation count | `cited_by_count` | journals.cited_by_count_latest |
| H-index | `summary_stats.h_index` | journals.h_index_latest ⭐ |
| I10-index | `summary_stats.i10_index` | journals.i10_index_latest  |
| 2yr mean citedness | `summary_stats.2yr_mean_citedness` | journals.two_year_mean_citedness_latest ⭐ |
| Year柱状图 | `counts_by_year[]` | journal_metrics_yearly（按年展开）⭐ |
| Topic列表 | `topics[]` | journals.top_topics + journal_metrics_yearly.top_topics ⭐ |

### 2. 数据来源限制

- ✅ **可用免费数据源**: OpenAlex、Crossref、DOAJ、NCBI
- ❌ **不可用付费数据源**: 
  - SCImago（网站被Cloudflare保护，无法爬取SJR/SNIP/CiteScore/分区）
  - WoS/Scopus/EI/中科院（付费数据库）
  - JIF（Clarivate付费）

### 3. 二期扩展建议

如需完整指标体系，建议二期增加：
1. `journal_metrics_manual` 表 - 由管理员手工录入付费指标
2. 后台管理界面 - 用于批量导入和维护付费指标数据

---

## 🚀 下一步操作

### 立即执行
1. **部署云函数**: 上传 `journalAPI` 到微信云开发
2. **初始化数据库**: 调用 `initDatabase` 接口创建4张表
3. **手动添加索引**: 在云开发控制台按init-db.js建议添加索引
4. **执行数据同步**: 运行 `sync-journals.js` 脚本拉取初始数据
5. **导入数据**: 将输出的JSON文件导入到云数据库

### 后续开发
1. 创建5个前端页面（search/detail/compare/recommend/warnings）
2. 测试云函数接口
3. 联调前后端
4. 上线发布

---

## 📁 文件清单

### 新建文件
```
cloudfunctions/journalAPI/
  ├── index.js          (907行，重写完成)
  ├── init-db.js        (76行，更新完成)
  ├── package.json      (已有)
  ── config.json       (已有)

scripts/
  ├── sync-journals.js  (511行，新建)
  ├── journal_list.txt  (示例列表)
  └── README.md         (使用说明)
```

### 修改文件
```
cloudfunctions/academicTools/index.js  (COLLECTIONS列表)
miniprogram/app.json                    (路由配置)
```

### 待创建文件
```
miniprogram/pages/journal/
  ├── search/           (search.js/.wxml/.wxss/.json)
  ├── detail/           (detail.js/.wxml/.wxss/.json)
  ├── compare/          (compare.js/.wxml/.wxss/.json)
  ├── recommend/        (recommend.js/.wxml/.wxss/.json)
  └── warnings/         (warnings.js/.wxml/.wxss/.json)
```

---

## 💡 重要提示

1. **OpenAlex限流问题**: 本机IP已被限流，但云函数有自己的IP额度，部署后可正常使用
2. **数据同步时机**: 建议在云函数部署后，通过云函数定时任务定期执行同步
3. **索引优化**: 务必在云开发控制台添加索引，否则查询性能会很差
4. **测试建议**: 先用少量期刊测试，确认数据正确后再批量同步

---

##  技术支持

如有问题，请查看：
- `scripts/README.md` - 数据同步脚本使用说明
- `C:\Users\OAE\AppData\Roaming\QoderCN\SharedClientCache\cache\plans\期刊分析工具最终方案_3e2d84c7.md` - 完整方案文档
