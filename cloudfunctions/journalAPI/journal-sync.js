// cloudfunctions/journalAPI/journal-sync.js
// 期刊数据同步 - 三步走策略
//
// Step 1: syncFromOpenAlex - 批量拉取 OpenAlex 基础数据（新增+更新）
// Step 2: supplementFromCrossref - 根据 ISSN 补充 Crossref 数据（只更新）
// Step 3: supplementDOAJAndNCBI - 慢慢补充 DOAJ/NCBI 细节（可选，单独执行）

const https = require('https');
const http = require('http');

// ==================== HTTP 工具 ====================

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

function httpGetOnce(url, timeout = 15000) {
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== API 调用函数 ====================

/**
 * 从 OpenAlex 分页拉取期刊列表（cursor 翻页）
 */
async function fetchPageFromOpenAlex(cursor, perPage, filter) {
  perPage = perPage || 200;
  filter = filter || 'type:journal';
  let url = `https://api.openalex.org/sources?filter=${filter}&per_page=${perPage}&mailto=liushuaicai66@gmail.com`;
  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`;
  }

  try {
    const result = await httpGet(url, 30000);
    if (result.statusCode !== 200 || !result.data) {
      console.log(`[OpenAlex分页] 状态码: ${result.statusCode}`);
      return null;
    }

    return {
      results: result.data.results || [],
      total: (result.data.meta && result.data.meta.total) || 0,
      next_cursor: (result.data.meta && result.data.meta.next_cursor) || null
    };
  } catch (err) {
    console.error('[fetchPageFromOpenAlex] Error:', err.message);
    return null;
  }
}

/**
 * 从 Crossref 分页拉取期刊列表（offset 翻页）
 */
async function fetchPageFromCrossref(offset, rows) {
  offset = offset || 0;
  rows = rows || 100;
  const url = `https://api.crossref.org/journals?offset=${offset}&rows=${rows}&mailto=liushuaicai66@gmail.com`;

  try {
    const result = await httpGet(url, 30000);
    if (result.statusCode !== 200 || !result.data) {
      console.log(`[Crossref分页] 状态码: ${result.statusCode}`);
      return null;
    }

    const msg = result.data;
    if (!msg.message || !msg.message.items) {
      return null;
    }

    return {
      results: msg.message.items || [],
      total: (msg.message['total-results']) || 0,
      offset: (msg.message['items-per-page']) ? offset + (msg.message.items.length) : 0,
      per_page: msg.message['items-per-page'] || rows
    };
  } catch (err) {
    console.error('[fetchPageFromCrossref] Error:', err.message);
    return null;
  }
}

/**
 * 从 DOAJ 查询期刊信息（按 ISSN）
 */
async function fetchJournalFromDOAJ(issn) {
  const url = `https://doaj.org/api/v4/search/journals?query=${issn}&pageSize=1`;
  
  try {
    const result = await httpGet(url);
    if (result.statusCode !== 200 || !result.data) {
      return null;
    }
    
    const journals = result.data.results;
    if (!journals || journals.length === 0) {
      return null;
    }
    
    const journal = journals[0].bibjson;
    return {
      is_in_doaj: true,
      language: journal.language && journal.language.length > 0 ? journal.language[0] : '',
      country: journal.publisher.country || '',
      apc_amount: journal.apc && journal.apc.max && journal.apc.max.length > 0 ? journal.apc.max[0].price : 0,
      currency: journal.apc && journal.apc.max && journal.apc.max.length > 0 ? journal.apc.max[0].currency : '',
      license: journal.license && journal.license.length > 0 ? journal.license[0].type : '',
      website_url: journal.ref ? (journal.ref.journal || '') : '',
      submission_url: journal.ref ? (journal.ref.author_instructions || '') : '',
      subjects: journal.subject || []
    };
  } catch (err) {
    console.error('[fetchJournalFromDOAJ] Error:', err.message);
    return null;
  }
}

/**
 * 检查期刊在 PubMed/PMC 的收录情况
 */
async function checkNCBIIndexing(journalTitle) {
  const pubmedUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(journalTitle)}[Journal]&retmax=1&retmode=json`;
  const pmcUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${encodeURIComponent(journalTitle)}[Journal]&retmax=1&retmode=json`;
  
  try {
    const [pubmedResult, pmcResult] = await Promise.all([
      httpGet(pubmedUrl),
      httpGet(pmcUrl)
    ]);
    
    const pubmedCount = pubmedResult.data && pubmedResult.data.esearchresult 
      ? parseInt(pubmedResult.data.esearchresult.count) || 0 
      : 0;
    const pmcCount = pmcResult.data && pmcResult.data.esearchresult 
      ? parseInt(pmcResult.data.esearchresult.count) || 0 
      : 0;
    
    return {
      has_pmid: pubmedCount > 0,
      pmid_count: pubmedCount,
      has_pmc: pmcCount > 0,
      pmc_count: pmcCount
    };
  } catch (err) {
    console.error('[checkNCBIIndexing] Error:', err.message);
    return { has_pmid: false, pmid_count: 0, has_pmc: false, pmc_count: 0 };
  }
}

// ==================== Step 1: OpenAlex 批量同步 ====================

/**
 * Step 1: 从 OpenAlex 批量拉取期刊基础数据并入库（新增+更新）
 * 
 * 参数：
 * - maxPages: 最大页数（0=不限制）
 * - perPage: 每页条数（默认200）
 * - delay: 页间延迟毫秒（默认2000）
 * - resumeCursor: 断点续传游标
 */
async function syncFromOpenAlex(event, db, _) {
  const maxPages = event.maxPages || 0;
  const perPage = event.perPage || 200;
  const delay = event.delay || 2000;
  const resumeCursor = event.resumeCursor || '*';

  const results = {
    total_remote: 0,
    pages_fetched: 0,
    items_fetched: 0,
    success: 0,
    failed: 0,
    last_cursor: null
  };

  console.log(`=== Step 1: OpenAlex 批量同步 ===`);
  console.log(`maxPages=${maxPages}, perPage=${perPage}, delay=${delay}`);

  let cursor = resumeCursor;
  let pageNum = 0;

  while (true) {
    pageNum++;
    if (maxPages > 0 && pageNum > maxPages) {
      console.log(`已达到最大页数 ${maxPages}，停止`);
      break;
    }

    console.log(`\n--- OpenAlex 第 ${pageNum} 页 ---`);

    const pageData = await fetchPageFromOpenAlex(cursor, perPage);
    if (!pageData || pageData.results.length === 0) {
      console.log('无更多数据');
      break;
    }

    results.total_remote = pageData.total;
    results.pages_fetched = pageNum;
    results.items_fetched += pageData.results.length;
    results.last_cursor = pageData.next_cursor;

    console.log(`  总数: ${pageData.total}, 本页: ${pageData.results.length} 条`);

    const importResult = await _importOpenAlexPage(pageData.results, db, _);
    results.success += importResult.success;
    results.failed += importResult.failed;

    console.log(`  ✅ 成功${importResult.success} ❌ 失败${importResult.failed}`);

    if (!pageData.next_cursor) {
      console.log('已到最后一页');
      break;
    }

    cursor = pageData.next_cursor;
    console.log(`  等待 ${delay}ms...`);
    await sleep(delay);
  }

  console.log(`\n=== Step 1 完成 ===`);
  console.log(`API总数: ${results.total_remote}, 拉取: ${results.items_fetched}, 成功: ${results.success}, 失败: ${results.failed}`);
  if (results.last_cursor) {
    console.log(`断点续传 cursor: ${results.last_cursor}`);
  }

  return {
    code: 0,
    message: 'OpenAlex 同步完成',
    data: results
  };
}

/**
 * 将 OpenAlex 单页数据解析入库
 */
async function _importOpenAlexPage(journals, db, _) {
  const now = new Date();
  let success = 0;
  let failed = 0;
  const BATCH_DB = 20;

  for (let i = 0; i < journals.length; i++) {
    const item = journals[i];
    try {
      const openalexId = item.id ? item.id.replace('https://openalex.org/', '') : '';
      if (!openalexId) { failed++; continue; }

      const issnArr = item.issn || [];
      const stats = item.summary_stats || {};
      const topics = item.topics || [];
      const topTopics = topics.slice(0, 5).map(t => ({ display_name: t.display_name || '', count: t.count || 0 }));

      // 从 topics 提取学科大类/小类（取前2个唯一组合）
      const subjectMap = {};
      const subjectCategory = [];
      const subjectSubcategory = [];
      if (topics.length > 0) {
        topics.forEach(t => {
          const field = t.field ? t.field.display_name : '';
          const subfield = t.subfield ? t.subfield.display_name : '';
          const key = `${field}|${subfield}`;
          if (field && !subjectMap[key]) {
            subjectMap[key] = true;
            if (subjectCategory.indexOf(field) === -1) {
              subjectCategory.push(field);
            }
            if (subfield && subjectSubcategory.indexOf(subfield) === -1) {
              subjectSubcategory.push(subfield);
            }
          }
        });
      }

      const journalData = {
        openalex_id: openalexId,
        crossref_id: issnArr[0] || '',
        title: item.display_name || '',
        title_abbrev: (item.alternate_titles && item.alternate_titles.length > 0) ? item.alternate_titles[0] : '',
        issn_print: issnArr[0] || '',
        issn_online: issnArr[1] || '',
        issn_l: item.issn_l || '',
        homepage_url: item.homepage_url || '',
        doi_prefix: '',
        publisher: item.publisher || '',
        country: item.country_code || '',
        language: '',
        launch_year: null,
        submission_url: '',
        type: item.type || 'journal',
        peer_review_model: '',
        status: item.is_active !== false ? 'active' : 'ceased',
        is_open_access: item.is_oa || false,
        oa_type: '',
        doaj_seal: false,
        is_in_doaj: item.is_in_doaj || false,
        has_pmid: false,
        has_pmc: false,
        pmid_count: 0,
        pmc_count: 0,
        works_count_latest: item.works_count || 0,
        cited_by_count_latest: item.cited_by_count || 0,
        h_index_latest: stats.h_index || 0,
        i10_index_latest: stats.i10_index || 0,
        two_year_mean_citedness_latest: stats['2yr_mean_citedness'] || 0,
        top_topics: topTopics,

        // ---- 学科分类（新增）----
        subject_category: subjectCategory.slice(0, 3),   // 大类，最多3个
        subject_subcategory: subjectSubcategory.slice(0, 5),  // 小类，最多5个

        // ---- 核心指标（新增，默认空）----
        impact_factor: null,        // 影响因子
        if_year: null,             // IF对应年份
        jcr_quartile: '',         // JCR分区：Q1/Q2/Q3/Q4
        jcr_year: null,            // JCR年份
        cas_quartile: '',         // 中科院分区：1区/2区/3区/4区
        cas_year: null,            // 中科院分区年份
        cas_edition: '',          // 中科院基础版/升级版

        // ---- 投稿相关（新增，默认空）----
        acceptance_rate: null,      // 录用率（%）
        review_cycle: '',         // 审稿周期（如"3-6周"）
        first_decision_days: null,  // 初审决定天数

        // ---- 自引率（新增，默认空）----
        self_citation_rate: null,  // 自引率（%）

        // ---- 数据来源（新增）----
        metrics_source: '',        // 指标数据来源：user_contributed / admin / crawled
        metrics_verified: false,    // 是否已验证
        metrics_last_verified_at: null,

        created_at: now,
        updated_at: now,
        last_synced_at: now
      };

      const existing = await db.collection('journals').where({ openalex_id: openalexId }).get();
      let journalId;

      if (existing.data.length > 0) {
        // 更新：保留已有字段
        const old = existing.data[0];
        await db.collection('journals').doc(old._id).update({
          data: {
            ...journalData,
            publisher: old.publisher || journalData.publisher,
            country: old.country || journalData.country,
            language: old.language || journalData.language,
            launch_year: old.launch_year || journalData.launch_year,
            submission_url: old.submission_url || journalData.submission_url,
            peer_review_model: old.peer_review_model || journalData.peer_review_model,
            oa_type: old.oa_type || journalData.oa_type,
            doaj_seal: old.doaj_seal !== undefined ? old.doaj_seal : false,
            is_in_doaj: old.is_in_doaj !== undefined ? old.is_in_doaj : journalData.is_in_doaj,
            has_pmid: old.has_pmid !== undefined ? old.has_pmid : false,
            has_pmc: old.has_pmc !== undefined ? old.has_pmc : false,
            pmid_count: old.pmid_count || 0,
            pmc_count: old.pmc_count || 0,
            updated_at: now
          }
        });
        journalId = old._id;
      } else {
        // 新增
        const addRes = await db.collection('journals').add({ data: journalData });
        journalId = addRes._id;
      }

      // 保存学科分类
      if (topics.length > 0) {
        await db.collection('journal_subject').where({ journal_id: journalId, source: 'openalex' }).remove();
        const subjectDocs = topics.map(t => ({
          journal_id: journalId, source: 'openalex',
          subject_level: t.level || 4, subject_id: t.id || '',
          subject_name: t.display_name || '', parent_id: '', created_at: now
        }));
        for (let s = 0; s < subjectDocs.length; s += BATCH_DB) {
          await db.collection('journal_subject').add({ data: subjectDocs.slice(s, s + BATCH_DB) });
        }
      }

      // 保存年度统计
      const countsByYear = item.counts_by_year || [];
      if (countsByYear.length > 0) {
        await db.collection('journal_metrics_yearly').where({ journal_id: journalId }).remove();
        const metricsDocs = countsByYear
          .filter(y => y.year >= 1900 && y.year <= 2099)
          .map(y => ({
            journal_id: journalId, year: y.year,
            works_count: y.works_count || 0, cited_by_count: y.cited_by_count || 0,
            h_index: stats.h_index || 0, i10_index: stats.i10_index || 0,
            two_year_mean_citedness: stats['2yr_mean_citedness'] || 0,
            research_articles: 0, review_articles: 0, editorial_articles: 0, other_articles: 0,
            author_count: 0, top_authors: [], top_institutions: [], top_countries: [], top_topics: [],
            created_at: now
          }));
        for (let m = 0; m < metricsDocs.length; m += BATCH_DB) {
          await db.collection('journal_metrics_yearly').add({ data: metricsDocs.slice(m, m + BATCH_DB) });
        }
      }

      success++;
    } catch (err) {
      console.error(`  [${i + 1}] 失败: ${err.message}`);
      failed++;
    }
  }

  return { success, failed };
}

// ==================== Step 2: Crossref 补充同步 ====================

/**
 * Step 2: 根据 ISSN 从 Crossref 补充期刊数据（只更新，不新增）
 * 
 * 参数：
 * - maxPages: 最大页数（0=不限制）
 * - perPage: 每页条数（默认100）
 * - delay: 页间延迟毫秒（默认2000）
 * - resumeOffset: 断点续传偏移量
 */
async function supplementFromCrossref(event, db, _) {
  const maxPages = event.maxPages || 0;
  const perPage = event.perPage || 100;
  const delay = event.delay || 2000;
  const resumeOffset = event.resumeOffset || 0;

  const results = {
    total_remote: 0,
    pages_fetched: 0,
    items_fetched: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    last_offset: 0
  };

  console.log(`=== Step 2: Crossref 补充同步 ===`);
  console.log(`maxPages=${maxPages}, perPage=${perPage}, delay=${delay}`);

  let offset = resumeOffset;
  let pageNum = 0;

  while (true) {
    pageNum++;
    if (maxPages > 0 && pageNum > maxPages) {
      console.log(`已达到最大页数 ${maxPages}，停止`);
      break;
    }

    console.log(`\n--- Crossref 第 ${pageNum} 页 (offset=${offset}) ---`);

    const pageData = await fetchPageFromCrossref(offset, perPage);
    if (!pageData || pageData.results.length === 0) {
      console.log('无更多数据');
      break;
    }

    results.total_remote = pageData.total;
    results.pages_fetched = pageNum;
    results.items_fetched += pageData.results.length;
    results.last_offset = offset + pageData.results.length;

    console.log(`  总数: ${pageData.total}, 本页: ${pageData.results.length} 条`);

    const updateResult = await _supplementCrossrefPage(pageData.results, db, _);
    results.updated += updateResult.updated;
    results.skipped += updateResult.skipped;
    results.failed += updateResult.failed;

    console.log(`  🔄 更新${updateResult.updated} ⏭️ 跳过${updateResult.skipped} ❌ 失败${updateResult.failed}`);

    if (pageData.results.length < perPage) {
      console.log('已到最后一页');
      break;
    }

    offset = results.last_offset;
    console.log(`  等待 ${delay}ms...`);
    await sleep(delay);
  }

  console.log(`\n=== Step 2 完成 ===`);
  console.log(`API总数: ${results.total_remote}, 拉取: ${results.items_fetched}, 更新: ${results.updated}, 跳过: ${results.skipped}, 失败: ${results.failed}`);
  console.log(`断点续传 offset: ${results.last_offset}`);

  return {
    code: 0,
    message: 'Crossref 补充完成',
    data: results
  };
}

/**
 * 用 Crossref 数据补充本地期刊（只更新已存在的期刊）
 */
async function _supplementCrossrefPage(journals, db, _) {
  const now = new Date();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < journals.length; i++) {
    const item = journals[i];
    try {
      const issnArr = item.ISSN || [];
      const issnPrint = issnArr[0] || '';
      const issnOnline = issnArr.length > 1 ? issnArr[1] : '';
      const title = item.title || '';

      // 用 ISSN 查找本地期刊
      let existing = null;
      if (issnPrint) {
        const byIssn = await db.collection('journals')
          .where(_.or([{ issn_print: issnPrint }, { issn_online: issnPrint }, { crossref_id: issnPrint }]))
          .limit(1).get();
        if (byIssn.data.length > 0) existing = byIssn.data[0];
      }

      if (existing) {
        // 只更新，不新增
        await db.collection('journals').doc(existing._id).update({
          data: {
            publisher: item.publisher || existing.publisher,
            title: title || existing.title,
            title_abbrev: (item['short-container-title'] && item['short-container-title'].length > 0)
              ? item['short-container-title'][0] : existing.title_abbrev,
            issn_print: issnPrint || existing.issn_print,
            issn_online: issnOnline || existing.issn_online,
            crossref_id: issnPrint || existing.crossref_id,
            updated_at: now
          }
        });
        updated++;
      } else {
        // 本地没有该期刊，跳过（不新增）
        skipped++;
      }
    } catch (err) {
      console.error(`  [Crossref ${i + 1}] 失败: ${err.message}`);
      failed++;
    }
  }

  return { updated, skipped, failed };
}

// ==================== Step 3: DOAJ + NCBI 补充同步 ====================

/**
 * Step 3: 对指定范围的期刊进行 DOAJ/NCBI 补充同步（慢速，逐本调用）
 * 
 * 参数：
 * - start: 起始索引（默认0）
 * - limit: 处理数量（默认100）
 * - delay: 每本间隔毫秒（默认1500）
 * - onlyMissing: 只补充缺失字段的期刊（默认true）
 */
async function supplementDOAJAndNCBI(event, db, _) {
  const start = event.start || 0;
  const limit = event.limit || 100;
  const delay = event.delay || 1500;
  const onlyMissing = event.onlyMissing !== undefined ? event.onlyMissing : true;

  const results = {
    total: 0,
    processed: 0,
    doaj_updated: 0,
    ncbi_updated: 0,
    skipped: 0,
    failed: 0
  };

  console.log(`=== Step 3: DOAJ/NCBI 补充同步 ===`);
  console.log(`start=${start}, limit=${limit}, delay=${delay}, onlyMissing=${onlyMissing}`);

  // 构建查询条件
  let query = {};
  if (onlyMissing) {
    // 只处理缺少 DOAJ 或 NCBI 数据的期刊
    query = _.or([
      { is_in_doaj: false },
      { has_pmid: false },
      { has_pmc: false }
    ]);
  }

  // 获取期刊列表
  const journals = await db.collection('journals')
    .where(query)
    .skip(start)
    .limit(limit)
    .get();

  results.total = journals.data.length;
  console.log(`找到 ${results.total} 本待补充期刊`);

  for (let i = 0; i < journals.data.length; i++) {
    const journal = journals.data[i];
    const issn = journal.issn_print || journal.issn_online || '';
    const title = journal.title || '';

    try {
      const updates = { updated_at: new Date() };
      let doajDone = false;
      let ncbiDone = false;

      // DOAJ 补充
      if (issn && (!onlyMissing || !journal.is_in_doaj)) {
        try {
          const doajData = await fetchJournalFromDOAJ(issn);
          if (doajData) {
            updates.is_in_doaj = true;
            if (doajData.language) updates.language = doajData.language;
            if (doajData.country) updates.country = doajData.country;
            if (doajData.submission_url) updates.submission_url = doajData.submission_url;
            if (doajData.apc_amount) updates.apc_amount = doajData.apc_amount;
            if (doajData.currency) updates.apc_currency = doajData.currency;
            if (doajData.license) updates.license = doajData.license;
            doajDone = true;
          }
        } catch (err) {
          console.error(`  [DOAJ ${title}] 失败: ${err.message}`);
        }
        await sleep(delay);
      }

      // NCBI 补充
      if (title && (!onlyMissing || !journal.has_pmid || !journal.has_pmc)) {
        try {
          const ncbiData = await checkNCBIIndexing(title);
          if (ncbiData) {
            updates.has_pmid = ncbiData.has_pmid;
            updates.pmid_count = ncbiData.pmid_count;
            updates.has_pmc = ncbiData.has_pmc;
            updates.pmc_count = ncbiData.pmc_count;
            ncbiDone = true;
          }
        } catch (err) {
          console.error(`  [NCBI ${title}] 失败: ${err.message}`);
        }
        await sleep(delay);
      }

      // 写入数据库
      if (Object.keys(updates).length > 1) {
        await db.collection('journals').doc(journal._id).update({ data: updates });
        if (doajDone) results.doaj_updated++;
        if (ncbiDone) results.ncbi_updated++;
      } else {
        results.skipped++;
      }

      results.processed++;
      if ((results.processed % 10 === 0)) {
        console.log(`  进度: ${results.processed}/${results.total}, DOAJ:${results.doaj_updated}, NCBI:${results.ncbi_updated}`);
      }
    } catch (err) {
      console.error(`  [${title}] 处理失败: ${err.message}`);
      results.failed++;
    }
  }

  console.log(`\n=== Step 3 完成 ===`);
  console.log(`处理: ${results.processed}, DOAJ更新: ${results.doaj_updated}, NCBI更新: ${results.ncbi_updated}, 跳过: ${results.skipped}, 失败: ${results.failed}`);

  return {
    code: 0,
    message: 'DOAJ/NCBI 补充完成',
    data: results
  };
}

// ==================== 导出 ====================

module.exports = {
  syncFromOpenAlex,
  supplementFromCrossref,
  supplementDOAJAndNCBI
};
