# 期刊信息 API 接口验证补充：Crossref / OpenAlex / NCBI

> 目的：补充验证三个关键问题：
>
> 1. Crossref 是否可以分页获取所有期刊；
> 2. OpenAlex 是否可以分页获取所有 journal 类型来源；
> 3. NCBI 不只查文章，还要怎么判断期刊是否被 PubMed / PMC / MEDLINE 收录，以及收录了多少文章。

---

## 1. Crossref：全量期刊与期刊文章数据

### 1.1 接口定位

Crossref 适合作为“期刊基础信息 + 期刊 DOI 文章元数据”的基础数据源。

主要用途：

| 用途 | 推荐接口 |
|---|---|
| 分页获取 Crossref 中所有 journal 记录 | `GET https://api.crossref.org/journals` |
| 根据 ISSN 获取单本期刊信息 | `GET https://api.crossref.org/journals/{issn}` |
| 获取某本期刊的全部 DOI 文章 | `GET https://api.crossref.org/journals/{issn}/works` |
| 按 ISSN 查询文章 | `GET https://api.crossref.org/works?filter=issn:{issn}` |
| 查询某 DOI 文章详情 | `GET https://api.crossref.org/works/{doi}` |

官方文档：

- https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/
- https://www.postman.com/postman-student-programs/crossref-unified-resource-api/documentation/uqp9uvy/crossref-unified-resource-api

---

### 1.2 分页获取所有期刊

你提到的接口是正确的：

```http
GET https://api.crossref.org/journals
```

推荐分页方式：

```http
GET https://api.crossref.org/journals?rows=1000&offset=0&mailto=your_email@example.com
GET https://api.crossref.org/journals?rows=1000&offset=1000&mailto=your_email@example.com
GET https://api.crossref.org/journals?rows=1000&offset=2000&mailto=your_email@example.com
```

返回结构中重点关注：

```json
{
  "message": {
    "items-per-page": 1000,
    "query": {
      "start-index": 0
    },
    "total-results": 80000,
    "items": []
  }
}
```

### 1.3 `/journals` 能获取什么期刊信息

典型字段：

| Crossref 字段 | 系统字段 | 说明 |
|---|---|---|
| `title` | `journal_title` | 期刊名称 |
| `ISSN` | `issn_list` | ISSN 列表 |
| `issn-type` | `issn_print` / `issn_online` | 区分 print / electronic |
| `publisher` | `publisher` | 出版社 |
| `counts.total-dois` | `crossref_total_dois` | Crossref 中该期刊 DOI 总量 |
| `counts.current-dois` | `crossref_current_dois` | 当前 DOI 数量 |
| `counts.backfile-dois` | `crossref_backfile_dois` | 历史回溯 DOI 数量 |
| `last-status-check-time` | `crossref_last_check_time` | Crossref 状态检查时间 |

建议入库表：`journal_source_crossref`。

---

### 1.4 获取某本期刊的文章数量

如果只需要知道数量，可以使用 `rows=0`：

```http
GET https://api.crossref.org/journals/ISSN/works?rows=0&mailto=your_email@example.com
```

返回中的：

```json
message.total-results
```

就是 Crossref 中该 ISSN 对应的作品数量。

按年份统计：

```http
GET https://api.crossref.org/journals/ISSN/works?filter=from-pub-date:2025-01-01,until-pub-date:2025-12-31&rows=0&mailto=your_email@example.com
```

按文章类型统计：

```http
GET https://api.crossref.org/journals/ISSN/works?filter=type:journal-article&rows=0&mailto=your_email@example.com
```

### 1.5 Crossref 注意事项

| 问题 | 建议 |
|---|---|
| 同一本期刊可能有 print ISSN 和 eISSN | 两个 ISSN 都要查，再按 ISSN-L 或人工规则合并 |
| Crossref 只代表 DOI 注册元数据 | 不是完整“期刊收录数据库” |
| `counts.total-dois` 不是正式发文量 | 只能代表 Crossref DOI 记录量 |
| 期刊改名、转让可能导致 ISSN 分散 | 需要 title history / ISSN-L 维护 |
| 大批量同步要带 `mailto` | 进入 polite pool，降低限流风险 |

---

## 2. OpenAlex：全量 journal 类型来源与期刊画像数据

### 2.1 接口定位

OpenAlex 适合作为“期刊画像 + 发文趋势 + 开放引用参考 + 作者机构国家分析”的免费基础数据源。

你提到的接口是正确的：

```http
GET https://api.openalex.org/sources?filter=type:journal
```

URL 编码后：

```http
GET https://api.openalex.org/sources?filter=type%3Ajournal
```

官方文档：

- https://developers.openalex.org/api-reference/sources
- https://developers.openalex.org/guides/page-through-results
- https://developers.openalex.org/

---

### 2.2 分页获取所有 journal

普通分页：

```http
GET https://api.openalex.org/sources?filter=type:journal&per_page=100&page=1
GET https://api.openalex.org/sources?filter=type:journal&per_page=100&page=2
```

普通分页最多适合前 10,000 条结果。全量同步建议用 cursor：

```http
GET https://api.openalex.org/sources?filter=type:journal&per_page=100&cursor=*
```

返回中读取：

```json
{
  "meta": {
    "count": 100000,
    "per_page": 100,
    "next_cursor": "xxx"
  },
  "results": []
}
```

下一页：

```http
GET https://api.openalex.org/sources?filter=type:journal&per_page=100&cursor={next_cursor}
```

终止条件：

```text
next_cursor = null 或 results 为空
```

---

### 2.3 OpenAlex Source 能获取什么期刊信息

| OpenAlex 字段 | 系统字段 | 说明 |
|---|---|---|
| `id` | `openalex_source_id` | OpenAlex Source ID |
| `display_name` | `journal_title` | 期刊名称 |
| `type` | `source_type` | journal、conference、repository 等 |
| `issn` | `issn_list` | ISSN 列表 |
| `issn_l` | `issn_l` | Linking ISSN |
| `homepage_url` | `website_url` | 期刊主页 |
| `host_organization` | `publisher_openalex_id` | 出版机构 ID |
| `host_organization_name` | `publisher` | 出版机构名称 |
| `country_code` | `country_code` | 国家代码 |
| `works_count` | `openalex_works_count` | OpenAlex 中作品总数 |
| `cited_by_count` | `openalex_cited_by_count` | OpenAlex 中被引总数 |
| `counts_by_year` | `works_count_by_year` / `citations_by_year` | 近年发文量和引用趋势 |
| `summary_stats.h_index` | `openalex_h_index` | h-index |
| `summary_stats.i10_index` | `openalex_i10_index` | i10-index |
| `summary_stats.2yr_mean_citedness` | `openalex_2yr_mean_citedness` | 近似影响力参考，非 JIF |
| `is_oa` | `is_open_access` | 是否开放获取来源 |
| `is_in_doaj` | `is_doaj` | 是否在 DOAJ |
| `apc_prices` | `apc_prices` | APC，来自 DOAJ |
| `apc_usd` | `apc_usd` | 换算美元 APC |
| `topics` | `topics` | 主题方向 |

建议入库表：`journal_source_openalex`。

---

### 2.4 获取某期刊文章数量与文章列表

优先流程：

1. 先通过 ISSN 找 OpenAlex Source；
2. 获取 Source ID；
3. 用 Source ID 查询 works。

按 ISSN 查 Source：

```http
GET https://api.openalex.org/sources?filter=issn:ISSN
```

通过 Source ID 查文章：

```http
GET https://api.openalex.org/works?filter=primary_location.source.id:https://openalex.org/SOURCE_ID&per_page=100&cursor=*
```

只统计数量时看返回：

```json
meta.count
```

按年份统计：

```http
GET https://api.openalex.org/works?filter=primary_location.source.id:https://openalex.org/SOURCE_ID,publication_year:2025&per_page=1
```

也可以直接使用 `Source.counts_by_year` 做近年发文趋势。

---

### 2.5 OpenAlex 注意事项

| 问题 | 建议 |
|---|---|
| OpenAlex 不是 JCR / Scopus 官方指标 | 前台标注“开放数据参考” |
| `cited_by_count` 不是 WoS/Scopus 引用数 | 不要替代 JIF / CiteScore |
| 文章类型、机构、国家需要清洗 | 建议保留原始 JSON 和清洗结果 |
| API 有免费额度和付费增强 | 大规模同步建议用 snapshot |
| 全量数据不要长期靠 API 一页页拉 | OpenAlex 官方建议大规模使用 snapshot |

---

## 3. NCBI E-utilities：期刊收录判断与文章数量统计

### 3.1 接口定位

NCBI 这里不能只保留 PubMed / PMC 的“文章查询”。期刊信息层面必须接入：

```text
NLM Catalog
```

NLM Catalog 是判断医学/生命科学期刊是否进入 NCBI 体系的重要入口。

相关数据库：

| 数据库 | db 参数 | 作用 |
|---|---|---|
| NLM Catalog | `nlmcatalog` | 查期刊主数据、MEDLINE/PubMed/PMC 相关状态 |
| PubMed | `pubmed` | 查 PubMed 中该期刊收录文章数量 |
| PMC | `pmc` | 查 PMC 中该期刊全文文章数量 |

官方文档：

- https://www.ncbi.nlm.nih.gov/books/NBK25497/
- https://www.ncbi.nlm.nih.gov/home/develop/api/
- https://www.ncbi.nlm.nih.gov/books/NBK3799/
- https://support.nlm.nih.gov/kbArticle/?pn=KA-04961

---

## 3.2 判断期刊是否在 NLM Catalog 中

按 ISSN 查询：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term=ISSN[issn]&retmode=json
```

示例：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term=0140-6736[issn]&retmode=json
```

判断逻辑：

| 返回结果 | 判断 |
|---|---|
| `esearchresult.count > 0` | NLM Catalog 中存在该期刊记录 |
| `esearchresult.idlist` 有值 | 可以继续调用 ESummary / EFetch 获取期刊详情 |
| `count = 0` | NLM Catalog 未匹配到该 ISSN，需尝试 eISSN / ISSN-L / 期刊名 |

获取期刊详情：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=nlmcatalog&id=NLM_ID&retmode=json
```

或者：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nlmcatalog&id=NLM_ID&retmode=xml
```

建议保存：

| 字段 | 说明 |
|---|---|
| `nlm_id` | NLM Unique ID |
| `title` | NLM Catalog 期刊标题 |
| `title_abbreviation` | NLM Title Abbreviation |
| `iso_abbreviation` | ISO Abbreviation |
| `issn` | ISSN |
| `publisher` | 出版商 |
| `country` | 出版国家 |
| `language` | 语言 |
| `publication_status` | 出版状态 |
| `indexing_information` | MEDLINE/PubMed/PMC 相关信息 |

---

## 3.3 判断是否“当前 MEDLINE 收录”

NLM Catalog 中，`currentlyindexed` 用于检索当前 MEDLINE indexed journals。

按 ISSN 判断：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term=ISSN[issn]+AND+currentlyindexed&retmode=json
```

判断逻辑：

| 返回结果 | 判断 |
|---|---|
| `count > 0` | 当前 MEDLINE indexed |
| `count = 0` | 不是当前 MEDLINE indexed，或 ISSN 未匹配 |

如果要判断“曾经或当前 MEDLINE 收录”：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term=ISSN[issn]+AND+reportedmedline[All Fields]&retmode=json
```

字段建议：

| 系统字段 | 规则 |
|---|---|
| `is_medline_current` | `ISSN[issn] AND currentlyindexed` count > 0 |
| `is_medline_current_or_previous` | `ISSN[issn] AND reportedmedline[All Fields]` count > 0 |
| `medline_checked_at` | 当前同步时间 |

---

## 3.4 判断是否 PMC 当前期刊

NLM Catalog 中，`journalspmc` 表示 PubMed Central journals。

按 ISSN 判断：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term=ISSN[issn]+AND+journalspmc&retmode=json
```

判断逻辑：

| 返回结果 | 判断 |
|---|---|
| `count > 0` | 当前 PMC journal |
| `count = 0` | 不是当前 PMC journal，或 ISSN 未匹配 |

如果是 forthcoming：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term=ISSN[issn]+AND+journalspmcforthcoming&retmode=json
```

字段建议：

| 系统字段 | 规则 |
|---|---|
| `is_pmc_journal` | `ISSN[issn] AND journalspmc` count > 0 |
| `is_pmc_forthcoming` | `ISSN[issn] AND journalspmcforthcoming` count > 0 |
| `pmc_journal_checked_at` | 当前同步时间 |

---

## 3.5 判断是否属于 PubMed journals subset

NLM 官方说明中，PubMed journals subset 可以用：

```text
nlmcatalog pubmed[sb]
```

按 ISSN 判断：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term=ISSN[issn]+AND+nlmcatalog+pubmed[sb]&retmode=json
```

判断逻辑：

| 返回结果 | 判断 |
|---|---|
| `count > 0` | NLM Catalog 中属于 PubMed journals subset |
| `count = 0` | 不属于 PubMed journals subset，或 ISSN 未匹配 |

更稳妥的业务判断：

```text
is_pubmed_journal = is_medline_current OR is_pmc_journal OR pubmed_article_count > 0
```

原因：PubMed 中既有 MEDLINE 文章，也有 PMC 导入文章，还有其他非 MEDLINE 记录。实际产品页面建议分开展示：

| 前台展示 | 后台字段 |
|---|---|
| MEDLINE 当前收录 | `is_medline_current` |
| PMC 期刊 | `is_pmc_journal` |
| PubMed 有文章记录 | `pubmed_article_count > 0` |

---

## 3.6 统计 PubMed 收录了多少文章

用 PubMed 的 `esearch` 统计 count：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=ISSN[issn]&retmode=json&rettype=count
```

示例：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=0140-6736[issn]&retmode=json&rettype=count
```

读取：

```json
esearchresult.count
```

如果一本期刊有 print ISSN 和 eISSN，建议 OR 查询：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=(PRINT_ISSN[issn]+OR+EISSN[issn])&retmode=json&rettype=count
```

按年份统计：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=ISSN[issn]+AND+2025[dp]&retmode=json&rettype=count
```

按日期范围统计：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=ISSN[issn]+AND+(2025/01/01:2025/12/31[dp])&retmode=json&rettype=count
```

建议字段：

| 系统字段 | 说明 |
|---|---|
| `pubmed_article_count` | PubMed 总文章数 |
| `pubmed_article_count_yearly` | PubMed 年度文章数 |
| `pubmed_latest_article_date` | 最新 PubMed 文章日期 |
| `pubmed_checked_at` | 最近同步时间 |

---

## 3.7 统计 PMC 收录了多少文章

用 PMC 的 `esearch` 统计 count：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=ISSN[issn]&retmode=json&rettype=count
```

示例：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=0140-6736[issn]&retmode=json&rettype=count
```

读取：

```json
esearchresult.count
```

按年份统计：

```http
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=ISSN[issn]+AND+2025[dp]&retmode=json&rettype=count
```

建议字段：

| 系统字段 | 说明 |
|---|---|
| `pmc_article_count` | PMC 全文文章数 |
| `pmc_article_count_yearly` | PMC 年度全文文章数 |
| `pmc_latest_article_date` | 最新 PMC 文章日期 |
| `pmc_checked_at` | 最近同步时间 |

注意：PMC 数量不是 PubMed 数量。PMC 代表全文进入 PubMed Central；PubMed 是文摘/索引层面的记录。

---

## 3.8 NCBI 判断规则总结

| 业务问题 | 推荐查询 | 判断规则 |
|---|---|---|
| NLM Catalog 是否有该期刊 | `db=nlmcatalog&term=ISSN[issn]` | `count > 0` |
| 是否当前 MEDLINE 收录 | `db=nlmcatalog&term=ISSN[issn] AND currentlyindexed` | `count > 0` |
| 是否曾经/当前 MEDLINE | `db=nlmcatalog&term=ISSN[issn] AND reportedmedline[All Fields]` | `count > 0` |
| 是否 PMC 当前期刊 | `db=nlmcatalog&term=ISSN[issn] AND journalspmc` | `count > 0` |
| 是否 PMC forthcoming | `db=nlmcatalog&term=ISSN[issn] AND journalspmcforthcoming` | `count > 0` |
| PubMed 收录文章数 | `db=pubmed&term=ISSN[issn]` | `esearchresult.count` |
| PMC 收录文章数 | `db=pmc&term=ISSN[issn]` | `esearchresult.count` |
| PubMed 年度文章数 | `db=pubmed&term=ISSN[issn] AND 2025[dp]` | `esearchresult.count` |
| PMC 年度文章数 | `db=pmc&term=ISSN[issn] AND 2025[dp]` | `esearchresult.count` |

---

## 4. 数据库表补充设计

### 4.1 journal_source_crossref

```sql
CREATE TABLE journal_source_crossref (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    journal_id BIGINT NULL,
    source_key VARCHAR(50) NOT NULL DEFAULT 'crossref',
    title VARCHAR(500) NULL,
    issn_list JSON NULL,
    issn_print VARCHAR(20) NULL,
    issn_online VARCHAR(20) NULL,
    publisher VARCHAR(255) NULL,
    total_dois INT NULL,
    current_dois INT NULL,
    backfile_dois INT NULL,
    raw_json JSON NULL,
    last_synced_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_issn_print (issn_print),
    INDEX idx_issn_online (issn_online),
    INDEX idx_journal_id (journal_id)
);
```

---

### 4.2 journal_source_openalex

```sql
CREATE TABLE journal_source_openalex (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    journal_id BIGINT NULL,
    openalex_source_id VARCHAR(100) NOT NULL,
    display_name VARCHAR(500) NULL,
    source_type VARCHAR(50) NULL,
    issn_l VARCHAR(20) NULL,
    issn_list JSON NULL,
    homepage_url VARCHAR(1000) NULL,
    publisher_openalex_id VARCHAR(100) NULL,
    publisher_name VARCHAR(255) NULL,
    country_code VARCHAR(10) NULL,
    works_count INT NULL,
    cited_by_count INT NULL,
    h_index INT NULL,
    i10_index INT NULL,
    two_year_mean_citedness DECIMAL(10,4) NULL,
    is_oa TINYINT(1) NULL,
    is_in_doaj TINYINT(1) NULL,
    apc_usd INT NULL,
    apc_prices JSON NULL,
    counts_by_year JSON NULL,
    topics JSON NULL,
    raw_json JSON NULL,
    last_synced_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_openalex_source_id (openalex_source_id),
    INDEX idx_issn_l (issn_l),
    INDEX idx_journal_id (journal_id)
);
```

---

### 4.3 journal_source_ncbi

```sql
CREATE TABLE journal_source_ncbi (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    journal_id BIGINT NULL,
    nlm_id VARCHAR(50) NULL,
    title VARCHAR(500) NULL,
    title_abbreviation VARCHAR(255) NULL,
    iso_abbreviation VARCHAR(255) NULL,
    issn_print VARCHAR(20) NULL,
    issn_online VARCHAR(20) NULL,
    publisher VARCHAR(255) NULL,
    country VARCHAR(100) NULL,
    language VARCHAR(100) NULL,
    publication_status VARCHAR(100) NULL,
    is_nlm_catalog TINYINT(1) NOT NULL DEFAULT 0,
    is_medline_current TINYINT(1) NOT NULL DEFAULT 0,
    is_medline_current_or_previous TINYINT(1) NOT NULL DEFAULT 0,
    is_pmc_journal TINYINT(1) NOT NULL DEFAULT 0,
    is_pmc_forthcoming TINYINT(1) NOT NULL DEFAULT 0,
    pubmed_article_count INT NOT NULL DEFAULT 0,
    pmc_article_count INT NOT NULL DEFAULT 0,
    raw_nlm_json JSON NULL,
    last_synced_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nlm_id (nlm_id),
    INDEX idx_issn_print (issn_print),
    INDEX idx_issn_online (issn_online),
    INDEX idx_journal_id (journal_id)
);
```

---

### 4.4 journal_ncbi_article_stats_yearly

```sql
CREATE TABLE journal_ncbi_article_stats_yearly (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    journal_id BIGINT NOT NULL,
    stat_year INT NOT NULL,
    pubmed_article_count INT NOT NULL DEFAULT 0,
    pmc_article_count INT NOT NULL DEFAULT 0,
    last_synced_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_journal_year (journal_id, stat_year),
    INDEX idx_stat_year (stat_year)
);
```

---

## 5. 推荐最终接口接入策略

### 5.1 全量期刊基础库

| 数据源 | 接口 | 作用 |
|---|---|---|
| Crossref | `/journals` | 获取 Crossref 期刊清单 |
| OpenAlex | `/sources?filter=type:journal` | 获取 OpenAlex journal 清单 |
| NLM Catalog | `db=nlmcatalog` | 补充医学期刊收录状态 |
| DOAJ | DOAJ API / dump | 补充 OA 期刊和 APC |

### 5.2 单本期刊详情刷新

输入：`journal_title + ISSN + eISSN`

推荐流程：

```text
1. 用 ISSN / eISSN 查 Crossref journal
2. 用 ISSN / eISSN 查 OpenAlex source
3. 用 ISSN / eISSN 查 NLM Catalog
4. 用 ISSN / eISSN 查 PubMed count
5. 用 ISSN / eISSN 查 PMC count
6. 用 DOAJ 查 OA / APC
7. 合并、去重、归一化到 journal 主表
```

### 5.3 前台展示建议

| 前台字段 | 推荐来源 | 备注 |
|---|---|---|
| 期刊名称 | Crossref / OpenAlex / NLM Catalog | 多源比对 |
| ISSN / eISSN | Crossref / OpenAlex / NLM Catalog | 多源比对 |
| 出版社 | Crossref / OpenAlex / NLM Catalog | 可能不一致 |
| 官网 | OpenAlex / DOAJ / 手工维护 | OpenAlex 可能缺失 |
| Crossref DOI 数量 | Crossref | DOI 记录量 |
| OpenAlex 作品数 | OpenAlex | 开放学术记录量 |
| OpenAlex 被引数 | OpenAlex | 开放引用参考 |
| 是否 DOAJ | OpenAlex / DOAJ | DOAJ 优先 |
| 是否 NLM Catalog | NLM Catalog | 医学期刊关键 |
| 是否当前 MEDLINE | NLM Catalog `currentlyindexed` | 权威判断 |
| 是否 PMC Journal | NLM Catalog `journalspmc` | 权威判断 |
| PubMed 文章数 | PubMed ESearch | count |
| PMC 文章数 | PMC ESearch | count |

---

## 6. 结论

1. `https://api.crossref.org/journals` 可以作为 Crossref 期刊清单入口，支持分页获取期刊记录。
2. `https://api.openalex.org/sources?filter=type%3Ajournal` 可以作为 OpenAlex 全量 journal 来源入口，建议使用 cursor 分页。
3. NCBI 不能只接 PubMed / PMC 文章接口，必须接 NLM Catalog，用于判断期刊是否属于 NLM Catalog、是否当前 MEDLINE indexed、是否 PMC journal。
4. “收录了多少文章”应分别统计：
   - PubMed：`db=pubmed&term=ISSN[issn]` 的 `count`；
   - PMC：`db=pmc&term=ISSN[issn]` 的 `count`。
5. 前台展示时要区分：
   - MEDLINE 当前收录；
   - PMC 当前期刊；
   - PubMed 有文章记录；
   - PubMed 文章数量；
   - PMC 全文文章数量。

