// cloudfunctions/specialIssueAgent/index.js
// V5: 两阶段异步架构
// Phase 1（趋势分析）：用户输入关键词 → 混合搜索论文 → AI 聚类3-5个方向
// Phase 2（方案生成）：用户选方向 → 按方向关键词重搜20篇 → 查作者详情 → AI 生成完整方案
// 积分：Phase 1 完成后扣 30 积分，Phase 2 不再扣费
const https = require('https');
const http = require('http');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

var TASK_COLLECTION = 'special_issue_tasks';
var TEMPLATE_COLLECTION = 'special_issue_templates';
var DIRECTION_COLLECTION = 'special_issue_directions';
var SCHEME_COLLECTION = 'special_issue_schemes';

// ==================== Phase 1 系统提示词（只生成方向） ====================
var PHASE1_SYSTEM_PROMPT = '# 角色\n' +
  '你是学术趋势分析专家，基于 OpenAlex 论文数据库分析学术趋势。你需要从提供的论文数据中挖掘出 3 个差异化明显的研究方向。\n' +
  '\n' +
  '# 任务要求\n' +
  '- 深入分析提供的论文数据，挖掘出 3 个差异化明显的研究方向\n' +
  '- 每个方向必须基于真实论文数据，不能凭空捏造\n' +
  '- 方向之间要有明显差异（不能是同一话题的不同表述）\n' +
  '- 如果论文数据不足以支撑 3 个方向，可以输出 2 个\n' +
  '- 每个方向的热度(topicHeat)必须根据该方向实际依据论文的被引量综合评估（0-1000）\n' +
  '- 每个方向必须附带用于精准搜索该方向论文的关键词(searchKeywords)，这些关键词将在第二阶段用于搜索更精准的论文数据\n' +
  '\n' +
  '# JSON 输出格式（严格遵循，纯 JSON，不要 Markdown 代码块）\n' +
  '{\n' +
  '  "plans": [\n' +
  '    {\n' +
  '      "key": "d1",\n' +
  '      "zh": {\n' +
  '        "title": "方向中文标题",\n' +
  '        "abstract": "方向中文摘要 80-150 字",\n' +
  '        "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]\n' +
  '      },\n' +
  '      "en": {\n' +
  '        "title": "Direction English Title",\n' +
  '        "abstract": "Direction English abstract 80-150 words",\n' +
  '        "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]\n' +
  '      },\n' +
  '      "searchKeywords": ["keyword1 for search", "keyword2 for search"],\n' +
  '      "topicHeat": <方向热度, 0-1000>,\n' +
  '      "sourceArticleIds": ["W123", "W456", "...", "W789"]\n' +
  '    }\n' +
  '  ]\n' +
  '}\n' +
  '\n' +
  '# 关键规则\n' +
  '1. 所有数据必须源自提供的真实论文数据，禁止编造任何论文信息。\n' +
  '2. sourceArticleIds 必须是从输入论文中选取的真实 ID，每个方向选取 5-8 篇最能代表该方向的论文。\n' +
  '3. searchKeywords 是用于在学术数据库中搜索该方向论文的关键词（英文，2-5 个），将直接影响第二阶段论文搜索质量。\n' +
  '4. 如果用户提供了附加要求，请在方向描述中体现。\n' +
  '5. 每次生成独立判断，不参考已有方案。\n' +
  '6. topicHeat 必须根据该方向依据论文的被引量总和综合评估，0-1000。\n' +
  '7. 纯 JSON 输出，不要 Markdown 代码块，不要解释文字。\n' +
  '8. sourceArticleIds 中的论文应尽量分散在不同年份、不同子主题上，确保覆盖广度。';

// ==================== Phase 2 系统提示词（生成完整方案） ====================
var PHASE2_SYSTEM_PROMPT = '# 角色\n' +
  '你是学术特刊策划专家。用户已选定了一个研究方向，你需要为该方向生成一份完整的特刊策划方案。你将收到该方向的精准论文数据和作者数据。\n' +
  '\n' +
  '# 核心原则：聚焦细分，不要泛化\n' +
  '选定的方向本身仍然是一个比较宽泛的子领域（如"Semantic Communication for 6G"或"LLM-powered Code Generation"）。\n' +
  '你的任务不是复述这个宽泛方向，而是深入分析提供的 20 篇精准论文，找出论文中共同聚焦的【细分切入点】，提炼出一个【具体、可操作、投稿人一看就知道写什么的 Specific Topic】。\n' +
  '\n' +
  '错误的做法（太泛）：\n' +
  '- 标题："Semantic Communication for 6G Networks" → 这是 Phase 1 已经给的方向，太宽泛\n' +
  '- 标题："Large Language Models for Code Generation" → 同样太泛\n' +
  '\n' +
  '正确的做法（聚焦细分）：\n' +
  '- 标题："Joint Source-Channel Coding for Task-Oriented Semantic Communication in 6G"\n' +
  '- 标题："Retrieval-Augmented LLMs for Automated Program Repair: Benchmarks and Best Practices"\n' +
  '- 标题："Lightweight Semantic Feature Extraction for Edge Inference under Bandwidth Constraints"\n' +
  '\n' +
  '具体方法：\n' +
  '- 阅读论文标题和摘要，找到它们共同关注的技术维度（方法、场景、问题域）\n' +
  '- 用「XX技术 + YY场景 + ZZ问题」的结构组合出 Specific Topic\n' +
  '- 标题长度建议 12-20 个英文单词，中文对应长度\n' +
  '\n' +
  '# 任务要求\n' +
  '- 基于提供的论文和作者数据，为选定的方向生成 1 份完整的特刊策划方案\n' +
  '- 方案需包含：话题标题、摘要、关键词、推荐客编\n' +
  '- 标题必须聚焦细分，不能直接复述选定的方向名称\n' +
  '- 摘要需明确说明该细分的具体技术范围、适用场景和开放问题\n' +
  '- 推荐 3-5 位客编，必须是提供的作者数据中真实存在的学者\n' +
  '- 话题热度(topicHeat)根据该方向论文的被引量综合评估（0-1000）\n' +
  '\n' +
  '# JSON 输出格式（严格遵循，纯 JSON，不要 Markdown 代码块）\n' +
  '{\n' +
  '  "plan": {\n' +
  '    "zh": {\n' +
  '      "title": "话题中文标题（聚焦细分，12-20字）",\n' +
  '      "abstract": "中文摘要 300-500 字",\n' +
  '      "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]\n' +
  '    },\n' +
  '    "en": {\n' +
  '      "title": "English Title（Specific, 12-20 words）",\n' +
  '      "abstract": "English abstract 300-500 words",\n' +
  '      "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]\n' +
  '    },\n' +
  '    "guestEditors": [\n' +
  '      { "name": "Scholar Name", "institution": "University Name" }\n' +
  '    ],\n' +
  '    "topicHeat": <话题热度, 0-1000>,\n' +
  '    "sourceArticleIds": ["W123", "W456", "W789"],\n' +
  '    "sourceEditorIds": ["A111", "A222"]\n' +
  '  }\n' +
  '}\n' +
  '\n' +
  '# 关键规则\n' +
  '1. 所有数据必须源自提供的真实论文和作者数据，禁止编造任何论文、作者或机构信息。\n' +
  '2. sourceArticleIds 必须是从输入论文中选取的真实 ID，sourceEditorIds 同理。\n' +
  '3. 标题必须比选定的方向更细分聚焦，禁止直接用选定的方向名称作为话题标题。\n' +
  '4. 如果用户提供了附加要求，请在生成方案时严格遵守。\n' +
  '5. 纯 JSON 输出，不要 Markdown 代码块，不要解释文字。';

// ==================== OpenAlex 直连（带重试，不走 Proxy） ====================

function httpGetOnce(url, timeout) {
  timeout = timeout || 20000;
  return new Promise(function(resolve, reject) {
    var isHttps = url.indexOf('https') === 0;
    var client = isHttps ? https : http;
    var req = client.get(url, function(res) {
      var data = '';
      if (res.statusCode !== 200) {
        resolve({ statusCode: res.statusCode, data: null });
        return;
      }
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve({ statusCode: 200, data: JSON.parse(data) }); }
        catch (e) { resolve({ statusCode: 200, data: data }); }
      });
    });
    req.on('error', function(err) { reject(new Error('请求失败: ' + err.message)); });
    req.on('timeout', function() { req.destroy(); reject(new Error('请求超时')); });
    req.setTimeout(timeout);
  });
}

async function callOpenAlex(action, params) {
  // 构建请求 URL
  var url = '';
  if (action === 'searchWorks') {
    url = 'https://api.openalex.org/works?search=' + encodeURIComponent(params.query)
      + '&per-page=' + (params.perPage || 50)
      + '&sort=' + (params.sort || 'cited_by_count:desc');
    if (params.select) url += '&select=' + encodeURIComponent(params.select);
    if (params.fromYear) url += '&filter=from_publication_date:' + params.fromYear + '-01-01';
  } else if (action === 'getAuthorsByIds') {
    url = 'https://api.openalex.org/authors?filter=openalex_id:' + encodeURIComponent(params.ids)
      + '&per-page=' + (params.perPage || 50);
  }
  url += '&mailto=liushuaicai66@gmail.com';

  console.log('[OpenAlex] ' + action + ' URL:', url);

  // 直连 HTTP（3次重试，指数退避）
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(function(r) { setTimeout(r, 2000 * Math.pow(2, attempt - 1)); });
        console.log('[OpenAlex] 第' + (attempt + 1) + '次重试 ' + action);
      }
      var result = await httpGetOnce(url, 30000);
      if (result.statusCode === 200) {
        console.log('[OpenAlex] ' + action + ' 成功');
        return { success: true, data: result.data, url: url };
      }
      console.log('[OpenAlex] ' + action + ' 返回非200: ' + result.statusCode);
    } catch (err) {
      console.error('[OpenAlex] ' + action + ' 第' + (attempt + 1) + '次异常:', err.message);
    }
  }

  return { success: false, error: '请求失败', url: url };
}

// ==================== 数据精简 ====================

/** 从 abstract_inverted_index 还原纯文本摘要（截取前 600 字符） */
function rebuildAbstract(w) {
  var aii = w.abstract_inverted_index;
  if (!aii || typeof aii !== 'object') return '';
  var positions = [];
  Object.keys(aii).forEach(function(word) {
    var idxList = aii[word];
    if (!Array.isArray(idxList)) return;
    idxList.forEach(function(pos) {
      positions.push({ pos: pos, word: word });
    });
  });
  positions.sort(function(a, b) { return a.pos - b.pos; });
  return positions.map(function(p) { return p.word; }).join(' ').substring(0, 600);
}

/** 计算近两年引用总数 */
function calcHotRecent(cby) {
  var currentYear = new Date().getFullYear();
  var recent = 0;
  for (var i = 0; i < cby.length; i++) {
    if (cby[i].year >= currentYear - 2) {
      recent += cby[i].cited_by_count || 0;
    }
  }
  return recent;
}

function simplifyWorks(rawWorks) {
  if (!Array.isArray(rawWorks)) return [];
  return rawWorks.map(function(w) {
    var cby = (w.counts_by_year || []).slice().sort(function(a, b) { return (a.year || 0) - (b.year || 0); });
    var years = [], citationsByYear = [];
    for (var i = 0; i < cby.length; i++) {
      years.push(cby[i].year);
      citationsByYear.push(cby[i].cited_by_count || 0);
    }
    var loc = w.primary_location || {};
    var src = loc.source || {};
    var cnp = w.citation_normalized_percentile || {};
    return {
      id: (w.id || '').split('/').pop(),
      title: w.display_name || w.title || '',
      abstract: rebuildAbstract(w),
      authors: (w.authorships || []).map(function(a) {
        return (a.author && a.author.display_name) || '';
      }).filter(Boolean),
      cc: citationsByYear.reduce(function(s, v) { return s + (v || 0); }, 0) || w.cited_by_count || 0,
      year: w.publication_year || 0,
      url: w.id || '',
      doi: w.doi || '',
      citationsByYear: { years: years, counts: citationsByYear },
      // 新增：结构化标注 + 关键指标
      type: w.type || '',
      journal: src.display_name || '',
      topics: (w.primary_topic ? [w.primary_topic.display_name || ''] : []),
      keywords: (w.keywords || []).map(function(k) { return k.display_name || ''; }),
      fwci: typeof w.fwci === 'number' ? w.fwci : 0,
      citationPercentile: {
        value: cnp.value || null,
        isTop1: cnp.is_in_top_1_percent || false,
        isTop10: cnp.is_in_top_10_percent || false
      },
      hotRecent: calcHotRecent(cby)
    };
  });
}

function simplifyAuthorsWithYearly(rawAuthors) {
  if (!Array.isArray(rawAuthors)) return [];
  return rawAuthors.map(function(a) {
    var cby = a.counts_by_year || [];
    var affs = a.affiliations || [];
    var affList = affs.map(function(af) {
      var inst = af.institution || {};
      return {
        id: inst.id ? inst.id.split('/').pop() : '',
        ror: inst.ror || '',
        displayName: inst.display_name || '',
        countryCode: inst.country_code || '',
        type: inst.type || '',
        years: af.years || []
      };
    });
    return {
      id: (a.id || '').split('/').pop(),
      n: a.display_name || '',
      inst: (a.last_known_institution && a.last_known_institution.display_name) || '',
      wc: a.works_count || 0,
      cc: a.cited_by_count || 0,
      h: (a.summary_stats && a.summary_stats.h_index) || 0,
      i10: (a.summary_stats && a.summary_stats.i10_index) || 0,
      top: (a.topics || []).slice(0, 3).map(function(t) { return t.display_name || ''; }),
      countsByYear: cby,
      affiliations: affList
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
  if (!json) return;
  var plans = json.plans || (json.plan ? [json.plan] : []);
  if (plans.length === 0) return;

  var validPaperIds = {};
  var validAuthorIds = {};
  for (var i = 0; i < sourcePapers.length; i++) validPaperIds[sourcePapers[i].id] = true;
  for (var i = 0; i < sourceAuthors.length; i++) validAuthorIds[sourceAuthors[i].id] = true;

  console.log('[validateSourceRefs] validPaperIds 样本(前5):', JSON.stringify(Object.keys(validPaperIds).slice(0, 5)));
  for (var p = 0; p < plans.length; p++) {
    var plan = plans[p];
    var rawIds = plan.sourceArticleIds || [];
    console.log('[validateSourceRefs] plan[' + p + '] key=' + plan.key + ' 原始IDs (' + rawIds.length + '个):', JSON.stringify(rawIds));
    plan.sourceArticleIds = rawIds.filter(function(id) {
      var isValid = validPaperIds[id];
      if (!isValid) console.log('[validateSourceRefs] plan[' + p + '] 无效ID:', JSON.stringify(id));
      return isValid;
    });
    console.log('[validateSourceRefs] plan[' + p + '] 过滤后有效IDs (' + plan.sourceArticleIds.length + '个):', JSON.stringify(plan.sourceArticleIds));
    if (sourceAuthors && sourceAuthors.length > 0) {
      plan.sourceEditorIds = (plan.sourceEditorIds || []).filter(function(id) { return validAuthorIds[id]; });
    }
    // 校正 paperCount
    plan.paperCount = plan.sourceArticleIds.length;
  }

  // 兼容旧格式：如果只有一个 plan，也设置 json.plan
  if (plans.length === 1 && !json.plan) {
    json.plan = plans[0];
  }
}

// ==================== LLM 调用（统一走 aiChat） ====================

function getProviderQueue(options) {
  options = options || {};
  var raw = options.provider || process.env.SPECIAL_ISSUE_AI_PROVIDER || 'kimi,deepseek';
  if (Array.isArray(raw)) return raw;
  return String(raw).split(',').map(function(p) { return p.trim(); }).filter(Boolean);
}

function getModelForProvider(provider, options) {
  options = options || {};
  if (options.model) return options.model;
  var envKey = 'SPECIAL_ISSUE_' + String(provider).toUpperCase() + '_MODEL';
  return process.env[envKey] || '';
}

async function callLLM(messages, options) {
  options = options || {};
  var timeout = options.timeout || 55000;
  var maxTokens = options.maxTokens || 8192;
  var providers = getProviderQueue(options);
  var errors = [];

  for (var i = 0; i < providers.length; i++) {
    var provider = providers[i];
    try {
      console.log('[LLM] 调用 aiChat provider:', provider);
      var providerMaxTokens = provider === 'deepseek' ? Math.max(maxTokens, 8192) : maxTokens;
      var data = {
        action: 'chat',
        provider: provider,
        messages: messages,
        stream: false,
        maxTokens: providerMaxTokens,
        temperature: options.temperature !== undefined ? options.temperature : (provider === 'kimi' ? 1 : 0.2),
        timeout: timeout
      };
      var model = getModelForProvider(provider, options);
      if (model) data.model = model;

      var res = await cloud.callFunction({
        name: 'aiChat',
        data: data,
        timeout: timeout + 15000
      });
      var result = res.result || {};
      if (result.success && result.content) {
        console.log('[LLM] aiChat 成功 provider:', provider, 'model:', result.model || '');
        return {
          content: result.content,
          usage: result.usage || {},
          provider: result.provider || provider,
          model: result.model || model || ''
        };
      }
      throw new Error(result.error || 'aiChat 返回空内容');
    } catch (e) {
      var msg = e.message || String(e);
      console.error('[LLM] aiChat 失败 provider:', provider, msg);
      errors.push(provider + ': ' + msg);
    }
  }

  throw new Error('AI 服务调用失败: ' + errors.join(' | '));
}

// ==================== Prompt 构建 ====================

function buildPhase1UserMessage(keyword, papers, totalPapers, constraints) {
  var lines = [];
  lines.push('# 任务');
  lines.push('禁止输出推理过程、分析过程、Markdown 或解释文字。只输出一个可被 JSON.parse 解析的 JSON 对象。');
  lines.push('基于以下研究关键词的论文数据，分析并生成 3 个差异化明显的特刊研究方向。每个方向都必须有真实论文支撑，方向之间不能重复或过于相似。');
  lines.push('');
  lines.push('# 用户原始搜索关键词（核心约束）');
  lines.push('"' + keyword + '"');
  lines.push('【硬性要求】用户输入的每个关键词/主题都必须在生成的方向中得到体现。如果用户输入多个关键词（如 "ai, material"），说明用户希望看到这些领域的交叉或并行的研究方向。不要只聚焦于其中一个热门词，必须让每个关键词都有对应的独立方向。');
  lines.push('');
  lines.push('# 论文数据（共 ' + totalPapers + ' 篇，展示前 ' + papers.length + ' 篇）');
  lines.push(JSON.stringify(papers, null, 2));
  lines.push('');

  if (constraints) {
    lines.push('# 用户附加要求（必须严格遵守）');
    lines.push(constraints);
    lines.push('');
  }

  lines.push('# 输出格式要求');
  lines.push('请返回 JSON 格式，包含一个 plans 数组（固定 3 个方向；数据不足时可为 2 个），每个方向字段如下：');
  lines.push('- key: 方向唯一标识（如 d1, d2, d3）');
  lines.push('- zh/en: 中英文标题、摘要、关键词。中文摘要 80-150 字，英文摘要 80-150 words');
  lines.push('- searchKeywords: 用于精准搜索该方向论文的英文关键词（2-5 个），直接影响第二阶段论文质量');
  lines.push('- topicHeat: 该方向热度（依据该方向论文被引量总和，0-1000）');
  lines.push('- sourceArticleIds: 该方向依据的论文 ID 数组，每个方向选取 5-8 篇最能代表该方向的论文（必须从提供的论文中选取真实 ID）');
  lines.push('');
  lines.push('# 论文数据字段说明');
  lines.push('每篇论文包含以下字段，请仔细阅读：');
  lines.push('- id, title, abstract: 论文标识、标题、摘要（聚类主要依据）');
  lines.push('- authors, year, journal, type: 作者、年份、期刊名、文献类型');
  lines.push('- cc: 被引总量（cited_by_count）');
  lines.push('- fwci: 领域加权引用影响力（Field-Weighted Citation Impact，跨领域可比的引用指标）');
  lines.push('- citationPercentile: 引用百分位（含 isTop1/isTop10 布尔值）');
  lines.push('- hotRecent: 近两年被引次数之和，反映当下热度');
  lines.push('- topics/keywords: OpenAlex 标注的话题分类和论文关键词');
  lines.push('');
  lines.push('注意：');
  lines.push('1. sourceArticleIds 中的 ID 必须真实存在于输入数据中，禁止编造。每个方向选 5-8 篇。');
  lines.push('2. 方向之间必须有明显差异，覆盖不同研究子领域。');
  lines.push('3. searchKeywords 要精准、学术化，将用于重新搜索该方向的论文。');
  lines.push('4. 同一篇论文可以归属多个方向（如一篇交叉学科论文）。');
  lines.push('5. sourceArticleIds 中的论文应尽量分散在不同年份和子主题上，确保覆盖广度。');
  lines.push('6.【核心】用户原始关键词的每个主题都必须有至少一个对应方向。不要让某个热门词主导所有输出——如果用户搜 "ai,material"，应该同时出现 AI 相关方向和材料科学相关方向，而非全部偏向 AI。');

  return lines.join('\n');
}

function buildPhase2UserMessage(directionInfo, papers, authors, totalPapers, totalAuthors, constraints, templates) {
  var lines = [];
  lines.push('# 任务');
  lines.push('你收到了一个【已经选定的大方向】和该方向的 20 篇精准论文。请做两件事：');
  lines.push('');
  lines.push('1. 分析这 20 篇论文的共同聚焦点，找到它们集中研究的【细分切入点】（技术维度 × 场景维度 × 问题维度）');
  lines.push('2. 基于该细分切入点，生成一份聚焦的特刊方案。话题标题必须是比选定方向更具体的细分话题，禁止直接复用选定方向的名称。');
  lines.push('');

  // 注入真实期刊方案作为格式参照
  if (templates && templates.length > 0) {
    lines.push('# 真实期刊特刊参照（仅供格式参考，切忌模仿内容）');
    lines.push('');
    lines.push('重要提示：以下是真实学术期刊已发布的特刊方案，仅作为【格式和风格】的参考标准。');
    lines.push('你需要学习的是：');
    lines.push('1. 标题的聚焦程度与命名方式（窄而有深度，非宽泛）');
    lines.push('2. 摘要的段落结构、信息密度与专业口吻');
    lines.push('3. 关键词的数量与覆盖面（通常 5-10 个）');
    lines.push('4. 方案的整体篇幅与详略分布');
    lines.push('');
    lines.push('严格禁止：直接照搬以下方案的学科方向、话题内容、专有名词。');
    lines.push('你的方案必须基于「选定的方向」和「论文数据」来生成，内容必须与这些数据强相关。');
    lines.push('');
    for (var t = 0; t < templates.length; t++) {
      lines.push('## 格式参照样本 ' + (t + 1));
      lines.push(JSON.stringify(templates[t], null, 2));
      lines.push('');
    }
  }

  lines.push('# 选定的方向（宽泛，仅作参考）');
  lines.push(JSON.stringify(directionInfo, null, 2));
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
  lines.push('- zh/en: 中英文标题（必须比选定方向更细分聚焦）、摘要、关键词');
  lines.push('- guestEditors: 推荐客编数组（含 name, institution），每方案 3-5 位');
  lines.push('- topicHeat: 话题热度评估（依据论文被引量，0-1000）');
  lines.push('- sourceArticleIds: 依据的论文 ID 数组（必须从提供的论文中选取）');
  lines.push('- sourceEditorIds: 推荐客编对应的作者 ID 数组（必须从提供的作者中选取）');
  lines.push('');
  lines.push('注意：sourceArticleIds 和 sourceEditorIds 中的 ID 必须真实存在于输入数据中，禁止编造。');

  return lines.join('\n');
}

// ==================== 获取方案模版（真实期刊数据 + 关键词匹配） ====================
async function fetchPlanTemplates(directionKeywords, limit) {
  limit = limit || 3;
  try {
    // 尝试从 special_issue_templates 查
    var countRes = await db.collection(TEMPLATE_COLLECTION).count();
    var totalCount = countRes.total || 0;
    if (totalCount === 0) {
      return [];
    }

    // 获取所有模版（做关键词匹配）
    // 如果数量较大，分页获取；通常 939 条也很快
    var BATCH = 100;
    var allTemplates = [];
    for (var offset = 0; offset < totalCount; offset += BATCH) {
      var docs = await db.collection(TEMPLATE_COLLECTION).skip(offset).limit(BATCH).get();
      allTemplates = allTemplates.concat(docs.data);
    }

    // 关键词归一化：小写 + 去空格
    var dirKwSet = {};
    if (directionKeywords && directionKeywords.length > 0) {
      for (var k = 0; k < directionKeywords.length; k++) {
        var kw = (directionKeywords[k] || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ' ').trim();
        if (kw.length >= 2) {
          var tokens = kw.split(/\s+/);
          for (var t = 0; t < tokens.length; t++) {
            if (tokens[t].length >= 2) dirKwSet[tokens[t]] = true;
          }
        }
      }
    }

    // 计算每条模版的匹配分
    var scored = [];
    for (var i = 0; i < allTemplates.length; i++) {
      var tmpl = allTemplates[i];
      var keywords = tmpl.keywords || [];
      var score = 0;
      for (var j = 0; j < keywords.length; j++) {
        var tkw = (keywords[j] || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ' ').trim();
        if (tkw.length < 2) continue;
        var tTokens = tkw.split(/\s+/);
        for (var u = 0; u < tTokens.length; u++) {
          if (tTokens[u].length >= 2 && dirKwSet[tTokens[u]]) {
            score++;
            break; // 每个关键词只计1分
          }
        }
      }
      if (score > 0 || allTemplates.length <= limit * 3) {
        scored.push({ template: tmpl, score: score });
      }
    }

    // 按匹配分降序，同分随机
    scored.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return Math.random() - 0.5;
    });

    // 取 Top N，并加入 1 个低分/零分模版保证多样性
    var result = [];
    var seenSources = {};
    for (var s = 0; s < scored.length && result.length < limit; s++) {
      var item = scored[s];
      // 避免同一期刊重复
      if (seenSources[item.template.source]) continue;
      seenSources[item.template.source] = true;

      var clean = {
        source: item.template.source,
        topic: item.template.topic,
        summary: item.template.summary ? item.template.summary.substring(0, 400) : '',
        keywords: item.template.keywords || [],
        _matchScore: item.score
      };
      result.push(clean);
    }

    return result;
  } catch (e) {
    console.error('[fetchPlanTemplates] 查询失败:', e.message);
    return [];
  }
}

// ==================== 工具函数 ====================

function genTaskId() {
  return 'si_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

function initSteps() {
  return [
    { key: 'search_papers',   label: '搜索论文数据',              status: 'pending' },
    { key: 'trend_analysis',  label: 'AI 趋势分析（聚类方向）',    status: 'pending' },
    { key: 'parse_result',    label: '解析并保存结果',             status: 'pending' }
  ];
}

function initPhase2Steps() {
  return [
    { key: 'search_papers_2',  label: '按方向关键词重搜论文',       status: 'pending' },
    { key: 'fetch_authors_2',  label: '提取论文作者并查询详情',      status: 'pending' },
    { key: 'generate_plan',    label: 'AI 生成完整策划方案',         status: 'pending' },
    { key: 'parse_result_2',   label: '解析并保存方案',             status: 'pending' }
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

// ==================== Scheme 进度更新辅助 ====================
async function updateSchemeProgress(schemeId, progress) {
  try {
    var data = { progress: progress, updatedAt: Date.now() };
    await db.collection(SCHEME_COLLECTION).doc(schemeId).update({ data: data });
  } catch (e) { /* 忽略 */ }
}

async function updateSchemeStepStatus(schemeId, steps, stepKey, status) {
  for (var i = 0; i < steps.length; i++) {
    if (steps[i].key === stepKey) {
      steps[i].status = status;
      if (status === 'running') steps[i].startedAt = Date.now();
      if (status === 'completed') steps[i].completedAt = Date.now();
      break;
    }
  }
  try {
    await db.collection(SCHEME_COLLECTION).doc(schemeId).update({
      data: { steps: steps, updatedAt: Date.now() }
    });
  } catch (e) { /* 忽略 */ }
}

async function deductCredits(taskId, points, openid) {
  try {
    var res = await cloud.callFunction({
      name: 'creditsAPI',
      data: {
        action: 'spendCredits',
        actionType: 'special_issue',
        points: points,
        description: '特刊策划 -' + points,
        relatedId: taskId,
        _openid: openid
      }
    });
    if (!res.result) {
      return { success: false, error: 'creditsAPI 无返回' };
    }
    if (!res.result.success) {
      return { success: false, error: res.result.error || '积分扣费失败', insufficient: res.result.insufficient, balance: res.result.balance };
    }
    return { success: true, result: res.result };
  } catch (e) {
    console.error('[deductCredits] 异常:', e.message || e);
    return { success: false, error: e.message || '积分扣费异常' };
  }
}

function markRunningStepFailed(steps) {
  steps = steps || [];
  for (var i = 0; i < steps.length; i++) {
    if (steps[i].status === 'running') {
      steps[i].status = 'failed';
      steps[i].completedAt = Date.now();
      break;
    }
  }
  return steps;
}

async function markStaleProcessingTask(task) {
  if (!task || task.status !== 'processing') return task;

  var lastActiveAt = task.updatedAt || task.createdAt || 0;
  if (!lastActiveAt || Date.now() - lastActiveAt < 70000) return task;

  var steps = markRunningStepFailed(task.steps || []);

  var updateData = {
    status: 'failed',
    error: task.error || '任务执行超时，请重新执行',
    steps: steps,
    updatedAt: Date.now()
  };

  try {
    await db.collection(TASK_COLLECTION).doc(task._id).update({ data: updateData });
  } catch (e) {
    console.error('[markStaleProcessingTask] 更新失败:', task._id, e.message || e);
  }

  return Object.assign({}, task, updateData);
}

function getRetryPhase(task) {
  if (!task) return 'phase1';
  var steps = task.steps || [];
  for (var i = 0; i < steps.length; i++) {
    if (String(steps[i].key || '').indexOf('_2') >= 0) return 'phase2';
  }
  if (task.activeSchemeId) return 'phase2';
  if (task.progress && String(task.progress).indexOf('phase2') >= 0) return 'phase2';
  return 'phase1';
}

// ==================== doFullPipeline（Phase 1：趋势分析） ====================

async function doFullPipeline(keyword, constraints, taskId, openid, isRetry) {
  var searchQuery = (keyword || '').trim();
  var steps = initSteps();

  // ===== Step 1: 按照相关性查询200篇文章 =====
  await updateTaskProgress(taskId, 'searching');
  await updateStepStatus(taskId, steps, 'search_papers', 'running');

  var recentYear = new Date().getFullYear() - 2;
  var selectFields = 'id,display_name,authorships,cited_by_count,publication_year,doi,primary_location,primary_topic,keywords,fwci,citation_normalized_percentile,counts_by_year,type';
  var worksRes = await callOpenAlex('searchWorks', { query: searchQuery, fromYear: recentYear, perPage: 50, sort: 'relevance_score:desc', select: selectFields });

  if (!worksRes.success) {
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: '执行失败，请稍后重试', searchUrl: worksRes.url || '', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  var rawPapers = (worksRes.data && worksRes.data.results) || [];
  // 按引用量重排：相关性由 OpenAlex 保证，引用量体现影响力
  // rawPapers.sort(function(a, b) { return (b.cited_by_count || 0) - (a.cited_by_count || 0); });
  // rawPapers = rawPapers.slice(0, 100);
  var sourcePapers = simplifyWorks(rawPapers);
  var totalPapers = (worksRes.data && worksRes.data.meta && worksRes.data.meta.count) || rawPapers.length;
  console.log('[Phase1] OpenAlex 返回论文:', rawPapers.length, '篇, total:', totalPapers);
  await updateStepStatus(taskId, steps, 'search_papers', 'completed');
  // 保存搜索链接到任务文档
  await db.collection(TASK_COLLECTION).doc(taskId).update({
    data: { searchUrl: worksRes.url || '', updatedAt: Date.now() }
  }).catch(function() {});

  // ===== Step 2: AI 趋势分析（仅传论文，不传作者）=====
  await updateTaskProgress(taskId, 'trend_analysis');
  await updateStepStatus(taskId, steps, 'trend_analysis', 'running');

  var userMsg = buildPhase1UserMessage(keyword, sourcePapers, totalPapers, constraints);
  console.log('[Phase1] 开始调用 AI LLM, papers:', sourcePapers.length);
  var llm;
  try {
    llm = await callLLM([
      { role: 'system', content: PHASE1_SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ], { timeout: 600000, maxTokens: 3072 });
  } catch (e) {
    console.error('[Phase1] LLM 调用失败:', e.message);
    steps = markRunningStepFailed(steps);
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: 'AI 趋势分析失败: ' + (e.message || '未知错误'), steps: steps, updatedAt: Date.now() }
    });
    return;
  }
  console.log('[Phase1] AI LLM 返回, provider:', llm.provider || '', 'model:', llm.model || '', 'usage:', JSON.stringify(llm.usage || {}));
  await updateStepStatus(taskId, steps, 'trend_analysis', 'completed');

  // ===== Step 3: 解析结果 =====
  await updateStepStatus(taskId, steps, 'parse_result', 'running');

  var json = extractJSON(llm.content);
  if (!json) {
    console.error('[Phase1] AI 返回数据解析失败, content head:', String(llm.content || '').substring(0, 500));
    console.error('[Phase1] AI 返回数据解析失败, content tail:', String(llm.content || '').slice(-500));
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: 'AI 返回数据解析失败', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  // Phase 1 只校验 sourceArticleIds（无作者数据）
  validateSourceRefs(json, sourcePapers, []);

  // ===== 代码层计算统计量（无需 LLM 估算，精确可靠）=====
  var paperMap = {};
  for (var i = 0; i < sourcePapers.length; i++) {
    paperMap[sourcePapers[i].id] = sourcePapers[i];
  }

  var plans = json.plans || [];
  var allReferencedIds = {};
  for (var p = 0; p < plans.length; p++) {
    var plan = plans[p];
    var ids = plan.sourceArticleIds || [];
    console.log('[Phase1 统计] plan[' + p + '] key=' + plan.key + ' sourceArticleIds (' + ids.length + '个):', JSON.stringify(ids));
    console.log('[Phase1 统计] plan[' + p + '] paperMap keys 样本(前5):', JSON.stringify(Object.keys(paperMap).slice(0, 5)));
    var matched = [];
    var citations = [], fwcis = [], hots = [], topCount = 0;

    for (var j = 0; j < ids.length; j++) {
      var pap = paperMap[ids[j]];
      if (!pap) {
        console.log('[Phase1 统计] plan[' + p + '] ID不匹配:', ids[j]);
        continue;
      }
      matched.push(pap);
      citations.push(pap.cc || 0);
      fwcis.push(pap.fwci || 0);
      hots.push(pap.hotRecent || 0);
      if (pap.citationPercentile && pap.citationPercentile.isTop10) topCount++;
    }

    console.log('[Phase1 统计] plan[' + p + '] 匹配到 ' + matched.length + ' 篇论文');
    if (matched.length > 0) {
      console.log('[Phase1 统计] plan[' + p + '] citations:', JSON.stringify(citations), 'fwcis:', JSON.stringify(fwcis), 'hots:', JSON.stringify(hots));
    }

    var n = matched.length || 1;
    plan.avgCitations = Math.round(citations.reduce(function(a, b) { return a + b; }, 0) / n);
    plan.avgFWCI = Math.round((fwcis.reduce(function(a, b) { return a + b; }, 0) / n) * 100) / 100;
    plan.topJournalRatio = Math.round((topCount / n) * 100) / 100;
    plan.hotRecentAvg = Math.round(hots.reduce(function(a, b) { return a + b; }, 0) / n);
    plan.paperCount = matched.length;

    // 收集引用论文 ID
    for (var k = 0; k < ids.length; k++) {
      if (paperMap[ids[k]]) allReferencedIds[ids[k]] = true;
    }
  }

  // ===== 只保存被引用的论文（不存全部 100 篇）=====
  var referencedPapers = sourcePapers.filter(function(p) { return allReferencedIds[p.id]; });

  await updateStepStatus(taskId, steps, 'parse_result', 'completed');

  // ===== 写入结果 + 扣积分（重试不扣） =====
  var completedAt = Date.now();
  var deductResult = { success: true };
  if (!isRetry) {
    deductResult = await deductCredits(taskId, 30, openid);
  }
  var resultData = json.plans ? { plans: json.plans } : json;

  await db.collection(TASK_COLLECTION).doc(taskId).update({
    data: {
      status: 'awaiting_selection',
      phase1Usage: llm.usage,
      progress: 'awaiting_selection',
      steps: steps,
      creditsDeducted: deductResult.success,
      completedAt: completedAt,
      updatedAt: completedAt,
      // 清除旧残留字段
      result: db.command.remove(),
      sourcePapers: db.command.remove(),
      totalPapers: db.command.remove()
    }
  });

  // ===== 写入 special_issue_directions（每个方向存各自引用的论文）=====
  // 先按热度降序排序，热度高的排在前面
  if (resultData.plans && resultData.plans.length > 0) {
    resultData.plans.sort(function(a, b) { return (b.topicHeat || 0) - (a.topicHeat || 0); });
  }
  for (var dp = 0; dp < (resultData.plans || []).length; dp++) {
    var dPlan = resultData.plans[dp];
    var dirArticleIds = dPlan.sourceArticleIds || [];
    var idSet = {};
    for (var ai = 0; ai < dirArticleIds.length; ai++) { idSet[dirArticleIds[ai]] = true; }
    var dirPapers = referencedPapers.filter(function(p) { return idSet[p.id]; });
    console.log('[Phase1 写入] direction[' + dp + '] key=' + dPlan.key, 
      'avgCitations=' + dPlan.avgCitations, 
      'avgFWCI=' + dPlan.avgFWCI, 
      'hotRecentAvg=' + dPlan.hotRecentAvg, 
      'topJournalRatio=' + dPlan.topJournalRatio,
      'paperCount=' + dPlan.paperCount,
      'dirPapers=' + dirPapers.length);
    try {
      var dirId = taskId + '_' + dPlan.key;
      await db.collection(DIRECTION_COLLECTION).doc(dirId).set({
        data: {
          taskId: taskId,
          _openid: openid,
          key: dPlan.key,
          zh: dPlan.zh || {},
          en: dPlan.en || {},
          searchKeywords: dPlan.searchKeywords || [],
          topicHeat: dPlan.topicHeat || 0,
          avgCitations: dPlan.avgCitations || 0,
          avgFWCI: dPlan.avgFWCI || 0,
          topJournalRatio: dPlan.topJournalRatio || 0,
          hotRecentAvg: dPlan.hotRecentAvg || 0,
          paperCount: dPlan.paperCount || 0,
          sourceArticleIds: dirArticleIds,
          sourcePapers: dirPapers,
          createdAt: completedAt
        }
      });
    } catch (e) {
      console.error('[Phase1] 写入方向失败, key:', dPlan.key, e.message);
    }
  }

}

// ==================== doPhase2Pipeline（Phase 2：方案生成） ====================

async function doPhase2Pipeline(taskId, schemeId, keyword, constraints, selectedDirection, openid, isRegeneration) {
  var steps = initPhase2Steps();

  // ===== Step 1: 按方向关键词重新搜索论文（20篇，按被引量降序）=====
  await updateSchemeProgress(schemeId, 'phase2_searching', taskId);
  await updateSchemeStepStatus(schemeId, steps, 'search_papers_2', 'running', taskId);

  // 使用方向的 searchKeywords 或 zh.keywords 作为搜索词
  var searchTerms = selectedDirection.searchKeywords || (selectedDirection.en && selectedDirection.en.keywords) || (selectedDirection.zh && selectedDirection.zh.keywords) || [];
  var searchQuery = searchTerms.length > 0 ? searchTerms.slice(0, 3).join(' ') : (keyword || '').replace(/[,，、;；]+/g, ' ').replace(/\s+/g, ' ').trim();

  var recentYear = new Date().getFullYear() - 2;
  var selectFields2 = 'id,display_name,authorships,cited_by_count,publication_year,doi,primary_location,primary_topic,keywords,fwci,citation_normalized_percentile,counts_by_year,type';
  var worksRes = await callOpenAlex('searchWorks', { query: searchQuery, fromYear: recentYear, perPage: 50, sort: 'relevance_score:desc', select: selectFields2 });

  if (!worksRes.success) {
    await db.collection(SCHEME_COLLECTION).doc(schemeId).update({
      data: { status: 'failed', error: '执行失败，请稍后重试', searchUrl: worksRes.url || '', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  var rawPapers = (worksRes.data && worksRes.data.results) || [];
  var sourcePapers = simplifyWorks(rawPapers);
  var totalPapers = (worksRes.data && worksRes.data.meta && worksRes.data.meta.count) || rawPapers.length;

  // 重新生成时随机打乱论文顺序并选取随机子集，让 AI 每次看到不同的论文
  var llmPapers = sourcePapers;
  if (isRegeneration && sourcePapers.length > 15) {
    // Fisher-Yates shuffle
    var shuffled = sourcePapers.slice();
    for (var si = shuffled.length - 1; si > 0; si--) {
      var ri = Math.floor(Math.random() * (si + 1));
      var tmp = shuffled[si]; shuffled[si] = shuffled[ri]; shuffled[ri] = tmp;
    }
    // 随机取 20-35 篇传给 AI（确保每次看到的子集不同）
    var takeN = 20 + Math.floor(Math.random() * Math.min(16, shuffled.length - 20));
    llmPapers = shuffled.slice(0, takeN);
    console.log('[Phase2 重新生成] 随机打乱论文, 取 ' + takeN + '/' + sourcePapers.length + ' 篇传给 AI');
  }

  await updateSchemeStepStatus(schemeId, steps, 'search_papers_2', 'completed', taskId);
  try {
    await db.collection(SCHEME_COLLECTION).doc(schemeId).update({
      data: { searchUrl: worksRes.url || '', updatedAt: Date.now() }
    });
  } catch (e) { /* ignore */ }

  // ===== Step 2: 提取作者并查询详情 =====
  await updateSchemeProgress(schemeId, 'phase2_fetching_authors', taskId);
  await updateSchemeStepStatus(schemeId, steps, 'fetch_authors_2', 'running', taskId);

  var authorIdSet = {};
  for (var i = 0; i < rawPapers.length; i++) {
    var authorships = rawPapers[i].authorships || [];
    for (var j = 0; j < authorships.length; j++) {
      var author = authorships[j].author;
      if (author && author.id) { authorIdSet[author.id] = true; }
    }
  }
  var authorIds = Object.keys(authorIdSet);

  var BATCH_SIZE = 50;
  var sourceAuthors = [];
  for (var start = 0; start < authorIds.length; start += BATCH_SIZE) {
    var batchIds = authorIds.slice(start, start + BATCH_SIZE);
    var idFilter = batchIds.map(function(id) { return (id || '').split('/').pop(); }).join('|');
    var batchRes = await callOpenAlex('getAuthorsByIds', { ids: idFilter });
    if (batchRes.success && batchRes.data && batchRes.data.results) {
      sourceAuthors = sourceAuthors.concat(simplifyAuthorsWithYearly(batchRes.data.results));
    }
  }

  sourceAuthors.sort(function(a, b) { return b.h - a.h; });
  var llmAuthors = sourceAuthors.slice(0, 20);
  await updateSchemeStepStatus(schemeId, steps, 'fetch_authors_2', 'completed', taskId);

  // ===== Step 3: AI 生成完整方案 =====
  await updateSchemeProgress(schemeId, 'phase2_generating', taskId);
  await updateSchemeStepStatus(schemeId, steps, 'generate_plan', 'running', taskId);

  // 获取真实期刊模版（关键词匹配）
  var directionKeywords = (selectedDirection.zh && selectedDirection.zh.keywords) || [];
  var enKeywords = (selectedDirection.en && selectedDirection.en.keywords) || [];
  var searchKeywords = selectedDirection.searchKeywords || [];
  var allDirectionKw = directionKeywords.concat(enKeywords).concat(searchKeywords);
  var templates = await fetchPlanTemplates(allDirectionKw, 3);

  // 构建方向摘要信息传给 LLM
  var directionInfo = {
    originalKeyword: keyword,
    title: selectedDirection.zh ? selectedDirection.zh.title : (selectedDirection.en ? selectedDirection.en.title : ''),
    abstract: selectedDirection.zh ? selectedDirection.zh.abstract : (selectedDirection.en ? selectedDirection.en.abstract : ''),
    keywords: selectedDirection.zh ? selectedDirection.zh.keywords : (selectedDirection.en ? selectedDirection.en.keywords : []),
    topicHeat: selectedDirection.topicHeat || 0
  };
  var userMsg = buildPhase2UserMessage(directionInfo, llmPapers, llmAuthors, totalPapers, authorIds.length, constraints, templates);

  var llm;
  try {
    var llmMessages = [{ role: 'system', content: PHASE2_SYSTEM_PROMPT }];
    if (isRegeneration) {
      llmMessages.push({ role: 'system', content: '# 重新生成提示\n此次为重新生成，请优先选取与之前不同的论文作为 sourceArticleIds，并从不同的角度撰写方案标题和摘要。' });
    }
    llmMessages.push({ role: 'user', content: userMsg });
    llm = await callLLM(llmMessages, { timeout: 600000, maxTokens: 4096 });
  } catch (e) {
    console.error('[Phase2] LLM 调用失败:', e.message);
    steps = markRunningStepFailed(steps);
    await db.collection(SCHEME_COLLECTION).doc(schemeId).update({
      data: { status: 'failed', error: 'AI 方案生成失败: ' + (e.message || '未知错误'), steps: steps, updatedAt: Date.now() }
    });
    return;
  }
  await updateSchemeStepStatus(schemeId, steps, 'generate_plan', 'completed', taskId);

  // ===== Step 4: 解析结果 =====
  await updateSchemeStepStatus(schemeId, steps, 'parse_result_2', 'running', taskId);

  var json = extractJSON(llm.content);
  if (!json) {
    await db.collection(SCHEME_COLLECTION).doc(schemeId).update({
      data: { status: 'failed', error: 'Phase 2 AI 返回数据解析失败', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  // 校验引用关系
  validateSourceRefs(json, sourcePapers, sourceAuthors);

  // 确保 plan 存在
  var plan = json.plan || (json.plans && json.plans[0]);
  if (!plan) {
    await db.collection(SCHEME_COLLECTION).doc(schemeId).update({
      data: { status: 'failed', error: 'Phase 2 AI 返回数据缺少 plan 字段', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  // 用 sourceEditorIds 关联 sourceAuthors，补全 guestEditors 的完整字段
  var editorIdsMap = {};
  if (Array.isArray(plan.sourceEditorIds)) {
    for (var ei = 0; ei < plan.sourceEditorIds.length; ei++) {
      editorIdsMap[plan.sourceEditorIds[ei]] = true;
    }
  }
  var authorById = {};
  for (var ai = 0; ai < sourceAuthors.length; ai++) {
    authorById[sourceAuthors[ai].id] = sourceAuthors[ai];
  }
  if (Array.isArray(plan.guestEditors) && Array.isArray(plan.sourceEditorIds)) {
    for (var gi = 0; gi < plan.guestEditors.length; gi++) {
      var eid = plan.sourceEditorIds[gi];
      var fullAuthor = authorById[eid];
      if (fullAuthor) {
        Object.assign(plan.guestEditors[gi], {
          id: fullAuthor.id,
          worksCount: fullAuthor.wc,
          citedByCount: fullAuthor.cc,
          hIndex: fullAuthor.h,
          i10Index: fullAuthor.i10,
          topics: fullAuthor.top,
          countsByYear: fullAuthor.countsByYear,
          affiliations: fullAuthor.affiliations
        });
      }
    }
  }

  await updateSchemeStepStatus(schemeId, steps, 'parse_result_2', 'completed', taskId);

  // ===== 只通过 scheme 表跟踪进度，不再同步 task =====
  var completedAt = Date.now();
  await db.collection(SCHEME_COLLECTION).doc(schemeId).update({
    data: {
      status: 'completed',
      plan: plan,
      sourcePapers: sourcePapers,
      sourceAuthors: sourceAuthors,
      usage: llm.usage,
      progress: 'completed',
      steps: steps,
      completedAt: completedAt,
      updatedAt: completedAt
    }
  });

  // 重新生成方案时，完成后扣积分
  if (isRegeneration) {
    await deductCredits(taskId, 15, openid);
  }

}

// ==================== doRegeneratePipeline（重新生成 Phase 1 方向） ====================

async function doRegeneratePipeline(keyword, constraints, taskId, openid) {
  var steps = [
    { key: 'search_papers', label: '重新搜索论文',          status: 'running', startedAt: Date.now() },
    { key: 'trend_analysis',label: 'AI 趋势分析（聚类方向）', status: 'pending' },
    { key: 'parse_result',  label: '解析并保存结果',         status: 'pending' }
  ];

  await updateTaskProgress(taskId, 'regenerating');

  // ===== Step 1: 重新搜索论文 =====
  var recentYear = new Date().getFullYear() - 2;
  var selectFields = 'id,display_name,authorships,cited_by_count,publication_year,doi,primary_location,primary_topic,keywords,fwci,citation_normalized_percentile,counts_by_year,type';
  var worksRes = await callOpenAlex('searchWorks', { query: keyword, fromYear: recentYear, perPage: 50, sort: 'relevance_score:desc', select: selectFields });

  if (!worksRes.success) {
    steps = markRunningStepFailed(steps);
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: '重新搜索论文失败', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  var rawPapers = (worksRes.data && worksRes.data.results) || [];
  var sourcePapers = simplifyWorks(rawPapers);
  var totalPapers = (worksRes.data && worksRes.data.meta && worksRes.data.meta.count) || rawPapers.length;
  await updateStepStatus(taskId, steps, 'search_papers', 'completed');

  // ===== Step 2: AI 趋势分析 =====
  await updateStepStatus(taskId, steps, 'trend_analysis', 'running');
  var userMsg = buildPhase1UserMessage(keyword, sourcePapers, totalPapers, constraints);

  var llm;
  try {
    llm = await callLLM([
      { role: 'system', content: PHASE1_SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ], { timeout: 600000, maxTokens: 4096 });
  } catch (e) {
    steps = markRunningStepFailed(steps);
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: 'AI 重新分析失败: ' + (e.message || '未知错误'), steps: steps, updatedAt: Date.now() }
    });
    return;
  }
  await updateStepStatus(taskId, steps, 'trend_analysis', 'completed');

  await updateStepStatus(taskId, steps, 'parse_result', 'running');
  var json = extractJSON(llm.content);
  if (!json) {
    await db.collection(TASK_COLLECTION).doc(taskId).update({
      data: { status: 'failed', error: 'AI 返回数据解析失败', steps: steps, updatedAt: Date.now() }
    });
    return;
  }

  validateSourceRefs(json, sourcePapers, []);
  await updateStepStatus(taskId, steps, 'parse_result', 'completed');

  var completedAt = Date.now();
  var deductResult = await deductCredits(taskId, 30, openid);
  var resultData = json.plans ? { plans: json.plans } : json;

  // ===== 代码层计算统计量 =====
  var paperMap = {};
  for (var i = 0; i < sourcePapers.length; i++) {
    paperMap[sourcePapers[i].id] = sourcePapers[i];
  }
  var plans = resultData.plans || [];
  var allReferencedIds = {};
  for (var p = 0; p < plans.length; p++) {
    var plan = plans[p];
    var ids = plan.sourceArticleIds || [];
    var matched = [], citations = [], fwcis = [], hots = [], topCount = 0;
    for (var j = 0; j < ids.length; j++) {
      allReferencedIds[ids[j]] = true;
      var pap = paperMap[ids[j]];
      if (!pap) continue;
      matched.push(pap);
      citations.push(pap.cc || 0);
      fwcis.push(pap.fwci || 0);
      hots.push(pap.hotRecent || 0);
      if (pap.citationPercentile && pap.citationPercentile.isTop10) topCount++;
    }
    var n = matched.length || 1;
    plan.avgCitations = Math.round(citations.reduce(function(a,b){return a+b;},0) / n);
    plan.avgFWCI = Math.round((fwcis.reduce(function(a,b){return a+b;},0) / n) * 100) / 100;
    plan.hotRecentAvg = Math.round(hots.reduce(function(a,b){return a+b;},0) / n);
    plan.topJournalRatio = Math.round((topCount / n) * 100) / 100;
    plan.paperCount = matched.length;
  }

  var referencedPapers = sourcePapers.filter(function(p) { return allReferencedIds[p.id]; });

  // ===== 写入 task（只存状态，不存 result/sourcePapers） =====
  var currentDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();
  var updateData = {
    status: 'awaiting_selection',
    usage: llm.usage,
    progress: 'awaiting_selection',
    steps: steps,
    creditsDeducted: deductResult.success,
    completedAt: completedAt,
    updatedAt: completedAt,
    // 清除旧残留字段
    result: db.command.remove(),
    sourcePapers: db.command.remove(),
    totalPapers: db.command.remove()
  };

  // 存档旧方向数据（从 direction 集合迁移到 history）
  try {
    var oldDirs = await db.collection(DIRECTION_COLLECTION).where({ taskId: taskId }).get();
    if (oldDirs.data && oldDirs.data.length > 0) {
      var history = currentDoc.data ? (currentDoc.data.regenerateHistory || []) : [];
      history.push({
        directions: oldDirs.data,
        usage: currentDoc.data ? currentDoc.data.usage : null,
        completedAt: currentDoc.data ? currentDoc.data.completedAt : null,
        index: history.length + 1
      });
      updateData.regenerateCount = (currentDoc.data ? (currentDoc.data.regenerateCount || 0) : 0) + 1;
      updateData.regenerateHistory = history;
      // 删除旧方向文档
      for (var oi = 0; oi < oldDirs.data.length; oi++) {
        try { await db.collection(DIRECTION_COLLECTION).doc(oldDirs.data[oi]._id).remove(); } catch (e) {}
      }
    }
  } catch (e) { /* ignore */ }

  await db.collection(TASK_COLLECTION).doc(taskId).update({ data: updateData });

  // ===== 写入新的 directions =====
  // 先按热度降序排序，热度高的排在前面
  if (plans && plans.length > 0) {
    plans.sort(function(a, b) { return (b.topicHeat || 0) - (a.topicHeat || 0); });
  }
  for (var dp = 0; dp < plans.length; dp++) {
    var dPlan = plans[dp];
    var dirArticleIds = dPlan.sourceArticleIds || [];
    var idSet = {};
    for (var ai = 0; ai < dirArticleIds.length; ai++) { idSet[dirArticleIds[ai]] = true; }
    var dirPapers = referencedPapers.filter(function(p) { return idSet[p.id]; });
    try {
      var dirId = taskId + '_' + dPlan.key;
      await db.collection(DIRECTION_COLLECTION).doc(dirId).set({
        data: {
          taskId: taskId,
          _openid: openid,
          key: dPlan.key,
          zh: dPlan.zh || {},
          en: dPlan.en || {},
          searchKeywords: dPlan.searchKeywords || [],
          topicHeat: dPlan.topicHeat || 0,
          avgCitations: dPlan.avgCitations || 0,
          avgFWCI: dPlan.avgFWCI || 0,
          topJournalRatio: dPlan.topJournalRatio || 0,
          hotRecentAvg: dPlan.hotRecentAvg || 0,
          paperCount: dPlan.paperCount || 0,
          sourceArticleIds: dirArticleIds,
          sourcePapers: dirPapers,
          createdAt: completedAt
        }
      });
    } catch (e) {
      console.error('[Regen] 写入方向失败, key:', dPlan.key, e.message);
    }
  }
}

// ==================== runPhase2Pipeline（后台直接调用入口，替代 self-call） ====================

async function runPhase2Pipeline(taskId, dirKey, schemeId, taskOpenid, isRegeneration) {
  if (!taskId || !dirKey || !schemeId) {
    console.error('[runPhase2Pipeline] 缺少必要参数:', JSON.stringify({ taskId, dirKey, schemeId }));
    return;
  }

  try {
    // 获取任务数据
    var phase2Doc = await db.collection(TASK_COLLECTION).doc(taskId).get();
    if (!phase2Doc.data) {
      console.error('[runPhase2Pipeline] 任务不存在:', taskId);
      return;
    }

    // 获取方向数据
    var dirDoc = await db.collection(DIRECTION_COLLECTION).doc(taskId + '_' + dirKey).get();
    if (!dirDoc.data) {
      console.error('[runPhase2Pipeline] 方向不存在:', dirKey);
      return;
    }

    var phase2Keyword = phase2Doc.data.keyword || '';
    var phase2Constraints = phase2Doc.data.constraints || '';

    await doPhase2Pipeline(taskId, schemeId, phase2Keyword, phase2Constraints, dirDoc.data, taskOpenid, isRegeneration);
  } catch (err) {
    console.error('[runPhase2Pipeline] 异常:', err.message || err);
    try {
      await db.collection(SCHEME_COLLECTION).doc(schemeId).update({
        data: { status: 'failed', error: '执行失败，请稍后重试', updatedAt: Date.now() }
      });
    } catch (e) { /* ignore */ }
  }
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
      if (doc.data._openid !== openid) return { success: false, error: '无权访问' };
      var d = await markStaleProcessingTask(Object.assign({ _id: taskId }, doc.data));
      return {
        success: true,
        data: {
          status: d.status,
          progress: d.progress,
          error: d.error,
          steps: d.steps,
          creditsDeducted: d.creditsDeducted,
          regenerateCount: d.regenerateCount || 0,
          regenerateHistory: d.regenerateHistory || [],
          activeSchemeId: d.activeSchemeId || '',
          completedAt: d.completedAt,
          createdAt: d.createdAt,
          constraints: d.constraints
        }
      };
    } catch (e) {
      return { success: false, error: '查询失败' };
    }
  }

  // ========== action: count（查询当前用户任务数量） ==========
  if (event.action === 'count') {
    try {
      // 用 .get() 代替 .count()，后者在某些情况下可能返回0
      var allTasks = await db.collection(TASK_COLLECTION)
        .where({ _openid: openid })
        .limit(1000)
        .get();
      var taskCount = (allTasks.data || []).length;
      console.log('[count] openid:', openid, 'taskCount:', taskCount);
      return { success: true, count: taskCount };
    } catch (e) {
      console.error('[count] error:', e.message);
      return { success: false, count: 0, error: e.message };
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

      var normalizedDocs = [];
      for (var di = 0; di < docs.data.length; di++) {
        normalizedDocs.push(await markStaleProcessingTask(docs.data[di]));
      }

      var list = [];
      for (var di = 0; di < normalizedDocs.length; di++) {
        var item = normalizedDocs[di];
        var firstTitle = '';
        // 从 direction 集合取第一个方向的标题
        try {
          var dirsRes = await db.collection(DIRECTION_COLLECTION)
            .where({ taskId: item._id })
            .orderBy('topicHeat', 'desc')
            .limit(1)
            .get();
          if (dirsRes.data && dirsRes.data[0]) {
            var d = dirsRes.data[0];
            firstTitle = (d.zh && d.zh.title) ? d.zh.title : ((d.en && d.en.title) ? d.en.title : '');
          }
        } catch (e) { /* ignore */ }
        list.push({
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
          activeSchemeId: item.activeSchemeId || '',
          firstTitle: firstTitle,
          error: item.error || ''
        });
      }

      return { success: true, list: list, page: page, pageSize: pageSize };
    } catch (e) {
      console.error('[list] 查询异常:', e.message);
      return { success: false, error: '查询列表失败' };
    }
  }

  // ========== action: delete（删除任务 + 级联删除方向和方案） ==========
  if (event.action === 'delete') {
    if (!taskId) return { success: false, error: '缺少 taskId' };
    try {
      // 0. 先校验任务归属
      var delTaskDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();
      if (!delTaskDoc.data) return { success: false, error: '任务不存在' };
      if (delTaskDoc.data._openid !== openid) return { success: false, error: '无权操作' };

      // 1. 删除该任务下所有方案（已校验 task 归属，仅用 taskId 即可兼容旧数据）
      var schemesRes = await db.collection(SCHEME_COLLECTION).where({ taskId: taskId }).get();
      for (var si = 0; si < (schemesRes.data || []).length; si++) {
        await db.collection(SCHEME_COLLECTION).doc(schemesRes.data[si]._id).remove();
      }
      // 2. 删除该任务下所有方向（已校验 task 归属，仅用 taskId 即可兼容旧数据）
      var dirsRes = await db.collection(DIRECTION_COLLECTION).where({ taskId: taskId }).get();
      for (var di = 0; di < (dirsRes.data || []).length; di++) {
        await db.collection(DIRECTION_COLLECTION).doc(dirsRes.data[di]._id).remove();
      }
      // 3. 删除任务本身
      await db.collection(TASK_COLLECTION).doc(taskId).remove();
      return { success: true };
    } catch (e) {
      console.error('[delete] 删除失败:', e.message);
      return { success: false, error: '删除失败' };
    }
  }

  // ========== action: retry（重新执行失败任务） ==========
  if (event.action === 'retry') {
    if (!taskId) return { success: false, error: '缺少 taskId' };
    try {
      var retryDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();
      if (!retryDoc.data) return { success: false, error: '任务不存在' };
      if (retryDoc.data._openid !== openid) return { success: false, error: '无权操作' };
      if (retryDoc.data.status !== 'failed') return { success: false, error: '当前状态不允许重新执行' };

      var retryData = retryDoc.data;
      var retryPhase = getRetryPhase(retryData);
      if (retryPhase === 'phase2') {
        // 从 scheme 集合或 event 获取方向 key
        var retrySelectedKey = event.directionKey || '';
        if (!retrySelectedKey && retryData.activeSchemeId) {
          try {
            var failedScheme = await db.collection(SCHEME_COLLECTION).doc(retryData.activeSchemeId).get();
            retrySelectedKey = (failedScheme.data && failedScheme.data.directionKey) || '';
          } catch (e) { /* ignore */ }
        }
        if (!retrySelectedKey) {
          return { success: false, error: '缺少已选择方向，无法从第二阶段重试' };
        }
        await db.collection(TASK_COLLECTION).doc(taskId).update({
          data: {
            status: 'processing',
            progress: 'phase2_searching',
            steps: initPhase2Steps(),
            error: '',
            updatedAt: Date.now()
          }
        });

        context.callbackWaitsForEmptyEventLoop = false;
        var retrySchemeId = retryData.activeSchemeId || (taskId + '_s_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
        runPhase2Pipeline(taskId, retrySelectedKey, retrySchemeId, openid, false)
          .catch(function(err) { console.error('[retryPhase2] runPhase2Pipeline 异常:', err.message || err); });

        return { success: true, taskId: taskId, phase: 'phase2', message: '已从第二阶段重新开始执行' };
      }

      // 重置为 processing 并重新初始化 steps
      await db.collection(TASK_COLLECTION).doc(taskId).update({
        data: {
          status: 'processing',
          progress: 'searching',
          steps: initSteps(),
          error: '',
          updatedAt: Date.now()
        }
      });

      // 异步执行（重试不扣积分）
      context.callbackWaitsForEmptyEventLoop = false;
      doFullPipeline(retryData.keyword, retryData.constraints, taskId, openid, true)
        .catch(function(err) { console.error('[retry] doFullPipeline 异常:', err.message || err); });

      return { success: true, taskId: taskId, phase: 'phase1', message: '已从第一阶段重新开始执行' };
    } catch (e) {
      return { success: false, error: '重新执行失败' };
    }
  }

  // ========== action: regenerate（重新生成趋势分析触发） ==========
  if (event.action === 'regenerate') {
    try {
      // 1. 查询当前任务
      var taskDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();
      if (!taskDoc.data) return { success: false, error: '任务不存在' };
      if (taskDoc.data._openid !== openid) return { success: false, error: '无权操作' };
      if (taskDoc.data.status === 'processing') return { success: false, error: '任务正在执行中' };

      // 2. 检查积分
      var taskOwnerOpenid = taskDoc.data._openid || openid;
      var creditsRes = await cloud.callFunction({ name: 'creditsAPI', data: { action: 'getCreditsInfo', _openid: taskOwnerOpenid } });
      console.log('[regenerate] creditsAPI 原始返回:', JSON.stringify(creditsRes));
      console.log('[regenerate] creditsRes.result:', JSON.stringify(creditsRes.result));
      var userBalance = creditsRes.result.credits || creditsRes.result.balance || 0;
      console.log('[regenerate] 解析后 userBalance:', userBalance, '阈值 30, 是否通过:', userBalance >= 30);
      if (userBalance < 30) {
        console.log('[regenerate] 积分不足，返回 balance:', userBalance);
        return { success: false, error: '积分不足', balance: userBalance };
      }
      console.log('[regenerate] 积分检查通过，继续执行');

      // 2.5 删除该任务下所有旧方案（已校验 task 归属，仅用 taskId 即可兼容旧数据）
      var oldSchemesForRegen = await db.collection(SCHEME_COLLECTION).where({ taskId: taskId }).get();
      var deletedSchemeCount = 0;
      for (var osi = 0; osi < (oldSchemesForRegen.data || []).length; osi++) {
        try { await db.collection(SCHEME_COLLECTION).doc(oldSchemesForRegen.data[osi]._id).remove(); deletedSchemeCount++; } catch (e) {}
      }
      console.log('[regenerate] 已删除旧方案 ' + deletedSchemeCount + '/' + (oldSchemesForRegen.data || []).length + ' 个');

      // 2.6 存档并删除所有旧方向（已校验 task 归属，仅用 taskId 即可兼容旧数据）
      var taskForArchive = await db.collection(TASK_COLLECTION).doc(taskId).get();
      var oldDirs = await db.collection(DIRECTION_COLLECTION).where({ taskId: taskId }).get();
      if (oldDirs.data && oldDirs.data.length > 0) {
        var regenHistory = (taskForArchive.data && taskForArchive.data.regenerateHistory) || [];
        regenHistory.push({
          directions: oldDirs.data,
          usage: taskForArchive.data ? taskForArchive.data.usage : null,
          completedAt: taskForArchive.data ? taskForArchive.data.completedAt : null,
          index: regenHistory.length + 1
        });
        var deletedDirCount = 0;
        for (var odi = 0; odi < oldDirs.data.length; odi++) {
          try { await db.collection(DIRECTION_COLLECTION).doc(oldDirs.data[odi]._id).remove(); deletedDirCount++; } catch (e) {}
        }
        await db.collection(TASK_COLLECTION).doc(taskId).update({
          data: {
            regenerateHistory: regenHistory,
            regenerateCount: (taskForArchive.data && (taskForArchive.data.regenerateCount || 0)) + 1,
            updatedAt: Date.now()
          }
        });
        console.log('[regenerate] 已存档并删除旧方向 ' + deletedDirCount + '/' + oldDirs.data.length + ' 个');
      }

      // 3. 标记任务为重新生成中，同时清除旧的趋势分析结果字段
      await db.collection(TASK_COLLECTION).doc(taskId).update({
        data: {
          status: 'processing',
          progress: 'generating',
          _regenerating: true,
          steps: [
            { key: 'search_papers',  label: '重新搜索论文',           status: 'pending' },
            { key: 'trend_analysis', label: 'AI 趋势分析（聚类方向）', status: 'pending' },
            { key: 'parse_result',   label: '解析并保存结果',         status: 'pending' }
          ],
          creditsDeducted: false,
          updatedAt: Date.now(),
          // 清除旧趋势分析数据
          phase1Usage: db.command.remove(),
          usage: db.command.remove(),
          result: db.command.remove(),
          sourcePapers: db.command.remove(),
          totalPapers: db.command.remove(),
          searchUrl: db.command.remove(),
          completedAt: db.command.remove(),
          error: db.command.remove()
        }
      });

      // 4. 异步执行精简 pipeline（重新搜索 + LLM）
      context.callbackWaitsForEmptyEventLoop = false;
      doRegeneratePipeline(taskDoc.data.keyword, taskDoc.data.constraints, taskId, taskOwnerOpenid)
        .catch(function(err) { console.error('[regenerate] doRegeneratePipeline 异常:', err.message || err); });

      return { success: true, taskId: taskId };
    } catch (e) {
      return { success: false, error: e.message || '重新生成失败' };
    }
  }

  // ========== action: regenerateScheme（重新生成方案：删除旧方案 + 启动新 Phase 2） ==========
  if (event.action === 'regenerateScheme') {
    var oldSchemeId = event.schemeId;
    var regenDirKey = event.directionKey;
    if (!taskId) return { success: false, error: '缺少 taskId' };
    if (!oldSchemeId) return { success: false, error: '缺少 schemeId' };
    if (!regenDirKey) return { success: false, error: '缺少 directionKey' };

    try {
      var regenTaskDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();
      if (!regenTaskDoc.data) return { success: false, error: '任务不存在' };
      // 校验任务归属
      if (regenTaskDoc.data._openid !== openid) return { success: false, error: '无权操作' };

      // 1. 检查积分
      var regenOpenid = regenTaskDoc.data._openid || openid;
      var regenCreditsRes = await cloud.callFunction({ name: 'creditsAPI', data: { action: 'getCreditsInfo', _openid: regenOpenid } });
      var regenBalance = regenCreditsRes.result.credits || regenCreditsRes.result.balance || 0;
      if (regenBalance < 15) {
        return { success: false, error: '积分不足', balance: regenBalance };
      }

      // 2. 删除该方向下所有旧方案（按趋势ID过滤，已校验 task 归属，仅用 taskId+directionKey）
      var oldDirSchemes = await db.collection(SCHEME_COLLECTION)
        .where({ taskId: taskId, directionKey: regenDirKey })
        .get();
      for (var ods = 0; ods < (oldDirSchemes.data || []).length; ods++) {
        try { await db.collection(SCHEME_COLLECTION).doc(oldDirSchemes.data[ods]._id).remove(); } catch (e) {}
      }
      console.log('[regenerateScheme] 已删除该方向 ' + (oldDirSchemes.data || []).length + ' 个旧方案');

      // 3. 从 direction 集合读取方向数据
      var regenDirDoc = await db.collection(DIRECTION_COLLECTION).doc(taskId + '_' + regenDirKey).get();
      if (!regenDirDoc.data) return { success: false, error: '方向不存在: ' + regenDirKey };

      // 4. 创建新方案文档
      var newSchemeId = taskId + '_s_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      var regenSchemeSteps = initPhase2Steps();
      var regenDirectionId = taskId + '_' + regenDirKey;
      await db.collection(SCHEME_COLLECTION).add({
        data: {
          _id: newSchemeId,
          taskId: taskId,
          directionId: regenDirectionId,
          directionKey: regenDirKey,
          _openid: regenOpenid,
          keyword: regenTaskDoc.data.keyword || '',
          constraints: regenTaskDoc.data.constraints || '',
          status: 'generating',
          progress: 'phase2_searching',
          steps: regenSchemeSteps,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      });

      // 5. 更新 task 的活跃 scheme
      await db.collection(TASK_COLLECTION).doc(taskId).update({
        data: { activeSchemeId: newSchemeId, updatedAt: Date.now() }
      });

      // 6. 异步执行 Phase 2（标记为重新生成，完成后扣积分）
      context.callbackWaitsForEmptyEventLoop = false;
      runPhase2Pipeline(taskId, regenDirKey, newSchemeId, regenOpenid, true)
        .catch(function(err) { console.error('[regenerateScheme] runPhase2Pipeline 异常:', err.message || err); });

      return { success: true, taskId: taskId, schemeId: newSchemeId, message: '方案重新生成已启动' };
    } catch (e) {
      console.error('[regenerateScheme] 异常:', e.message);
      return { success: false, error: '重新生成方案失败: ' + (e.message || '') };
    }
  }

  // ========== action: startScheme（用户选择方向 → 创建方案文档并异步执行） ==========
  if (event.action === 'startScheme') {
    var selectedKey = event.directionKey;
    if (!taskId) return { success: false, error: '缺少 taskId' };
    if (!selectedKey) return { success: false, error: '缺少 directionKey' };

    try {
      var doc = await db.collection(TASK_COLLECTION).doc(taskId).get();
      if (!doc.data) return { success: false, error: '任务不存在' };
      if (doc.data._openid !== openid) return { success: false, error: '无权操作' };

      // 从 direction 集合读取方向数据
      var dirDoc = await db.collection(DIRECTION_COLLECTION).doc(taskId + '_' + selectedKey).get();
      if (!dirDoc.data) return { success: false, error: '方向不存在: ' + selectedKey };

      // 检查是否已有 generating 状态的 scheme（已校验 task 归属，仅用 taskId+directionKey）
      var existingSchemes = await db.collection(SCHEME_COLLECTION)
        .where({ taskId: taskId, directionKey: selectedKey, status: 'generating' })
        .get();
      if (existingSchemes.data && existingSchemes.data.length > 0) {
        return { success: true, schemeId: existingSchemes.data[0]._id, message: '已有进行中的方案' };
      }

      // 创建 scheme 文档
      var schemeId = taskId + '_s_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      var schemeSteps = initPhase2Steps();
      var directionId = taskId + '_' + selectedKey;
      await db.collection(SCHEME_COLLECTION).add({
        data: {
          _id: schemeId,
          taskId: taskId,
          directionId: directionId,
          directionKey: selectedKey,
          _openid: openid,
          keyword: doc.data.keyword || '',
          constraints: doc.data.constraints || '',
          status: 'generating',
          progress: 'phase2_searching',
          steps: schemeSteps,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      });

      // 更新 task 记录活跃 scheme（不再需要 selectedPlanKey）
      await db.collection(TASK_COLLECTION).doc(taskId).update({
        data: {
          activeSchemeId: schemeId,
          updatedAt: Date.now()
        }
      });

      // 异步执行 Phase 2
      context.callbackWaitsForEmptyEventLoop = false;
      runPhase2Pipeline(taskId, selectedKey, schemeId, doc.data._openid || openid, false)
        .catch(function(err) { console.error('[startScheme] runPhase2Pipeline 异常:', err.message || err); });

      return { success: true, taskId: taskId, schemeId: schemeId, message: '方案生成已启动' };
    } catch (e) {
      console.error('[startScheme] 异常:', e.message);
      return { success: false, error: '启动方案生成失败' };
    }
  }

  // 保留旧 action 兼容（selectDirection → 走 startScheme 逻辑）
  if (event.action === 'selectDirection') {
    event.action = 'startScheme';
    return exports.main(event, context);
  }

  // ========== action: getTrendDetail（查询趋势分析详情） ==========
  if (event.action === 'getTrendDetail') {
    if (!taskId) return { success: false, error: '缺少 taskId' };
    try {
      var trendDoc = await db.collection(TASK_COLLECTION).doc(taskId).get();
      if (!trendDoc.data) return { success: false, error: '任务不存在' };

      var td = trendDoc.data;
      // 校验任务归属
      if (td._openid !== openid) return { success: false, error: '无权访问' };

      // 从 directions 集合读取（按热度降序，已校验 task 归属，仅用 taskId）
      var dirsRes = await db.collection(DIRECTION_COLLECTION)
        .where({ taskId: taskId })
        .orderBy('topicHeat', 'desc')
        .get();
      var directions = dirsRes.data || [];

      // 查询方案数量（已校验 task 归属，仅用 taskId）
      var schemeCountRes = await db.collection(SCHEME_COLLECTION)
        .where({ taskId: taskId, status: 'completed' }).count();
      var generatingRes = await db.collection(SCHEME_COLLECTION)
        .where({ taskId: taskId, status: 'generating' }).get();

      // 为每个方向查询其下的方案（用 directionId 关联，已校验 task 归属，仅用 taskId）
      var schemesByDir = {};
      var allSchemes = await db.collection(SCHEME_COLLECTION)
        .where({ taskId: taskId })
        .get();
      for (var si = 0; si < (allSchemes.data || []).length; si++) {
        var s = allSchemes.data[si];
        var dk = s.directionKey || s.directionId;
        if (!schemesByDir[dk]) schemesByDir[dk] = [];
        schemesByDir[dk].push({
          schemeId: s._id,
          directionId: s.directionId || '',
          status: s.status,
          title: (s.plan && s.plan.zh && s.plan.zh.title) || '',
          completedAt: s.completedAt,
          error: s.error || ''
        });
      }

      return {
        success: true,
        data: {
          taskId: taskId,
          keyword: td.keyword,
          constraints: td.constraints || '',
          status: td.status,
          directions: directions,
          schemesByDir: schemesByDir,
          schemeCount: schemeCountRes.total || 0,
          generatingSchemeId: (generatingRes.data && generatingRes.data[0] && generatingRes.data[0]._id) || ''
        }
      };
    } catch (e) {
      return { success: false, error: '查询失败' };
    }
  }

  // ========== action: listSchemes（查询某任务所有方案） ==========
  if (event.action === 'listSchemes') {
    if (!taskId) return { success: false, error: '缺少 taskId' };
    try {
      var schemesRes = await db.collection(SCHEME_COLLECTION)
        .where({ taskId: taskId })
        .orderBy('createdAt', 'desc')
        .get();
      var schemeList = (schemesRes.data || []).map(function(s) {
        return {
          schemeId: s._id,
          directionId: s.directionId || '',
          directionKey: s.directionKey,
          status: s.status,
          progress: s.progress,
          steps: s.steps,
          title: (s.plan && s.plan.zh && s.plan.zh.title) || '',
          topicHeat: (s.plan && s.plan.topicHeat) || 0,
          completedAt: s.completedAt,
          createdAt: s.createdAt,
          error: s.error || ''
        };
      });
      return { success: true, schemes: schemeList };
    } catch (e) {
      return { success: false, error: '查询方案列表失败' };
    }
  }

  // ========== action: getSchemeStatus（轮询方案进度） ==========
  if (event.action === 'getSchemeStatus') {
    var schemeId = event.schemeId;
    if (!schemeId) return { success: false, error: '缺少 schemeId' };
    try {
      var sDoc = await db.collection(SCHEME_COLLECTION).doc(schemeId).get();
      if (!sDoc.data) return { success: false, error: '方案不存在' };
      return {
        success: true,
        data: {
          schemeId: schemeId,
          status: sDoc.data.status,
          progress: sDoc.data.progress,
          steps: sDoc.data.steps,
          error: sDoc.data.error || ''
        }
      };
    } catch (e) {
      return { success: false, error: '查询失败' };
    }
  }

  // ========== action: getSchemeDetail（查询方案完整详情） ==========
  if (event.action === 'getSchemeDetail') {
    var schemeId = event.schemeId;
    if (!schemeId) return { success: false, error: '缺少 schemeId' };
    try {
      var sDoc = await db.collection(SCHEME_COLLECTION).doc(schemeId).get();
      if (!sDoc.data) return { success: false, error: '方案不存在' };
      var sd = sDoc.data;

      // 截断大数组避免超过 1MB 云函数响应限制
      var allPapers = sd.sourcePapers || [];
      var articleIds = (sd.plan && sd.plan.sourceArticleIds) || [];
      var filteredPapers;
      if (articleIds.length > 0) {
        // 只返回方案引用的论文
        var idSet = {};
        for (var fi = 0; fi < articleIds.length; fi++) idSet[articleIds[fi]] = true;
        filteredPapers = allPapers.filter(function(p) { return idSet[p.id]; });
      } else {
        // 未标注引用时限制数量
        filteredPapers = allPapers.slice(0, 20);
      }
      // 精简论文字段（保留 citationsByYear 给前端点击"被引"柱状图用）
      var slimPapers = filteredPapers.map(function(p) {
        return {
          id: p.id, title: p.title, abstract: p.abstract,
          authors: p.authors, cc: p.cc, year: p.year,
          url: p.url, doi: p.doi,
          type: p.type, journal: p.journal,
          topics: p.topics, keywords: p.keywords,
          fwci: p.fwci, citationPercentile: p.citationPercentile,
          citationsByYear: p.citationsByYear
        };
      });
      // 作者列表截断
      var slimAuthors = (sd.sourceAuthors || []).slice(0, 15);

      return {
        success: true,
        data: {
          schemeId: sd._id,
          taskId: sd.taskId,
          directionId: sd.directionId || '',
          directionKey: sd.directionKey,
          status: sd.status,
          plan: sd.plan,
          sourcePapers: slimPapers,
          sourceAuthors: slimAuthors,
          steps: sd.steps,
          progress: sd.progress,
          usage: sd.usage,
          error: sd.error || '',
          completedAt: sd.completedAt,
          createdAt: sd.createdAt
        }
      };
    } catch (e) {
      return { success: false, error: '查询失败' };
    }
  }

  // ========== Trigger 模式（默认） ==========
  if (!keyword) return { success: false, error: '请输入研究关键词' };

  // 服务端检查积分（前端也检查但可能有竞态，双保险）
  var balanceRes = await cloud.callFunction({ name: 'creditsAPI', data: { action: 'getCreditsInfo', _openid: openid } });
  console.log('[trigger] creditsAPI 原始返回:', JSON.stringify(balanceRes));
  console.log('[trigger] balanceRes.result:', JSON.stringify(balanceRes.result));
  var balance = balanceRes.result.credits || balanceRes.result.balance || 0;
  console.log('[trigger] 解析后 balance:', balance, '阈值 30, 是否通过:', balance >= 30);
  if (balance < 30) {
    console.log('[trigger] 积分不足，返回 balance:', balance);
    return { success: false, error: '积分不足', balance: balance };
  }
  console.log('[trigger] 积分检查通过，继续执行');

  var newTaskId = genTaskId();

  try {
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
  } catch (addErr) {
    console.error('[Trigger] 数据库 add 失败:', addErr.message);
    return { success: false, error: '创建任务失败' };
  }

  // Fire-and-forget: 异步执行 pipeline
  context.callbackWaitsForEmptyEventLoop = false;
  doFullPipeline(keyword, constraints, newTaskId, openid, false)
    .catch(function(err) { console.error('[Trigger] doFullPipeline 异常:', err.message || err); });

  return { success: true, taskId: newTaskId };
};
