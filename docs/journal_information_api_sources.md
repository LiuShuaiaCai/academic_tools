# 期刊信息数据源 API 清单：免费 / 付费 / 授权

> 更新时间：2026-06-25  
> 适用场景：期刊分析平台、期刊画像系统、选刊系统、出版运营分析系统。  
> 注意：API 版本、限流、授权方式会变化，生产环境接入前应以各平台最新官方文档和合同条款为准。

---

## 1. 总体结论

期刊信息平台的数据来源可以分为三层：

1. **免费公开数据层**：Crossref、OpenAlex、NCBI、DOAJ、Unpaywall、OpenCitations、ROR、DataCite、Europe PMC 等。  
   适合做期刊基础库、论文元数据、OA 状态、PubMed/PMC 收录、开放引用、作者机构国家分析。

2. **付费权威指标层**：Clarivate JCR / Web of Science、Elsevier Scopus / SciVal、Dimensions、Altmetric、ISSN Portal、Cabells 等。  
   适合做 JIF、JCR 分区、JCI、CiteScore、Scopus 引用、科研趋势、传播影响力、官方 ISSN 主数据、期刊风险判断。

3. **自有运营数据层**：投稿系统、审稿系统、官网访问、邮件系统、财务系统。  
   适合做投稿量、接收率、审稿周期、编委贡献、专题表现、收入成本、推广转化。

---

# 2. 免费 / 开放 / Freemium API

## 2.1 Crossref REST API

| 项目 | 内容 |
|---|---|
| 数据类型 | DOI 与出版元数据 |
| 是否免费 | 免费公开 API，需遵守限流和 polite 使用规范 |
| 是否需要 Key | 通常不需要；建议带 `mailto` 或规范 User-Agent |
| 适合用途 | 期刊基础信息、文章列表、年度发文量、DOI 校验、出版社与 DOI 前缀识别 |
| 官方文档 | https://www.crossref.org/documentation/retrieve-metadata/rest-api/ |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 期刊基础信息 | 期刊名、ISSN、eISSN、出版社、DOI prefix |
| 文章元数据 | DOI、标题、作者、出版日期、卷、期、页码、文章类型 |
| 出版关系 | container-title、publisher、member、prefix |
| License | license URL、生效日期，取决于出版社提交质量 |
| 基金 | funder、award，取决于出版社提交质量 |
| 参考文献 | reference，取决于出版社是否提交并开放 |
| 被引参考值 | `is-referenced-by-count`，只能作为 Crossref 维度参考，不等于 WoS/Scopus 官方引用 |

### 常用接口

```http
# 按 DOI 查询文章元数据
GET https://api.crossref.org/works/{doi}

# 按 ISSN 查询期刊信息
GET https://api.crossref.org/journals/{issn}

# 按 ISSN 查询某本期刊的文章列表
GET https://api.crossref.org/journals/{issn}/works

# 查询某个出版社/会员机构信息
GET https://api.crossref.org/members/{member_id}

# 查询 DOI prefix 信息
GET https://api.crossref.org/prefixes/{prefix}
```

### 平台字段映射

| 系统字段 | Crossref 来源 |
|---|---|
| journal_title | container-title |
| issn_print / issn_online | ISSN / issn-type |
| publisher | publisher / member |
| doi_prefix | prefix |
| article_doi | DOI |
| article_title | title |
| published_date | published-print / published-online / published |
| volume / issue / pages | volume / issue / page |
| reference_count | reference-count |
| license | license |

---

## 2.2 OpenAlex API

| 项目 | 内容 |
|---|---|
| 数据类型 | 开放学术知识图谱 |
| 是否免费 | Freemium；数据快照免费，API 免费 Key 有每日免费额度，超量需付费/订阅 |
| 是否需要 Key | 2026 年起建议/要求使用免费 API Key |
| 适合用途 | 期刊画像、发文趋势、引用趋势参考、作者/机构/国家分布、主题分析、竞品对比 |
| 官方文档 | https://developers.openalex.org/ |
| 认证与价格 | https://developers.openalex.org/api-reference/authentication |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 来源/期刊信息 | Sources：期刊、会议、仓储等来源信息 |
| 期刊 ID | OpenAlex Source ID |
| ISSN | issn、issn_l |
| 出版社/机构 | host_organization、host_organization_name |
| 发文量 | works_count、counts_by_year |
| 开放引用参考 | cited_by_count、summary_stats |
| 文章列表 | Works |
| 作者 | Authors |
| 机构 | Institutions |
| 国家 | authorships.institutions.country_code |
| 学科主题 | Topics、Concepts、Keywords |
| OA 信息 | primary_location、open_access |

### 常用接口

```http
# 按 ISSN 查期刊 / Source
GET https://api.openalex.org/sources?filter=issn:{issn}&api_key={api_key}

# 按期刊名称搜索 Source
GET https://api.openalex.org/sources?search={journal_title}&api_key={api_key}

# 查询某期刊的文章
GET https://api.openalex.org/works?filter=primary_location.source.issn:{issn}&api_key={api_key}

# 查询某期刊某年的文章
GET https://api.openalex.org/works?filter=primary_location.source.issn:{issn},publication_year:{year}&api_key={api_key}

# 按 DOI 查询文章
GET https://api.openalex.org/works/https://doi.org/{doi}?api_key={api_key}

# 按机构查询
GET https://api.openalex.org/institutions?search={institution_name}&api_key={api_key}
```

### 平台字段映射

| 系统字段 | OpenAlex 来源 |
|---|---|
| openalex_source_id | sources.id |
| journal_title | sources.display_name |
| issn_print / issn_online / issn_l | sources.issn / issn_l |
| publisher | host_organization_name |
| works_count | works_count |
| cited_by_count_openalex | cited_by_count |
| yearly_articles | counts_by_year.works_count |
| yearly_citations | counts_by_year.cited_by_count |
| top_topics | topics / keywords |
| author_country_distribution | works.authorships.institutions.country_code |
| institution_distribution | works.authorships.institutions |

### 注意

OpenAlex 适合做开放数据分析，但不等于 JCR、WoS 或 Scopus 的官方引用指标。涉及正式宣传、排名和官方指标时，应标注“OpenAlex 开放数据参考”。

---

## 2.3 NCBI E-utilities：PubMed / PMC / NLM Catalog

| 项目 | 内容 |
|---|---|
| 数据类型 | 医学与生命科学文献、PubMed、PMC、NLM Catalog |
| 是否免费 | 免费 |
| 是否需要 Key | 不强制；有 API Key 可提高请求速率 |
| 适合用途 | PubMed 收录、PMC 收录、PMID/PMCID 补全、MeSH、医学期刊收录判断 |
| 官方文档 | https://www.ncbi.nlm.nih.gov/books/NBK25497/ |
| API 开发入口 | https://www.ncbi.nlm.nih.gov/home/develop/api/ |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| PubMed 收录 | 某期刊在 PubMed 中的文章数量、PMID 列表 |
| PMC 收录 | PMCID、全文收录状态 |
| NLM Catalog | NLM ID、期刊名、ISSN、MEDLINE/PubMed/PMC 相关信息 |
| 医学主题 | MeSH Terms |
| 文章类型 | Publication Type |
| 摘要 | Abstract |
| 作者/机构 | Author、Affiliation |

### 常用接口

```http
# 基础地址
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/

# 按 DOI 查 PMID
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={doi}[doi]&retmode=json&api_key={api_key}

# 按 ISSN 查 PubMed 文章
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={issn}[issn]&retmode=json&api_key={api_key}

# 获取 PubMed 摘要信息
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={pmid}&retmode=json&api_key={api_key}

# 获取 PubMed XML 全记录
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&retmode=xml&api_key={api_key}

# 按 DOI 查 PMC
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term={doi}[doi]&retmode=json&api_key={api_key}

# 查 NLM Catalog 期刊记录
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term={issn}[issn]&retmode=json&api_key={api_key}
```

### 平台字段映射

| 系统字段 | NCBI 来源 |
|---|---|
| pmid | PubMed ESearch / ESummary |
| pmcid | PMC ESearch / ELink |
| nlm_id | NLM Catalog |
| is_pubmed | PubMed 查询是否有记录 |
| is_pmc | PMC 查询是否有记录 |
| mesh_terms | PubMed XML MeshHeadingList |
| publication_type | PubMed PublicationTypeList |
| abstract | PubMed Abstract |

---

## 2.4 DOAJ API / Public Data Dump

| 项目 | 内容 |
|---|---|
| 数据类型 | 开放获取期刊目录与 OA 文章元数据 |
| 是否免费 | 免费，DOAJ 元数据开放 |
| 是否需要 Key | 公共查询一般不需要；提交/管理期刊元数据需要账号/Key |
| 适合用途 | 判断是否 DOAJ 收录、OA 合规、APC、License、DOAJ Seal、OA期刊画像 |
| 官方网站 | https://doaj.org/ |
| 元数据说明 | https://doaj.org/docs/faq/ |
| API 文档 | https://doaj.org/api/v4/docs （如浏览器无法访问，需以 DOAJ 当前文档为准） |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| DOAJ 收录状态 | 是否在 DOAJ 中 |
| 期刊名 | Journal title |
| ISSN/eISSN | print/electronic ISSN |
| 出版社 | Publisher |
| 国家 | Country of publisher |
| 语言 | Languages |
| 学科 | Subjects |
| APC | 是否收费、费用、币种 |
| License | CC BY、CC BY-NC 等 |
| DOAJ Seal | 是否获得 DOAJ Seal |
| 同行评议 | Peer review process |
| 存档 | Preservation service |

### 常用接口示例

> DOAJ API 有版本变化，生产前请确认当前文档版本。以下为常见历史/兼容写法，具体以 DOAJ 当前 docs 为准。

```http
# 搜索期刊
GET https://doaj.org/api/v2/search/journals/{query}

# 搜索文章
GET https://doaj.org/api/v2/search/articles/{query}

# 按 ISSN 搜索期刊，query 中放 ISSN
GET https://doaj.org/api/v2/search/journals/{issn}
```

### 平台字段映射

| 系统字段 | DOAJ 来源 |
|---|---|
| is_doaj | 是否搜索到期刊 |
| doaj_title | bibjson.title |
| issn_print / issn_online | bibjson.pissn / bibjson.eissn |
| publisher | bibjson.publisher |
| country | bibjson.country |
| language | bibjson.language |
| apc_amount / apc_currency | APC 字段 |
| license | bibjson.license |
| doaj_seal | DOAJ Seal 字段 |

---

## 2.5 Unpaywall API

| 项目 | 内容 |
|---|---|
| 数据类型 | 文章开放获取状态与免费全文链接 |
| 是否免费 | 免费；建议每日请求不超过官方建议量，大规模使用可用 Snapshot |
| 是否需要 Key | 不需要 Key，但必须带 email 参数 |
| 适合用途 | 判断文章是否 OA、OA 类型、免费 PDF、仓储版本、期刊 OA 比例 |
| 官方文档 | https://unpaywall.org/products/api |
| 数据字段说明 | https://unpaywall.org/data-format |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 是否 OA | is_oa |
| OA 类型 | oa_status：gold、hybrid、green、bronze、closed |
| 最佳 OA 地址 | best_oa_location |
| PDF 地址 | url_for_pdf |
| License | license |
| 版本 | version：publishedVersion、acceptedVersion、submittedVersion |
| 来源类型 | host_type：publisher / repository |

### 常用接口

```http
# 按 DOI 查询 OA 状态
GET https://api.unpaywall.org/v2/{doi}?email={your_email}
```

### 平台字段映射

| 系统字段 | Unpaywall 来源 |
|---|---|
| is_oa | is_oa |
| oa_status | oa_status |
| oa_pdf_url | best_oa_location.url_for_pdf |
| oa_landing_page | best_oa_location.url |
| oa_license | best_oa_location.license |
| oa_host_type | best_oa_location.host_type |

---

## 2.6 OpenCitations Index API

| 项目 | 内容 |
|---|---|
| 数据类型 | 开放引用关系 |
| 是否免费 | 免费开放 |
| 是否需要 Key | 不强制；大规模使用建议注册 token / 联系 OpenCitations |
| 适合用途 | DOI-to-DOI 引用网络、开放引用次数、参考文献关系、被引关系 |
| 官方文档 | https://api.opencitations.net/index |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 某 DOI 被哪些 DOI 引用 | incoming citations |
| 某 DOI 引用了哪些 DOI | outgoing references |
| 被引次数 | citation-count |
| 参考文献数量 | reference-count |
| 引用发生时间 | creation / timespan，视接口返回 |
| 来源与元数据 | citing/cited DOI、PMID、OMID 等 |

### 常用接口

```http
# 查询某 DOI 被哪些文献引用
GET https://api.opencitations.net/index/api/v2/citations/{doi}

# 查询某 DOI 的参考文献
GET https://api.opencitations.net/index/api/v2/references/{doi}

# 查询某 DOI 被引次数
GET https://api.opencitations.net/index/api/v2/citation-count/{doi}

# 查询某 DOI 参考文献数量
GET https://api.opencitations.net/index/api/v2/reference-count/{doi}
```

### 平台字段映射

| 系统字段 | OpenCitations 来源 |
|---|---|
| open_citation_count | citation-count |
| open_reference_count | reference-count |
| citing_doi | citations.citing |
| cited_doi | references.cited |
| citation_network | citations/references 关系表 |

---

## 2.7 ROR API

| 项目 | 内容 |
|---|---|
| 数据类型 | 研究机构标准化信息 |
| 是否免费 | 免费开放，ROR 元数据 CC0 |
| 是否需要 Key | 不需要 |
| 适合用途 | 作者机构清洗、国家/地区分析、机构合并、机构合作网络 |
| 官方文档 | https://ror.readme.io/docs/rest-api |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 机构唯一 ID | ROR ID |
| 标准机构名 | name / names |
| 别名 | aliases、labels |
| 国家与地区 | country、locations |
| 机构类型 | education、company、healthcare、funder 等 |
| 外部 ID | GRID、ISNI、Wikidata 等 |
| 上下级关系 | relationships |

### 常用接口

```http
# 按机构名称搜索
GET https://api.ror.org/v2/organizations?query={institution_name}

# 按 ROR ID 查询
GET https://api.ror.org/v2/organizations/{ror_id}

# 按国家、类型过滤
GET https://api.ror.org/v2/organizations?filter=country.country_code:CN
```

### 平台字段映射

| 系统字段 | ROR 来源 |
|---|---|
| ror_id | id |
| institution_name | names / name |
| institution_aliases | aliases |
| country_code | country.country_code / locations |
| institution_type | types |
| external_ids | external_ids |

---

## 2.8 ORCID Public API

| 项目 | 内容 |
|---|---|
| 数据类型 | 作者公开身份信息 |
| 是否免费 | Public API 免费；Member API 需机构会员 |
| 是否需要 Key | 匿名可用，注册 Public API Client 更合适 |
| 适合用途 | 作者身份识别、ORCID 绑定、作者公开作品/机构补充 |
| 官方文档 | https://info.orcid.org/documentation/integration-and-api-faq/ |
| 限流说明 | https://info.orcid.org/ufaqs/what-are-the-api-limits/ |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| ORCID iD | 作者唯一标识 |
| 姓名 | given-names、family-name、credit-name |
| 公开作品 | works |
| 公开任职 | employments |
| 公开教育经历 | educations |
| 外部标识 | external-identifiers |

### 常用接口

```http
# 获取公开记录
GET https://pub.orcid.org/v3.0/{orcid}/record
Accept: application/json

# 获取公开作品
GET https://pub.orcid.org/v3.0/{orcid}/works
Accept: application/json
```

### 平台字段映射

| 系统字段 | ORCID 来源 |
|---|---|
| orcid | path id |
| author_name | person.name |
| author_works | activities-summary.works |
| author_affiliations | employments / educations |

---

## 2.9 DataCite REST API

| 项目 | 内容 |
|---|---|
| 数据类型 | DataCite DOI 元数据，主要是数据集、软件、报告、预印本等 |
| 是否免费 | 查询免费；创建/更新 DOI 需要 DataCite Repository 账号 |
| 是否需要 Key | 查询通常不需要；写入需要账号 |
| 适合用途 | 数据集 DOI、科研数据关联、Data availability 分析、论文-数据集关联 |
| 官方文档 | https://support.datacite.org/docs/api |
| API Reference | https://support.datacite.org/reference/introduction |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| DOI | doi |
| 标题 | titles |
| 作者/创建者 | creators |
| 出版者 | publisher |
| 资源类型 | resourceTypeGeneral |
| 年份 | publicationYear |
| 关联标识 | relatedIdentifiers |
| 基金 | fundingReferences |
| License | rightsList |

### 常用接口

```http
# 按 DOI 查询
GET https://api.datacite.org/dois/{doi}

# 搜索 DOI 元数据
GET https://api.datacite.org/dois?query={keyword}

# 按 publisher 搜索
GET https://api.datacite.org/dois?query=publisher:{publisher_name}
```

### 平台字段映射

| 系统字段 | DataCite 来源 |
|---|---|
| dataset_doi | doi |
| dataset_title | titles |
| dataset_creator | creators |
| resource_type | types.resourceTypeGeneral |
| related_article_doi | relatedIdentifiers |
| data_license | rightsList |

---

## 2.10 Europe PMC RESTful API

| 项目 | 内容 |
|---|---|
| 数据类型 | 生命科学文献、PubMed/PMC 扩展数据、全文链接、资助信息 |
| 是否免费 | 免费 |
| 是否需要 Key | 通常不需要 |
| 适合用途 | 医学/生命科学期刊文章分析、PubMed/PMC 增强查询、基金和全文链接分析 |
| 官方文档 | https://europepmc.org/RestfulWebService |
| 开发者入口 | https://europepmc.org/developers |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 文章元数据 | title、author、journal、year、DOI、PMID、PMCID |
| 摘要 | abstractText |
| 全文链接 | fullTextUrlList |
| 引用 | citedByCount / citations 相关接口 |
| 基金 | grants |
| 生命科学预印本 | Europe PMC 收录预印本 |

### 常用接口

```http
# 按 ISSN 查询文章
GET https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=ISSN:{issn}&format=json

# 按 DOI 查询文章
GET https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:{doi}&format=json

# 按 PMID 查询
GET https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:{pmid}%20AND%20SRC:MED&format=json
```

### 平台字段映射

| 系统字段 | Europe PMC 来源 |
|---|---|
| pmid | pmid |
| pmcid | pmcid |
| doi | doi |
| journal_title | journalTitle |
| abstract | abstractText |
| fulltext_urls | fullTextUrlList |
| cited_by_count_europepmc | citedByCount |
| grants | grantsList |

---

## 2.11 Semantic Scholar Academic Graph API

| 项目 | 内容 |
|---|---|
| 数据类型 | 论文、作者、引用、领域信息 |
| 是否免费 | 免费 API Key；有速率限制 |
| 是否需要 Key | 建议申请 API Key |
| 适合用途 | 文章引用参考、作者关系、相似论文、领域/主题辅助分析 |
| 官方文档 | https://api.semanticscholar.org/api-docs/ |
| 产品页 | https://www.semanticscholar.org/product/api |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 文章 | title、abstract、year、venue、journal、publicationDate |
| DOI/PMID/arXiv | externalIds |
| 作者 | authors |
| 引用 | citationCount、influentialCitationCount |
| 参考文献 | references |
| 被引文献 | citations |
| 学科 | fieldsOfStudy、s2FieldsOfStudy |

### 常用接口

```http
# 按 DOI / Semantic Scholar ID 查询论文
GET https://api.semanticscholar.org/graph/v1/paper/{paper_id}?fields=title,year,venue,journal,citationCount,authors,externalIds

# 搜索论文
GET https://api.semanticscholar.org/graph/v1/paper/search?query={keyword}&fields=title,year,venue,journal,citationCount,authors,externalIds

# 批量查询论文
POST https://api.semanticscholar.org/graph/v1/paper/batch
```

### 平台字段映射

| 系统字段 | Semantic Scholar 来源 |
|---|---|
| s2_paper_id | paperId |
| citation_count_s2 | citationCount |
| influential_citation_count | influentialCitationCount |
| venue | venue / journal |
| fields_of_study | fieldsOfStudy / s2FieldsOfStudy |

### 注意

Semantic Scholar 更偏文章和作者层面，没有完整的“期刊主数据/官方期刊指标”能力，适合作为开放引用和主题分析的补充。

---

## 2.12 CORE API

| 项目 | 内容 |
|---|---|
| 数据类型 | 开放获取论文、仓储、期刊、全文链接 |
| 是否免费 | 提供免费 API，但通常需要 API Key；高强度使用需看 CORE 条款 |
| 是否需要 Key | 需要申请 API Key |
| 适合用途 | OA 全文发现、仓储论文、期刊 OA 内容补充 |
| 官方文档 | https://api.core.ac.uk/docs/v3 |
| API 说明 | https://core.ac.uk/documentation/api |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| OA 论文 | 标题、作者、摘要、DOI、年份、下载地址 |
| 期刊信息 | journal identifier、ISSN 查询 |
| 仓储信息 | repositories |
| 全文链接 | fullText / downloadUrl，取决于记录 |

### 常用接口

```http
# 按 CORE journal identifier 查询期刊，支持 issn: 前缀
GET https://api.core.ac.uk/v3/journals/{identifier}

# 搜索 works
POST https://api.core.ac.uk/v3/search/works
```

### 平台字段映射

| 系统字段 | CORE 来源 |
|---|---|
| core_journal_id | journal identifier |
| oa_fulltext_url | downloadUrl / fullText |
| repository | repository |
| article_doi | doi |

---

# 3. 付费 / 授权 / 商业 API

## 3.1 Clarivate Web of Science Journals API / JCR API

| 项目 | 内容 |
|---|---|
| 数据类型 | JCR 期刊级元数据与官方期刊指标 |
| 是否收费 | 付费/授权，通常需要 JCR 或 InCites 相关订阅及 API 权限 |
| 是否需要 Key | 需要 Clarivate API Key |
| 适合用途 | JIF、JCI、JCR 分区、学科排名、百分位、JCR 官方期刊指标展示 |
| 官方文档 | https://developer.clarivate.com/apis/wos-journal |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| JIF | Journal Impact Factor |
| JIF without self-cites | 去自引影响因子 |
| JCI | Journal Citation Indicator |
| JCR 分类 | JCR Categories |
| JCR 分区 | Quartile：Q1/Q2/Q3/Q4 |
| 学科排名 | Rank、Total Journals、Percentile |
| 总被引 | Total Cites |
| 5-year JIF | Five-year impact factor，视授权返回 |
| Immediacy Index | 即年指标 |
| Cited Half-Life | 被引半衰期 |
| Eigenfactor / AIS | 视授权返回 |

### 常用接口示例

> 具体 endpoint 和字段需以 Clarivate 授权后的 API 文档为准。

```http
# Web of Science Journals API，需 API Key
GET https://api.clarivate.com/apis/wos-journals/v1/journals
Headers:
  X-ApiKey: {clarivate_api_key}
```

### 平台字段映射

| 系统字段 | Clarivate/JCR 来源 |
|---|---|
| jif | Journal Impact Factor |
| jif_without_self_cites | JIF without self-citations |
| jci | Journal Citation Indicator |
| jcr_category | JCR Category |
| jcr_quartile | Quartile |
| jcr_rank | Rank |
| jcr_total_journals | Number of journals in category |
| jcr_percentile | Percentile |
| total_citations_jcr | Total Cites |

---

## 3.2 Clarivate Web of Science APIs

| 项目 | 内容 |
|---|---|
| 数据类型 | WoS Core Collection 文献、引用、来源信息 |
| 是否收费 | 付费/授权 |
| 是否需要 Key | 需要 Clarivate API Key |
| 适合用途 | WoS 收录文章、WoS 引用、作者机构、来源期刊核验、文献级别分析 |
| 官方 API 入口 | https://developer.clarivate.com/apis |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| WoS 文章元数据 | DOI、标题、作者、机构、来源期刊 |
| WoS 引用 | Times Cited、引用关系 |
| WoS 收录集合 | SCIE、SSCI、ESCI、AHCI 等 |
| 学科分类 | Web of Science Categories |
| 作者与机构 | Authors、Addresses、Organizations |

### 平台字段映射

| 系统字段 | WoS 来源 |
|---|---|
| is_wos | 是否 WoS 收录 |
| wos_collection | SCIE / SSCI / ESCI / AHCI |
| wos_times_cited | Times Cited |
| wos_category | Web of Science Category |
| wos_article_count | 按期刊和年份聚合 |

---

## 3.3 Elsevier Scopus APIs

| 项目 | 内容 |
|---|---|
| 数据类型 | Scopus 文献、引用、期刊来源、CiteScore 相关数据 |
| 是否收费 | API Key 可申请，但完整访问通常取决于 Scopus 订阅和 Elsevier 授权；商业使用需确认 license |
| 是否需要 Key | 需要 Elsevier API Key |
| 适合用途 | Scopus 收录、CiteScore、SNIP、SJR、ASJC 分类、Scopus 引用、文章元数据 |
| 官方开发者入口 | https://dev.elsevier.com/ |
| Scopus API Guide | https://dev.elsevier.com/guides/Scopus%20API%20Guide_V1_20230907.pdf |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| Scopus 收录状态 | Serial Title API / Search API |
| 期刊来源信息 | title、ISSN、EISSN、publisher |
| 学科分类 | ASJC code、subject area |
| CiteScore | Serial Title API 中的 CiteScore 信息，视 view 和授权 |
| SNIP / SJR | Scopus Source Metrics，视接口和授权 |
| 文献元数据 | Scopus Search API / Abstract Retrieval API |
| 引用次数 | Citation Count / Citation Overview API |
| 作者机构 | Author / Affiliation APIs |

### 常用接口

```http
# Serial Title API：按 ISSN 查期刊来源信息
GET https://api.elsevier.com/content/serial/title/issn/{issn}
Headers:
  X-ELS-APIKey: {elsevier_api_key}
  Accept: application/json

# Scopus Search API：按 ISSN 查文章
GET https://api.elsevier.com/content/search/scopus?query=ISSN({issn})
Headers:
  X-ELS-APIKey: {elsevier_api_key}
  Accept: application/json

# Abstract Retrieval：按 DOI 查 Scopus 文献详情
GET https://api.elsevier.com/content/abstract/doi/{doi}
Headers:
  X-ELS-APIKey: {elsevier_api_key}
  Accept: application/json

# Citation Count API
GET https://api.elsevier.com/content/abstract/citation-count?doi={doi}
Headers:
  X-ELS-APIKey: {elsevier_api_key}
  Accept: application/json
```

### 平台字段映射

| 系统字段 | Scopus 来源 |
|---|---|
| is_scopus | Serial Title / Scopus Search 是否有记录 |
| scopus_source_id | source-id |
| scopus_title | dc:title / source-title |
| scopus_issn / scopus_eissn | prism:issn / prism:eIssn |
| scopus_subject_area | subject-area |
| asjc_codes | ASJC |
| citescore | CiteScore 信息，视授权 |
| snip | SNIP，视授权 |
| sjr | SJR，视授权 |
| scopus_citation_count | citation-count |

---

## 3.4 Elsevier SciVal API

| 项目 | 内容 |
|---|---|
| 数据类型 | 研究绩效、机构/国家/学科分析指标 |
| 是否收费 | 付费/授权，通常依赖 SciVal 订阅 |
| 是否需要 Key | 需要 API Key 或 OIDC/HMAC 等授权方式，取决于接口版本 |
| 适合用途 | 机构表现、国家表现、合作网络、FWCI、研究主题绩效分析 |
| 官方开发者入口 | https://dev.elsevier.com/ |
| SciVal Partner API 文档 | https://partnerapi.scival.com/ |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 机构科研绩效 | outputs、citations、FWCI 等 |
| 国家/地区表现 | 国家维度论文与引用指标 |
| 合作分析 | international collaboration、academic-corporate collaboration |
| 学科/主题表现 | subject area / topic cluster |
| 作者/机构排名 | 视授权返回 |

### 平台字段映射

| 系统字段 | SciVal 来源 |
|---|---|
| institution_fwci | FWCI |
| institution_output_count | Scholarly Output |
| international_collaboration_rate | International Collaboration |
| top_institutions_by_subject | Subject/Institution metrics |

---

## 3.5 Dimensions Analytics API

| 项目 | 内容 |
|---|---|
| 数据类型 | 论文、基金、专利、临床试验、政策文献、引用、科研趋势 |
| 是否收费 | 机构订阅；部分科学计量研究项目可能可申请免费访问 |
| 是否需要 Key | 需要 Dimensions API Key / Token |
| 适合用途 | 期刊外部影响力、基金-论文-专利关联、政策影响、科研趋势、竞品分析 |
| 官方文档 | https://docs.dimensions.ai/dsl |
| API Access | https://docs.dimensions.ai/dsl/api.html |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| Publications | 文章、引用、作者、机构、期刊 |
| Grants | 基金资助项目 |
| Patents | 专利关联 |
| Clinical Trials | 临床试验 |
| Policy Documents | 政策文献引用 |
| Datasets | 数据集关联 |
| Metrics | 引用、Altmetric 相关字段，视授权 |

### 常用接口示例

```http
# 认证获取 token，具体参数以 Dimensions 授权文档为准
POST https://app.dimensions.ai/api/auth

# 使用 DSL 查询
POST https://app.dimensions.ai/api/dsl
Authorization: JWT {token}
Content-Type: application/json

search publications where journal.id = "..." return publications[doi+title+year+times_cited]
```

### 平台字段映射

| 系统字段 | Dimensions 来源 |
|---|---|
| dimensions_publication_count | publications 聚合 |
| dimensions_citation_count | times_cited |
| related_grants | grants |
| related_patents | patents |
| related_policy_documents | policy_documents |
| related_clinical_trials | clinical_trials |

---

## 3.6 Altmetric Details Page API

| 项目 | 内容 |
|---|---|
| 数据类型 | 文章在线关注度、新闻、政策、社媒、博客、维基等提及 |
| 是否收费 | 通常需要授权/订阅；研究用途可能有特殊政策，需与 Altmetric 确认 |
| 是否需要 Key | 需要 API Key / 授权 |
| 适合用途 | 期刊传播影响力、文章社会关注度、政策影响、媒体传播分析 |
| 官方 API 页面 | https://www.altmetric.com/solutions/altmetric-api/ |
| Details Page API 文档 | https://docs.altmetric.com/details-page-api/ |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| Altmetric Score | Attention Score |
| 新闻提及 | news mentions |
| 政策文献提及 | policy mentions |
| 社交媒体 | X/Twitter、Facebook、Reddit 等，视平台支持 |
| 博客/维基 | blogs、Wikipedia |
| Mendeley | readers，视接口与授权 |
| 地理分布 | mentions by country，视接口返回 |

### 常用接口示例

```http
# 按 DOI 查询，具体路径和参数以授权文档为准
GET https://api.altmetric.com/v1/doi/{doi}

# 按 PMID 查询
GET https://api.altmetric.com/v1/pmid/{pmid}
```

### 平台字段映射

| 系统字段 | Altmetric 来源 |
|---|---|
| altmetric_score | score |
| news_mentions | cited_by_posts_count / news count |
| policy_mentions | policy count |
| social_mentions | social media counts |
| wikipedia_mentions | wikipedia count |
| blog_mentions | blog count |

---

## 3.7 ISSN Portal Search API / OAI-PMH

| 项目 | 内容 |
|---|---|
| 数据类型 | 官方 ISSN 注册主数据 |
| 是否收费 | 付费订阅 |
| 是否需要 Key | 需要订阅和授权 |
| 适合用途 | 官方 ISSN-L、题名历史、出版状态、媒介类型、出版国家、官方期刊主数据 |
| ISSN Portal | https://portal.issn.org/ |
| 订阅说明 | https://portal.issn.org/subscription |
| ISSN 订阅选项 | https://www.issn.org/services/subscribe-to-the-register/subscription-options/ |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| ISSN | print/electronic ISSN |
| ISSN-L | Linking ISSN |
| 题名历史 | title changes、former titles |
| 出版状态 | active、ceased 等 |
| 出版国家 | country |
| 出版社 | publisher |
| 媒介类型 | print、online 等 |
| 官方记录 | ISSN Register record |

### 接口说明

ISSN Portal 提供 Search API、OAI-PMH 等订阅服务。Search API 遵循 SRU 标准，具体 endpoint、认证方式和返回字段需要在订阅后获取。

### 平台字段映射

| 系统字段 | ISSN Portal 来源 |
|---|---|
| issn_print | ISSN record |
| issn_online | ISSN record |
| issn_l | ISSN-L |
| title_history | title history |
| publication_status | status |
| official_publisher | publisher |
| official_country | country |

---

## 3.8 Cabells Journalytics / Predatory Reports

| 项目 | 内容 |
|---|---|
| 数据类型 | 期刊质量、投稿辅助、掠夺性期刊风险 |
| 是否收费 | 付费订阅 |
| 是否需要 Key | 如需系统集成，需与 Cabells 商务确认是否提供 API 或数据接口 |
| 适合用途 | 期刊风险识别、掠夺性期刊排查、期刊质量维度补充 |
| Predatory Reports | https://cabells.com/solutions/predatory-reports |
| Criteria | https://cabells.com/predatory-criteria-v1.1 |

### 可以获取的信息

| 信息 | 字段/说明 |
|---|---|
| 是否在 Predatory Reports | 风险判断 |
| 违规/风险项 | publication practices、peer review、business practices 等 |
| Journalytics 信息 | 投稿辅助、期刊质量、指标，视订阅产品 |
| 风险证据 | 具体 criteria，视订阅返回 |

### 平台字段映射

| 系统字段 | Cabells 来源 |
|---|---|
| cabells_status | listed / not listed / unknown |
| predatory_risk_level | 风险等级 |
| predatory_criteria | 违规 criteria |
| journal_quality_notes | Journalytics 质量说明 |

---

## 3.9 Elsevier Embase API / Engineering Village API

| 项目 | 内容 |
|---|---|
| 数据类型 | 生物医学/工程专业数据库 |
| 是否收费 | 付费/授权 |
| 是否需要 Key | 需要 Elsevier API Key 和产品授权 |
| 适合用途 | 医学期刊 Embase 收录、工程期刊 Ei/Compendex 收录、专业数据库覆盖分析 |
| Elsevier Developer Portal | https://dev.elsevier.com/ |

### 可以获取的信息

| 数据源 | 适合字段 |
|---|---|
| Embase | 生物医学文献、Emtree 主题词、药物/疾病索引、期刊覆盖 |
| Engineering Village | Ei Compendex、工程文献、工程主题、会议/期刊覆盖 |

### 平台字段映射

| 系统字段 | 来源 |
|---|---|
| is_embase | Embase |
| is_ei_compendex | Engineering Village / Ei |
| emtree_terms | Embase |
| engineering_subject_terms | Engineering Village |

---

# 4. 不建议作为 API 依赖的数据源

| 网站/平台 | 原因 | 建议 |
|---|---|---|
| SCImago Journal & Country Rank | 免费网页可查 SJR、H-index、Quartile，但没有明确适合商业批量集成的官方开放 API | 可人工参考，不建议批量抓取作为核心数据源 |
| LetPub | 第三方整理数据，投稿经验有价值，但不适合作为权威 API 数据源 | 仅作为人工参考 |
| MedSci | 偏医学选刊和投稿经验，数据需核验 | 仅作为人工参考 |
| Web of Science Master Journal List 免费网页 | 可人工核验 WoS 收录，但批量/系统级 API 应走 Clarivate 授权 | 用于人工核验，系统接入走 Clarivate API |
| Google Scholar | 无官方开放 API，抓取风险高 | 不建议接入 |
| JournalGuide / Edanz 等选刊平台 | 多为工具型平台，数据授权不清 | 只做参考，不做主数据 |

---

# 5. 按功能选择 API 的建议

## 5.1 期刊基础信息

| 优先级 | 数据源 | 说明 |
|---|---|---|
| P0 | Crossref | 期刊名、ISSN、出版社、文章列表 |
| P0 | DOAJ | OA 期刊、APC、license、DOAJ Seal |
| P0 | OpenAlex | Source ID、发文量、引用参考、主题 |
| P1 | NLM Catalog | 医学期刊 NLM/PubMed/PMC 信息 |
| P2 | ISSN Portal | 官方 ISSN 主数据，付费 |

## 5.2 文章元数据与发文量

| 优先级 | 数据源 | 说明 |
|---|---|---|
| P0 | Crossref | DOI、标题、作者、年份、卷期页 |
| P0 | OpenAlex | 文章列表、引用参考、作者机构国家 |
| P1 | PubMed / Europe PMC | 医学文章增强数据 |
| P1 | DataCite | 数据集、软件、预印本 DOI |
| P2 | Scopus / WoS | 权威数据库文章与引用，付费 |

## 5.3 收录状态

| 收录类型 | 推荐来源 |
|---|---|
| DOAJ | DOAJ API / dump |
| PubMed | NCBI E-utilities：db=pubmed |
| PMC | NCBI E-utilities：db=pmc |
| MEDLINE / NLM | NLM Catalog / PubMed records |
| WoS / SCIE / SSCI / ESCI / AHCI | Clarivate / MJL 人工核验 / WoS API 付费 |
| Scopus | Elsevier Scopus Serial Title API / Scopus API 付费 |
| Embase | Elsevier Embase 授权 |
| Ei Compendex | Elsevier Engineering Village 授权 |

## 5.4 影响力指标

| 指标 | 推荐来源 | 免费/付费 |
|---|---|---|
| JIF | Clarivate JCR | 付费 |
| JCR Quartile | Clarivate JCR | 付费 |
| JCI | Clarivate JCR | 付费 |
| CiteScore | Scopus | 授权/付费，网页可免费查看但系统接入需确认 |
| SNIP | Scopus | 授权/付费 |
| SJR | Scopus / SCImago | SCImago 可人工参考，系统集成需确认授权 |
| OpenAlex cited_by_count | OpenAlex | Freemium/开放参考 |
| Open citation count | OpenCitations | 免费开放参考 |
| Semantic Scholar citationCount | Semantic Scholar | 免费参考 |

## 5.5 OA 与全文

| 功能 | 推荐来源 |
|---|---|
| 是否 OA 期刊 | DOAJ |
| 是否 OA 文章 | Unpaywall |
| OA 类型 | Unpaywall |
| 免费 PDF | Unpaywall / CORE / Europe PMC |
| License | Unpaywall / Crossref / DOAJ |
| APC | DOAJ / 官网维护 / OpenAPC |

## 5.6 作者、机构、国家

| 功能 | 推荐来源 |
|---|---|
| 作者信息 | OpenAlex / ORCID / PubMed |
| ORCID | ORCID Public API / Crossref / OpenAlex |
| 机构标准化 | ROR |
| 国家分布 | OpenAlex + ROR |
| 医学作者机构 | PubMed / Europe PMC |
| 权威商业分析 | Scopus / SciVal / Dimensions |

---

# 6. 建议的数据接入优先级

## 第一阶段：免费数据 MVP

| 接入顺序 | 数据源 | 目标功能 |
|---|---|---|
| 1 | Crossref | 期刊基础信息、文章列表、发文量 |
| 2 | OpenAlex | 发文趋势、引用趋势参考、作者机构国家分析 |
| 3 | DOAJ | OA 期刊、APC、License、DOAJ Seal |
| 4 | Unpaywall | 文章 OA 状态、全文链接、OA 比例 |
| 5 | NCBI E-utilities | PubMed、PMC、PMID、PMCID、MeSH |
| 6 | ROR | 机构清洗、国家分析 |
| 7 | OpenCitations | 开放引用网络 |
| 8 | Europe PMC | 医学/生命科学增强 |

## 第二阶段：付费权威指标

| 接入顺序 | 数据源 | 目标功能 |
|---|---|---|
| 1 | Clarivate JCR / WoS Journals API | JIF、JCR分区、JCI、JCR排名 |
| 2 | Elsevier Scopus API | Scopus收录、CiteScore、SNIP、SJR、Scopus引用 |
| 3 | ISSN Portal | 官方 ISSN 主数据、题名历史 |
| 4 | Altmetric | 新闻、政策、社媒传播影响 |
| 5 | Dimensions | 基金、专利、临床、政策、科研趋势 |

## 第三阶段：自有运营数据打通

| 接入顺序 | 数据源 | 目标功能 |
|---|---|---|
| 1 | 投稿系统 | 投稿量、接收率、拒稿率、国家分布 |
| 2 | 审稿系统 | 审稿周期、审稿人接受率、超期预警 |
| 3 | 官网统计 | 浏览量、下载量、来源渠道 |
| 4 | 邮件系统 | 打开率、点击率、投稿转化 |
| 5 | 财务系统 | APC收入、减免、成本、利润 |

---

# 7. 建议数据库中的数据源记录表

## journal_data_source_log

```sql
CREATE TABLE journal_data_source_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    journal_id BIGINT NOT NULL,
    source_name VARCHAR(100) NOT NULL COMMENT 'Crossref/OpenAlex/DOAJ/NCBI/JCR/Scopus 等',
    source_type VARCHAR(50) NOT NULL COMMENT 'free/paid/internal/manual',
    source_url VARCHAR(1000) NULL,
    api_endpoint VARCHAR(1000) NULL,
    query_params JSON NULL,
    response_hash VARCHAR(64) NULL,
    fetched_at DATETIME NOT NULL,
    status VARCHAR(30) NOT NULL COMMENT 'success/failed/partial',
    error_message TEXT NULL,
    raw_response_path VARCHAR(1000) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## journal_external_ids

```sql
CREATE TABLE journal_external_ids (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    journal_id BIGINT NOT NULL,
    id_type VARCHAR(50) NOT NULL COMMENT 'issn_print/issn_online/issn_l/openalex_source_id/scopus_source_id/wos_id/nlm_id/doaj_id',
    id_value VARCHAR(255) NOT NULL,
    source_name VARCHAR(100) NULL,
    verified_status VARCHAR(30) DEFAULT 'unverified',
    verified_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_journal_id_type_value (journal_id, id_type, id_value)
);
```

## journal_api_sync_task

```sql
CREATE TABLE journal_api_sync_task (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_name VARCHAR(100) NOT NULL,
    source_name VARCHAR(100) NOT NULL,
    sync_scope VARCHAR(50) NOT NULL COMMENT 'journal/article/metric/indexing/oa/citation',
    sync_mode VARCHAR(50) NOT NULL COMMENT 'full/incremental/manual',
    schedule_cron VARCHAR(100) NULL,
    last_success_at DATETIME NULL,
    last_failed_at DATETIME NULL,
    last_error TEXT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

# 8. 技术实现建议

## 8.1 接口调用策略

| 策略 | 说明 |
|---|---|
| 先标准化 ISSN | 统一去掉空格、补连字符、校验校验位 |
| ISSN 优先于期刊名 | 期刊名会变，ISSN 更稳定 |
| print ISSN 和 eISSN 都查 | 很多 API 只识别其中一个 |
| 保留原始响应 | 方便追溯、复核、重跑 |
| 每个字段记录来源 | 同一字段多来源时要有优先级 |
| 免费数据加缓存 | 避免触发限流 |
| 付费数据按年快照 | JCR、CiteScore 等年度指标不需要频繁请求 |
| 指标明确标注来源 | JCR、Scopus、OpenAlex、OpenCitations 不可混用 |

## 8.2 字段可信度优先级

| 字段类型 | 优先级建议 |
|---|---|
| 官方 ISSN | ISSN Portal > NLM Catalog > Crossref/DOAJ/OpenAlex |
| 期刊名 | ISSN Portal > 期刊官网 > Crossref/DOAJ/OpenAlex |
| JIF/JCR分区 | Clarivate JCR 唯一权威来源 |
| CiteScore/SNIP | Elsevier Scopus 唯一权威来源 |
| PubMed/PMC | NCBI / Europe PMC |
| OA期刊 | DOAJ |
| OA文章 | Unpaywall |
| 机构标准化 | ROR |
| 开放引用 | OpenAlex / OpenCitations / Semantic Scholar，仅作参考 |

---

# 9. 一句话落地方案

第一版可以先接入：

```text
Crossref + OpenAlex + DOAJ + Unpaywall + NCBI + ROR + OpenCitations
```

先实现：

```text
期刊基础信息、收录状态、发文趋势、开放引用参考、OA状态、APC、作者机构国家分布
```

第二版再接入：

```text
Clarivate JCR + Elsevier Scopus + ISSN Portal + Altmetric + Dimensions
```

实现：

```text
JIF、JCR分区、JCI、CiteScore、Scopus引用、官方ISSN主数据、传播影响、科研趋势
```
