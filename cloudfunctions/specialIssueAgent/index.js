// cloudfunctions/specialIssueAgent/index.js
// V5: 异步轮询架构升级
// - 数据源：从论文提取作者 → 批量查询详情 → 保存 sourcePapers/sourceAuthors
// - LLM：生成 1 个方案（可重新生成），要求返回 sourceArticleIds/sourceEditorIds
// - 积分：任务完成后扣 30 积分
// - 新增 action: list, regenerate
const https = require('https');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

var TASK_COLLECTION = 'special_issue_tasks';

// ==================== 系统提示词 ====================
var SYSTEM_PROMPT = '# 角色\n' +
  '你是学术特刊策划专家，基于 OpenAlex 论文数据库分析学术趋势，为学术期刊策划 1 个特刊话题方案。需同时输出中英文双语版本。\n' +
  '\n' +
  '# 方案要求\n' +
  '- 深入分析提供的论文和作者数据，挖掘高价值的研究方向\n' +
  '- 推荐 3-5 位客编，必须是提供的作者数据中真实存在的学者\n' +
  '- 话题热度根据论文被引量和发文趋势综合评估\n' +
  '\n' +
  '# JSON 输出格式（严格遵循，纯 JSON，不要 Markdown 代码块）\n' +
  '{\n' +
  '  "plan": {\n' +
  '    "zh": {\n' +
  '      "title": "话题中文标题",\n' +
  '      "abstract": "中文摘要 200-400 字",\n' +
  '      "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]\n' +
  '    },\n' +
  '    "en": {\n' +
  '      "title": "English Title",\n' +
  '      "abstract": "English abstract 200-400 words",\n' +
  '      "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]\n' +
  '    },\n' +
  '    "guestEditors": [\n' +
  '      { "name": "Scholar Name", "institution": "University Name" }\n' +
  '    ],\n' +
  '    "topicHeat": 274,\n' +
  '    "sourceArticleIds": ["W123", "W456", "W789"],\n' +
  '    "sourceEditorIds": ["A111", "A222"]\n' +
  '  }\n' +
  '}\n' +
  '\n' +
  '# 关键规则\n' +
  '1. 所有数据必须源自提供的真实论文和作者数据，禁止编造任何论文、作者或机构信息。\n' +
  '2. sourceArticleIds 必须是从输入论文中选取的真实 ID，sourceEditorIds 同理。\n' +
  '3. 如果用户提供了附加要求，请在生成方案时严格遵守，并将其融入话题描述、客编推荐等各个环节。\n' +
  '4. 每次生成独立判断，不参考已有方案（用户可能多次重新生成，需要多样化的结果）。\n' +
  '5. 纯 JSON 输出，不要 Markdown 代码块，不要解释文字。';

// ==================== HTTP 工具 ====================

function httpGet(url, timeout) {
  timeout = timeout || 30000;
  return new Promise(function(resolve, reject) {
    var req = https.get(url, { timeout: timeout }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        if (res.statusCode !== 200) {
          resolve({ statusCode: res.statusCode, data: null });
          return;
        }
        try {
          resolve({ statusCode: 200, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: 200, data: data });
        }
      });
    });
    req.on('error', function(err) { reject(err); });
    req.on('timeout', function() { req.destroy(); reject(new Error('请求超时')); });
  });
}

async function callOpenAlex(action, params) {
  var url = '';
  if (action === 'searchWorks') {
    url = 'https://api.openalex.org/works?search=' + encodeURIComponent(params.query)
      + '&per-page=' + (params.perPage || 50)
      + '&sort=' + (params.sort || 'cited_by_count:desc');
    if (params.fromYear) {
      url += '&filter=from_publication_date:' + params.fromYear + '-01-01';
    }
  } else if (action === 'getAuthorsByIds') {
    url = 'https://api.openalex.org/authors?filter=openalex_id:' + encodeURIComponent(params.ids)
      + '&per-page=' + (params.perPage || 50);
  }

  try {
    var result = await httpGet(url, 30000);
    if (result.statusCode === 200) {
      return { success: true, data: result.data };
    }
    return { success: false, error: 'HTTP ' + result.statusCode };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==================== 数据精简 ====================

function simplifyWorks(rawWorks) {
  if (!Array.isArray(rawWorks)) return [];
  return rawWorks.map(function(w) {
    return {
      id: (w.id || '').split('/').pop(),
      title: w.display_name || w.title || '',
      authors: (w.authorships || []).map(function(a) {
        return (a.author && a.author.display_name) || '';
      }).filter(Boolean),
      cc: w.cited_by_count || 0,
      year: w.publication_year || 0,
      url: w.id || ''
    };
  });
}

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

// ==================== JSON 提取 ====================

function extractJSON(text) {
  try { return JSON.parse(text); } catch (e) {}
  var m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (m) { try { return JSON.parse(m[1].trim()); } catch (e) {} }
  var start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(text.substring(start, end + 1)); } catch (e) {} }
  return null;
}

// ==================== 引用校验 ====================

function validateSourceRefs(json, sourcePapers, sourceAuthors) {
  if (!json || !json.plan) return;
  var plan = json.plan;
  var validPaperIds = {};
  var validAuthorIds = {};
  for (var i = 0; i < sourcePapers.length; i++) validPaperIds[sourcePapers[i].id] = true;
  for (var i = 0; i < sourceAuthors.length; i++) validAuthorIds[sourceAuthors[i].id] = true;

  plan.sourceArticleIds = (plan.sourceArticleIds || []).filter(function(id) { return validPaperIds[id]; });
  plan.sourceEditorIds = (plan.sourceEditorIds || []).filter(function(id) { return validAuthorIds[id]; });
}

// ==================== LLM 调用 ====================

function callLLM(messages) {
  return new Promise(function(resolve, reject) {
    var apiKey = process.env.KIMI_API_KEY || '';
    if (!apiKey) {
      reject(new Error('缺少 KIMI_API_KEY 环境变量'));
      return;
    }

    var body = JSON.stringify({
      model: 'moonshot-v1-128k',
      messages: messages,
      max_tokens: 16384
    });

    var urlObj = new (require('url').URL)('https://api.moonshot.cn/v1/chat/completions');
    var req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 120000
    }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        if (res.statusCode !== 200) {
          reject(new Error('Kimi API ' + res.statusCode + ': ' + data.substring(0, 300)));
          return;
        }
        try {
          var parsed = JSON.parse(data);
          var content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
          if (content) {
            resolve({ content: content, usage: parsed.usage || {} });
          } else {
            reject(new Error('Kimi API 返回空内容'));
          }
        } catch (e) {
          reject(new Error('解析 Kimi 响应失败: ' + e.message));
        }
      });
    });
    req.on('error', function(err) { reject(err); });
    req.on('timeout', function() { req.destroy(); reject(new Error('Kimi API 请求超时')); });
    req.write(body);
    req.end();
  });
}

// ==================== Prompt 构建 ====================

function buildUserMessage(keyword, papers, authors, totalPapers, totalAuthors, constraints) {
  var lines = [];
  lines.push('# 任务');
  lines.push('基于以下研究关键词的论文数据和作者数据，生成 1 个特刊策划方案。要求分析深入、建议具体，充分利用提供的论文和作者数据。');
  lines.push('');
  lines.push('# 关键词');
  lines.push(keyword);
  lines.push('');
  lines.push('# 论文数据（共 ' + totalPapers + ' 篇，展示前 ' + papers.length + ' 篇）');
  lines.push(JSON.stringify(papers, null, 2));
  lines.push('');
  lines.push('# 作者数据（共 ' + totalAuthors + ' 位，展示 h-index 前 ' + authors.length + ' 位）');
  lines.push(JSON.stringify(authors, null, 2));
  lines.push('');

  if (constraints) {
    lines.push('# 用户附加要求（必须严格遵守）');
    lines.push(constraints);
    lines.push('');
  }

  lines.push('# 输出格式要求');
  lines.push('请返回 JSON 格式，包含一个 plan 对象，字段如下：');
  lines.push('- zh/en: 中英文标题、摘要、关键词');
  lines.push('- guestEditors: 推荐客编数组（含 name, institution），每方案 3-5 位');
  lines.push('- topicHeat: 话题热度评估（数字）');
  lines.push('- sourceArticleIds: 该话题依据的论文 ID 数组（必须从提供的论文数据中选取）');
  lines.push('- sourceEditorIds: 该话题推荐客编对应的作者 ID 数组（必须从提供的作者数据中选取）');
  lines.push('');
  lines.push('注意：sourceArticleIds 和 sourceEditorIds 中的 ID 必须真实存在于输入数据中，禁止编造。');

  return lines.join('\n');
}

// ==================== 工具函数 ====================

function genTaskId() {
  return 'si_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

function initSteps() {
  return [
    { key: 'search_papers',   label: '搜索论文数据',              status: 'pending' },
    { key: 'fetch_authors',   label: '提取论文作者并查询详情',      status: 'pending' },
    { key: 'call_llm',        label: 'AI 生成策划方案',            status: 'pending' },
    { key: 'parse_result',    label: '解析并保存结果',             status: 'pending' }
  ];
}

async function updateTaskProgress(taskId, progress) {
  try {
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { progress: progress, updatedAt: Date.now() }
    });
  } catch (e) { /* 忽略 */ }
}

async function updateStepStatus(taskId, steps, stepKey, status) {
  for (var i = 0; i < steps.length; i++) {
    if (steps[i].key === stepKey) {
      steps[i].status = status;
      if (status === 'running') steps[i].startedAt = Date.now();
      if (status === 'completed') steps[i].completedAt = Date.now();
      break;
    }
  }
  try {
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { steps: steps, updatedAt: Date.now() }
    });
  } catch (e) { /* 忽略 */ }
}

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

// ==================== doFullPipeline（首次创建） ====================

async function doFullPipeline(keyword, constraints, taskId) {
  console.log('[Worker] doFullPipeline 开始, taskId:', taskId, 'keyword:', keyword);
  var steps = initSteps();

  // ===== Step 1: 搜索论文 =====
  await updateTaskProgress(taskId, 'searching');
  await updateStepStatus(taskId, steps, 'search_papers', 'running');
  console.log('[Worker] Step 1: 搜索论文...');

  var worksRes = await callOpenAlex('searchWorks', {
    query: keyword,
    fromYear: 2021,
    perPage: 50,
    sort: 'cited_by_count:desc'
  });

  if (!worksRes.success) {
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: '论文搜索失败: ' + worksRes.error, steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  var rawPapers = worksRes.data.results || [];
  var sourcePapers = simplifyWorks(rawPapers);
  var totalPapers = worksRes.data.meta && worksRes.data.meta.count || rawPapers.length;
  console.log('[Worker] 搜索到论文:', sourcePapers.length, '/', totalPapers);
  await updateStepStatus(taskId, steps, 'search_papers', 'completed');

  // ===== Step 2: 从论文提取作者 → 批量查询详情 =====
  await updateTaskProgress(taskId, 'fetching_authors');
  await updateStepStatus(taskId, steps, 'fetch_authors', 'running');
  console.log('[Worker] Step 2: 提取论文作者...');

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
  console.log('[Worker] 去重后作者数:', authorIds.length);

  // 2.2 批量查询作者详情（每批最多 50 个）
  var BATCH_SIZE = 50;
  var sourceAuthors = [];
  for (var start = 0; start < authorIds.length; start += BATCH_SIZE) {
    var batchIds = authorIds.slice(start, start + BATCH_SIZE);
    var idFilter = batchIds.map(function(id) { return (id || '').split('/').pop(); }).join('|');
    var batchRes = await callOpenAlex('getAuthorsByIds', { ids: idFilter });
    if (batchRes.success && batchRes.data && batchRes.data.results) {
      var batchAuthors = simplifyAuthorsWithYearly(batchRes.data.results);
      sourceAuthors = sourceAuthors.concat(batchAuthors);
    }
    console.log('[Worker] 批量查询作者: 第 ' + Math.floor(start / BATCH_SIZE + 1) + ' 批, 获取 ' + (batchRes.success ? (batchRes.data.results || []).length : 0) + ' 位');
  }

  // 2.3 按 h-index 排序取前 20（传给 LLM 的候选客编池）
  sourceAuthors.sort(function(a, b) { return b.h - a.h; });
  var llmAuthors = sourceAuthors.slice(0, 20);
  console.log('[Worker] 获取作者详情:', sourceAuthors.length, '位, 传给 LLM:', llmAuthors.length, '位');
  await updateStepStatus(taskId, steps, 'fetch_authors', 'completed');

  // ===== Step 3: 调用 LLM =====
  await updateTaskProgress(taskId, 'generating');
  await updateStepStatus(taskId, steps, 'call_llm', 'running');
  console.log('[Worker] Step 3: 调用 Kimi LLM...');

  var userMsg = buildUserMessage(keyword, sourcePapers, llmAuthors, totalPapers, authorIds.length, constraints);
  var llm;
  try {
    llm = await callLLM([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ]);
  } catch (e) {
    console.error('[Worker] LLM 调用失败:', e.message);
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: 'LLM 调用失败: ' + e.message, steps: steps, updatedAt: Date.now() }
    });
    return;
  }
  console.log('[Worker] LLM 返回, tokens:', JSON.stringify(llm.usage));
  await updateStepStatus(taskId, steps, 'call_llm', 'completed');

  // ===== Step 4: 解析结果 =====
  await updateStepStatus(taskId, steps, 'parse_result', 'running');
  console.log('[Worker] Step 4: 解析结果...');

  var json = extractJSON(llm.content);
  if (!json) {
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: 'AI 返回数据解析失败', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  // 校验 sourceArticleIds 和 sourceEditorIds
  validateSourceRefs(json, sourcePapers, llmAuthors);
  await updateStepStatus(taskId, steps, 'parse_result', 'completed');

  // ===== 写入结果 + 扣除积分 =====
  var completedAt = Date.now();
  var deductResult = await deductCredits(taskId, 30);

  await db.collection(TASK_COLLECTION).doc(taskId).update({
    data: {
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
    }
  });

  console.log('[Worker] doFullPipeline 完成, creditsDeducted:', deductResult.success);
}

// ==================== doRegeneratePipeline（重新生成，仅 LLM） ====================

async function doRegeneratePipeline(keyword, constraints, taskId, sourcePapers, sourceAuthors) {
  console.log('[Worker] doRegeneratePipeline 开始（仅 LLM）, taskId:', taskId);
  var steps = [
    { key: 'call_llm',   label: 'AI 生成策划方案',  status: 'running', startedAt: Date.now() },
    { key: 'parse_result', label: '解析并保存结果',  status: 'pending' }
  ];

  // ===== Step 1: 调用 LLM =====
  await updateTaskProgress(taskId, 'generating');

  // 取 h-index 前 20 位作者
  var llmAuthors = sourceAuthors.slice(0, 20);
  var userMsg = buildUserMessage(keyword, sourcePapers, llmAuthors, sourcePapers.length, sourceAuthors.length, constraints);

  var llm;
  try {
    llm = await callLLM([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ]);
  } catch (e) {
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: 'LLM 调用失败: ' + e.message, steps: steps, updatedAt: Date.now() }
    });
    return;
  }
  console.log('[Worker] Regenerate LLM 返回, tokens:', JSON.stringify(llm.usage));
  await updateStepStatus(taskId, steps, 'call_llm', 'completed');

  // ===== Step 2: 解析结果 =====
  await updateStepStatus(taskId, steps, 'parse_result', 'running');
  var json = extractJSON(llm.content);
  if (!json) {
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: 'AI 返回数据解析失败', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  validateSourceRefs(json, sourcePapers, llmAuthors);
  await updateStepStatus(taskId, steps, 'parse_result', 'completed');

  // ===== 写入结果 + 扣积分 + 存档旧方案 =====
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
  console.log('[Worker] doRegeneratePipeline 完成, regenerateCount:', updateData.regenerateCount);
}

// ==================== 主入口 ====================

exports.main = async function(event, context) {
  var keyword = (event.keyword || '').trim();
  var constraints = (event.constraints || '').trim();
  var taskId = event.taskId;
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  // ========== action: poll（查询任务状态） ==========
  if (event.action === 'poll') {
    if (!taskId) return { success: false, error: '缺少 taskId' };
    try {
      var doc = await db.collection(TASK_COLLECTION).doc(taskId).get();
      if (!doc.data) return { success: false, error: '任务不存在' };
      var d = doc.data;
      return {
        success: true,
        data: {
          status: d.status,
          progress: d.progress,
          result: d.result,
          error: d.error,
          steps: d.steps,
          sourcePapers: d.sourcePapers,
          sourceAuthors: d.sourceAuthors,
          usage: d.usage,
          creditsDeducted: d.creditsDeducted,
          regenerateCount: d.regenerateCount || 0,
          regenerateHistory: d.regenerateHistory || [],
          completedAt: d.completedAt,
          createdAt: d.createdAt,
          constraints: d.constraints
        }
      };
    } catch (e) {
      return { success: false, error: '查询失败: ' + e.message };
    }
  }

  // ========== action: list（查询用户任务列表） ==========
  if (event.action === 'list') {
    var page = event.page || 0;
    var pageSize = event.pageSize || 20;

    var where = { _openid: openid };
    if (event.keyword) {
      where.keyword = db.RegExp({
        regexp: event.keyword,
        options: 'i'
      });
    }

    try {
      var docs = await db.collection(TASK_COLLECTION)
        .where(where)
        .orderBy('createdAt', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get();

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
          firstTitle: item.result && item.result.plan
            ? ((item.result.plan.zh && item.result.plan.zh.title) || (item.result.plan.en && item.result.plan.en.title) || '')
            : ''
        };
      });

      return { success: true, list: list, page: page, pageSize: pageSize };
    } catch (e) {
      return { success: false, error: '查询列表失败: ' + e.message };
    }
  }

  // ========== action: process（首次创建 Worker） ==========
  if (event.action === 'process') {
    try {
      await doFullPipeline(keyword, constraints, taskId);
    } catch (err) {
      console.error('[Worker] doFullPipeline 异常:', err.message || err);
      try {
        await db.collection(TASK_COLLECTION).doc(taskId).update({
          data: { status: 'failed', error: err.message || '策划生成失败', updatedAt: Date.now() }
        });
      } catch (e) { /* ignore */ }
    }
    return { success: true, action: 'process_done' };
  }

  // ========== action: regenerate（重新生成触发） ==========
  if (event.action === 'regenerate') {
    try {
      // 1. 查询当前任务
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

      // 3. 标记任务为重新生成中
      await db.collection(TASK_COLLECTION).doc(taskId).update({
        data: {
          status: 'processing',
          progress: 'generating',
          _regenerating: true,
          steps: [
            { key: 'call_llm',   label: 'AI 生成策划方案',  status: 'running',  startedAt: Date.now() },
            { key: 'parse_result', label: '解析并保存结果',  status: 'pending' }
          ],
          creditsDeducted: false,
          updatedAt: Date.now()
        }
      });

      // 4. 触发精简 pipeline（仅 LLM）
      context.callbackWaitsForEmptyEventLoop = false;
      cloud.callFunction({
        name: 'specialIssueAgent',
        data: {
          action: 'regenerateProcess',
          taskId: taskId,
          keyword: taskDoc.data.keyword,
          constraints: taskDoc.data.constraints,
          sourcePapers: taskDoc.data.sourcePapers,
          sourceAuthors: taskDoc.data.sourceAuthors
        }
      });

      return { success: true, taskId: taskId };
    } catch (e) {
      return { success: false, error: e.message || '重新生成失败' };
    }
  }

  // ========== action: regenerateProcess（重新生成 Worker） ==========
  if (event.action === 'regenerateProcess') {
    try {
      await doRegeneratePipeline(
        keyword,
        constraints,
        taskId,
        event.sourcePapers || [],
        event.sourceAuthors || []
      );
    } catch (err) {
      console.error('[Worker] doRegeneratePipeline 异常:', err.message || err);
      try {
        await db.collection(TASK_COLLECTION).doc(taskId).update({
          data: { status: 'failed', error: err.message || '重新生成失败', updatedAt: Date.now() }
        });
      } catch (e) { /* ignore */ }
    }
    return { success: true, action: 'regenerate_done' };
  }

  // ========== Trigger 模式（默认） ==========
  if (!keyword) return { success: false, error: '请输入研究关键词' };

  var newTaskId = genTaskId();
  console.log('[Trigger] 创建任务, taskId:', newTaskId, 'keyword:', keyword, 'constraints:', constraints);

  await db.collection(TASK_COLLECTION).add({
    data: {
      _id: newTaskId,
      _openid: openid,
      keyword: keyword,
      constraints: constraints || '',
      status: 'processing',
      progress: 'searching',
      steps: initSteps(),
      creditsDeducted: false,
      creditsCost: 30,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  });

  // Fire-and-forget: 异步触发 worker
  context.callbackWaitsForEmptyEventLoop = false;
  cloud.callFunction({
    name: 'specialIssueAgent',
    data: { action: 'process', keyword: keyword, constraints: constraints, taskId: newTaskId }
  });

  console.log('[Trigger] 已触发 worker, 返回 taskId:', newTaskId);
  return { success: true, taskId: newTaskId };
};
