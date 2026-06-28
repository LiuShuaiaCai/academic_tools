// cloudfunctions/journalAPI/index.js
// 期刊分析云函数 - 独立服务（基于OpenAlex/Crossref/DOAJ/NCBI多源数据）

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

// 引入同步逻辑模块
const { syncFromOpenAlex, supplementFromCrossref, supplementDOAJAndNCBI } = require('./journal-sync');

// 引入数据库迁移模块
const { migrateJournals, extractSubjectFromTopics } = require('./migrate-schema');

// ==================== 云函数接口实现 ====================

/**
 * 搜索期刊
 */
async function searchJournals(event, wxContext) {
  const { keyword, page = 1, pageSize = 20, filters = {} } = event;
  
  try {
    // 1. 优先从本地数据库查询（有筛选条件或首次加载时也会走这里）
    const hasActiveFilters = filters.is_oa !== undefined && filters.is_oa !== null
      || filters.is_in_doaj === true || filters.is_medline === true
      || filters.is_pmc_journal === true || filters.subject;

    if (!keyword || hasActiveFilters) {
      let query = {};
      
      // 应用筛选条件
      if (filters.subject) {
        const subjectIds = await db.collection('journal_subject')
          .where({ subject_name: _.eq(filters.subject) })
          .field({ journal_id: true })
          .get();
        const journalIds = subjectIds.data.map(s => s.journal_id);
        query._id = _.in(journalIds);
      }
      
      if (filters.is_oa !== undefined && filters.is_oa !== null) {
        query.is_open_access = filters.is_oa;
      }
      
      if (filters.is_in_doaj !== undefined && filters.is_in_doaj !== null) {
        query.is_in_doaj = filters.is_in_doaj;
      }
      
      if (filters.is_medline !== undefined && filters.is_medline !== null) {
        query.is_medline_current = filters.is_medline;
      }
      
      if (filters.is_pmc_journal !== undefined && filters.is_pmc_journal !== null) {
        query.is_pmc_journal = filters.is_pmc_journal;
      }
      
      const skip = (page - 1) * pageSize;
      const sortField = event.sortBy === 'cited_by_count' ? 'cited_by_count_latest' : 'works_count_latest';
      
      const totalResult = await db.collection('journals').where(query).count();
      
      // 本地有数据 → 直接返回
      if (totalResult.total > 0) {
        const result = await db.collection('journals')
          .where(query)
          .skip(skip)
          .limit(pageSize)
          .orderBy(sortField, 'desc')
          .get();
        
        return {
          code: 0,
          data: {
            total: totalResult.total,
            page,
            per_page: pageSize,
            journals: result.data
          }
        };
      }
      
      // 有筛选条件但本地没数据 → 返回空
      if (hasActiveFilters) {
        return { code: 0, data: { total: 0, page: 1, per_page: pageSize, journals: [] } };
      }
      
      // 无筛选条件且本地数据库为空 → fallback 到 OpenAlex
      console.log('[searchJournals] 本地数据库为空，从OpenAlex获取热门期刊...');
    }
    
    // 2. 从 OpenAlex API 获取数据（有keyword 或 本地数据库为空时）
    const apiKeyword = keyword || 'Nature';  // 无关键词时用 Nature 获取热门期刊
    const searchUrl = `https://api.openalex.org/sources?search=${encodeURIComponent(apiKeyword)}&per_page=${pageSize}&page=${page}&mailto=liushuaicai66@gmail.com`;
    const result = await httpGet(searchUrl);
    
    if (result.statusCode !== 200 || !result.data) {
      return { code: -1, message: '搜索失败，无法连接OpenAlex' };
    }
    
    // 转换为前端可用格式
    const journals = result.data.results.map(s => ({
      _id: s.id.replace('https://openalex.org/', ''),
      openalex_id: s.id.replace('https://openalex.org/', ''),
      title: s.display_name,
      title_abbrev: s.alternate_titles && s.alternate_titles.length > 0 ? s.alternate_titles[0] : '',
      issn_print: s.issns && s.issns.length > 0 ? s.issns[0] : '',
      issn_online: s.issns && s.issns.length > 1 ? s.issns[1] : '',
      publisher: s.publisher || '',
      country: s.country_code ? s.country_code.toUpperCase() : '',
      language: '',
      works_count_latest: s.works_count || 0,
      cited_by_count_latest: s.cited_by_count || 0,
      h_index_latest: (s.summary_stats && s.summary_stats.h_index) || 0,
      i10_index_latest: (s.summary_stats && s.summary_stats.i10_index) || 0,
      two_year_mean_citedness_latest: (s.summary_stats && s.summary_stats['2yr_mean_citedness']) || 0,
      is_open_access: s.is_oa || false,
      is_in_doaj: s.is_in_doaj || false,
      is_medline_current: false,
      is_medline_current_or_previous: false,
      is_pmc_journal: false,
      is_pmc_forthcoming: false,
      pubmed_article_count: 0,
      pmc_article_count: 0,
      nlm_id: '',
      has_pmid: false,
      has_pmc: false,
      pmid_count: 0,
      pmc_count: 0,
      homepage_url: s.homepage_url || '',
      submission_url: '',
      top_topics: s.top_topics || [],

      // ---- 新增字段（默认值）----
      subject_category: [],
      subject_subcategory: [],
      impact_factor: null,
      if_year: null,
      jcr_quartile: '',
      jcr_year: null,
      cas_quartile: '',
      cas_year: null,
      cas_edition: '',
      acceptance_rate: null,
      review_cycle: '',
      first_decision_days: null,
      self_citation_rate: null,
      metrics_source: '',
      metrics_verified: false
    }));
    
    return {
      code: 0,
      data: {
        total: result.data.meta.total || journals.length,
        page: result.data.meta.page || 1,
        per_page: result.data.meta.per_page || pageSize,
        journals: journals
      }
    };
  } catch (err) {
    console.error('[searchJournals] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 获取期刊详情
 */
async function getJournalDetail(event, wxContext) {
  const { journalId, openalexId } = event;
  
  try {
    // 查询主表
    let query = {};
    if (journalId) {
      query._id = journalId;
    } else if (openalexId) {
      query.openalex_id = openalexId;
    } else {
      return { code: -1, message: '缺少期刊ID' };
    }
    
    const journal = await db.collection('journals').where(query).get();
    if (journal.data.length === 0) {
      return { code: -1, message: '期刊不存在' };
    }
    
    const journalData = journal.data[0];
    
    // 查询学科分类
    const subjects = await db.collection('journal_subject')
      .where({ journal_id: journalData._id })
      .get();
    
    // 查询年度统计
    const metrics = await db.collection('journal_metrics_yearly')
      .where({ journal_id: journalData._id })
      .orderBy('year', 'asc')
      .get();
    
    // 格式化 topics（学科主题）
    const topics = subjects.data.map(s => ({
      display_name: s.subject_name,
      count: s.works_count || s.count || 0
    }));

    // 格式化 yearlyData（年度趋势数据）
    const yearlyData = metrics.data
      .filter(m => m.year >= 1900 && m.year <= 2099)
      .map(m => ({
        year: m.year,
        works_count: m.works_count || 0,
        cited_by_count: m.cited_by_count || 0,
        research_articles: m.research_articles || null,
        review_articles: m.review_articles || null
      })).sort((a, b) => b.year - a.year);

    return {
      code: 0,
      data: {
        journal: journalData,
        yearlyData: yearlyData,
        topics: topics
      }
    };
  } catch (err) {
    console.error('[getJournalDetail] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 对比期刊
 */
async function compareJournals(event, wxContext) {
  const { ids } = event; // ids数组
  
  try {
    if (!ids || ids.length < 2 || ids.length > 5) {
      return { code: -1, message: '请选择2-5本期刊进行对比' };
    }
    
    const journals = await db.collection('journals')
      .where({ _id: _.in(ids) })
      .get();
    
    return {
      code: 0,
      data: {
        journals: journals.data
      }
    };
  } catch (err) {
    console.error('[compareJournals] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 智能选荐
 */
async function recommendJournals(event, wxContext) {
  const { filters = {} } = event;
  const { subject, oaPreference, is_oa, is_medline, is_pmc_journal, min_works, min_cited } = filters;
  
  try {
    let query = {};
    
    // 按学科筛选
    if (subject) {
      const subjectIds = await db.collection('journal_subject')
        .where({ subject_name: _.eq(subject) })
        .field({ journal_id: true })
        .get();
      const journalIds = subjectIds.data.map(s => s.journal_id);
      query._id = _.in(journalIds);
    }
    
    // 按OA偏好筛选
    if (oaPreference === 'oa_only') {
      query.is_open_access = true;
    } else if (oaPreference === 'non_oa_only') {
      query.is_open_access = false;
    } else if (is_oa !== undefined && is_oa !== null) {
      query.is_open_access = is_oa;
    }
    
    // NCBI筛选
    if (is_medline !== undefined && is_medline !== null) {
      query.is_medline_current = is_medline;
    }
    if (is_pmc_journal !== undefined && is_pmc_journal !== null) {
      query.is_pmc_journal = is_pmc_journal;
    }
    
    // 数值筛选
    if (min_works !== undefined && min_works !== null && min_works !== '') {
      query.works_count_latest = _.gte(parseInt(min_works));
    }
    if (min_cited !== undefined && min_cited !== null && min_cited !== '') {
      query.cited_by_count_latest = _.gte(parseInt(min_cited));
    }
    
    const result = await db.collection('journals')
      .where(query)
      .limit(20)
      .orderBy('works_count_latest', 'desc')
      .get();
    
    return {
      code: 0,
      data: {
        journals: result.data
      }
    };
  } catch (err) {
    console.error('[recommendJournals] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 获取预警期刊列表
 */
async function getWarningJournals(event, wxContext) {
  const { filters = {} } = event;
  
  try {
    let query = {};
    
    if (filters.status) {
      query.status = filters.status;
    } else {
      // 默认显示生效中的预警
      query.status = 'active';
    }
    
    if (filters.warning_level) {
      query.warning_level = filters.warning_level;
    }
    
    const warnings = await db.collection('journal_warnings')
      .where(query)
      .orderBy('warning_level', 'desc')
      .get();
    
    // 关联期刊信息
    const journalIds = warnings.data.map(w => w.journal_id);
    const journals = await db.collection('journals')
      .where({ _id: _.in(journalIds) })
      .field({ _id: true, title: true, issn_print: true, publisher: true })
      .get();
    
    const journalMap = {};
    journals.data.forEach(j => {
      journalMap[j._id] = j;
    });
    
    return {
      code: 0,
      data: {
        warnings: warnings.data.map(w => ({
          ...w,
          journal: journalMap[w.journal_id] || null
        }))
      }
    };
  } catch (err) {
    console.error('[getWarningJournals] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 获取期刊文章列表（走OpenAlex API）
 */
async function getJournalArticles(event, wxContext) {
  const { openalexId, page = 1, perPage = 20, sort = 'publication_date:desc' } = event;
  
  try {
    if (!openalexId) {
      return { code: -1, message: '缺少OpenAlex ID' };
    }
    
    // 直接调用 OpenAlex API
    const url = `https://api.openalex.org/works?filter=primary_location.source.id:${openalexId}&sort=${sort}&per_page=${perPage}&page=${page}&mailto=liushuaicai66@gmail.com`;
    const result = await httpGet(url);
    
    if (result.statusCode !== 200 || !result.data) {
      return { code: -1, message: '获取文章列表失败' };
    }
    
    return {
      code: 0,
      data: {
        total: result.data.meta.total,
        page: result.data.meta.page,
        per_page: result.data.meta.per_page,
        articles: result.data.results.map(work => ({
          id: work.id ? work.id.replace('https://openalex.org/', '') : '',
          doi: work.doi || '',
          title: work.title || '',
          publication_date: work.publication_date || '',
          year: work.publication_date ? parseInt(work.publication_date.substring(0, 4)) : null,
          authors: work.authorships ? work.authorships.map(a => ({
            name: a.author.display_name,
            position: a.author_position
          })) : [],
          cited_by_count: work.cited_by_count || 0,
          type: work.type || '',
          open_access: work.open_access || {}
        }))
      }
    };
  } catch (err) {
    console.error('[getJournalArticles] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

// ==================== HTTP 工具函数 ====================

function httpGetOnce(url, timeout = 15000) {
  const https = require('https');
  const http = require('http');
  
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      
      if (res.statusCode !== 200) {
        resolve({ statusCode: res.statusCode, data: null });
        res.resume();
        return;
      }
      
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: 200, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: 200, data: data });
        }
      });
    });
    
    req.on('error', (err) => {
      reject(new Error(`请求失败: ${err.message}`));
    });
    
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

async function httpGet(url, timeout = 15000, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
      }
      const result = await httpGetOnce(url, timeout);
      return result;
    } catch (err) {
      lastErr = err;
      console.log(`[httpGet] 第${attempt + 1}次失败:`, err.message);
    }
  }
  throw lastErr;
}

/**
 * 期刊综合分析（指标计算）
 * 返回：健康评分、收录指数、增长趋势、影响力雷达等
 */
async function getJournalAnalytics(event, wxContext) {
  const { journalId } = event;
  
  try {
    if (!journalId) {
      return { code: -1, message: '缺少期刊ID' };
    }
    
    const journal = await db.collection('journals').where({ _id: journalId }).get();
    if (journal.data.length === 0) {
      return { code: -1, message: '期刊不存在' };
    }
    
    const j = journal.data[0];
    
    // 1. 计算健康评分（0-100）
    let healthScore = 50; // 基础分
    
    // 收录加分（最高+25）
    if (j.is_in_doaj) healthScore += 8;
    if (j.is_medline_current) healthScore += 10;
    if (j.is_pmc_journal) healthScore += 7;
    
    // 影响力加分（最高+25）
    if (j.h_index_latest > 100) healthScore += 8;
    else if (j.h_index_latest > 50) healthScore += 5;
    else if (j.h_index_latest > 20) healthScore += 3;
    
    if (j.two_year_mean_citedness_latest > 5) healthScore += 8;
    else if (j.two_year_mean_citedness_latest > 2) healthScore += 5;
    else if (j.two_year_mean_citedness_latest > 0.5) healthScore += 3;
    
    if (j.i10_index_latest > 1000) healthScore += 9;
    else if (j.i10_index_latest > 100) healthScore += 6;
    else if (j.i10_index_latest > 10) healthScore += 3;
    
    // OA透明度加分（最高+5）
    if (j.is_open_access) healthScore += 5;
    
    // 出版社信誉（有知名出版社的加分）
    if (j.publisher) healthScore += 3;
    
    healthScore = Math.min(100, healthScore);
    
    // 2. 收录覆盖评分（0-100）
    let indexingScore = 0;
    if (j.is_in_doaj) indexingScore += 20;
    if (j.is_medline_current) indexingScore += 30;
    if (j.is_pmc_journal) indexingScore += 20;
    if (j.nlm_id) indexingScore += 15;
    if (j.pubmed_article_count > 0) indexingScore += 10;
    if (j.pmc_article_count > 0) indexingScore += 5;
    indexingScore = Math.min(100, indexingScore);
    
    // 3. 影响力雷达数据（5个维度，按百分位归一化）
    const metrics = await db.collection('journal_metrics_yearly')
      .where({ journal_id: journalId })
      .orderBy('year', 'asc')
      .get();
    
    const numYears = metrics.data.length || 1;
    
    // 计算年均发文增速
    let growthRate = 0;
    if (metrics.data.length >= 2) {
      const firstYear = metrics.data[0];
      const lastYear = metrics.data[metrics.data.length - 1];
      const workGrowth = lastYear.works_count - firstYear.works_count;
      growthRate = firstYear.works_count > 0 
        ? parseFloat(((workGrowth / firstYear.works_count) / (numYears - 1) * 100).toFixed(1))
        : 0;
    }
    
    // 篇均被引（最新年）
    const latestMetric = metrics.data.length > 0 ? metrics.data[metrics.data.length - 1] : {};
    const cpp = latestMetric.works_count > 0 
      ? parseFloat((latestMetric.cited_by_count / latestMetric.works_count).toFixed(2))
      : 0;
    
    // 4. 影响力雷达（5维归一化 0-100）
    const worksRank = Math.min(100, Math.round((j.works_count_latest || 0) / 100));
    const citedRank = Math.min(100, Math.round((j.cited_by_count_latest || 0) / 500));
    const hIndexRank = Math.min(100, Math.round((j.h_index_latest || 0) * 2));
    const citednessRank = Math.min(100, Math.round((j.two_year_mean_citedness_latest || 0) * 20));
    const indexingRank = indexingScore;
    
    return {
      code: 0,
      data: {
        healthScore,
        indexingScore,
        growthRate,
        cpp,
        totalYears: numYears,
        radar: {
          labels: ['发文量', '总被引', 'h指数', '2年均引', '收录覆盖'],
          values: [worksRank, citedRank, hIndexRank, citednessRank, indexingRank]
        },
        suggestion: generateSuggestion(healthScore, indexingScore, j)
      }
    };
  } catch (err) {
    console.error('[getJournalAnalytics] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

function generateSuggestion(healthScore, indexingScore, journal) {
  if (healthScore >= 80) {
    return {
      level: 'excellent',
      levelText: '强烈推荐',
      color: '#059669',
      text: '该期刊综合质量优秀，收录范围广、学术影响力高，是投稿的优先选择。'
    };
  }
  if (healthScore >= 60) {
    const tips = [];
    if (!journal.is_medline_current) tips.push('建议关注该期刊是否能被MEDLINE收录');
    if (!journal.is_open_access) tips.push('非OA期刊，需确认投稿费用政策');
    return {
      level: 'good',
      levelText: '值得考虑',
      color: '#F59E0B',
      text: '该期刊整体质量良好。' + (tips.length > 0 ? ' ' + tips.join('。') : '')
    };
  }
  if (healthScore >= 40) {
    return {
      level: 'caution',
      levelText: '需谨慎',
      color: '#EF4444',
      text: '该期刊影响力较低，收录范围有限。若非开源期刊且收费较高，建议仔细评估后再投稿。'
    };
  }
  return {
    level: 'avoid',
    levelText: '不推荐',
    color: '#DC2626',
    text: '该期刊学术影响力极低，缺乏主流数据库收录，建议优先选择其他期刊。'
  };
}

/**
 * 获取学科分类树
 */
async function getSubjects(event, wxContext) {
  const { level } = event;
  
  try {
    let query = {};
    if (level) {
      query.subject_level = level;
    }
    
    const subjects = await db.collection('journal_subject')
      .where(query)
      .distinct('subject_name')
      .get();
    
    return {
      code: 0,
      data: subjects.list || []
    };
  } catch (err) {
    console.error('[getSubjects] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 添加期刊（管理员）
 */
async function addJournal(event, wxContext) {
  const { journalData } = event;
  
  try {
    const now = new Date();
    const data = {
      ...journalData,
      created_at: now,
      updated_at: now,
      last_synced_at: now
    };
    
    const result = await db.collection('journals').add({ data });
    
    return {
      code: 0,
      data: { _id: result._id }
    };
  } catch (err) {
    console.error('[addJournal] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 更新期刊（管理员）
 */
async function updateJournal(event, wxContext) {
  const { journalId, updates } = event;
  
  try {
    const now = new Date();
    await db.collection('journals').doc(journalId).update({
      data: {
        ...updates,
        updated_at: now
      }
    });
    
    return { code: 0, message: '更新成功' };
  } catch (err) {
    console.error('[updateJournal] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 添加学科分类（管理员）
 */
async function addJournalSubject(event, wxContext) {
  const { journalId, subjectData } = event;
  
  try {
    const now = new Date();
    const data = {
      journal_id: journalId,
      ...subjectData,
      created_at: now
    };
    
    const result = await db.collection('journal_subject').add({ data });
    
    return {
      code: 0,
      data: { _id: result._id }
    };
  } catch (err) {
    console.error('[addJournalSubject] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 添加年度指标（管理员，二期功能）
 */
async function addJournalMetrics(event, wxContext) {
  const { journalId, metricsData } = event;
  
  try {
    const now = new Date();
    const data = {
      journal_id: journalId,
      ...metricsData,
      created_at: now
    };
    
    const result = await db.collection('journal_metrics_yearly').add({ data });
    
    return {
      code: 0,
      data: { _id: result._id }
    };
  } catch (err) {
    console.error('[addJournalMetrics] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

/**
 * 初始化数据库
 */
async function initDatabase(event, wxContext) {
  try {
    const collections = ['journals', 'journal_subject', 'journal_metrics_yearly', 'journal_warnings'];
    
    for (const collection of collections) {
      try {
        await db.createCollection(collection);
        console.log(`创建集合: ${collection}`);
      } catch (err) {
        console.log(`集合已存在: ${collection}`);
      }
    }
    
    return { code: 0, message: '数据库初始化完成' };
  } catch (err) {
    console.error('[initDatabase] Error:', err.message);
    return { code: -1, message: err.message };
  }
}

// ==================== 主入口 ====================

exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();

  const actionMap = {
    // 期刊查询
    searchJournals: searchJournals,
    getJournalDetail: getJournalDetail,
    getJournalAnalytics: getJournalAnalytics,
    compareJournals: compareJournals,
    recommendJournals: recommendJournals,
    getWarningJournals: getWarningJournals,
    getJournalArticles: getJournalArticles,
    getSubjects: getSubjects,
    
    // 数据同步（三步走策略）
    // Step 1: 从 OpenAlex 批量拉取基础数据（新增+更新）
    syncFromOpenAlex: function(event, wxContext) {
      return syncFromOpenAlex(event, db, _);
    },
    // Step 2: 根据 ISSN 从 Crossref 补充数据（只更新）
    supplementFromCrossref: function(event, wxContext) {
      return supplementFromCrossref(event, db, _);
    },
    // Step 3: DOAJ/NCBI 细节补充（可选，慢速）
    supplementDOAJAndNCBI: function(event, wxContext) {
      return supplementDOAJAndNCBI(event, db, _);
    },
    
    // 数据管理
    addJournal: addJournal,
    updateJournal: updateJournal,
    addJournalSubject: addJournalSubject,
    addJournalMetrics: addJournalMetrics,
    
    // 数据库迁移
    migrateJournals: migrateJournals,
    extractSubjectFromTopics: extractSubjectFromTopics,
    
    // 初始化
    initDatabase: initDatabase
  };

  const handler = actionMap[action];
  if (!handler) {
    return { code: -1, message: '未知操作: ' + action };
  }

  try {
    return await handler(event, wxContext);
  } catch (err) {
    console.error('[main] Error:', err.message);
    return { code: -1, message: '系统错误: ' + err.message };
  }
};
