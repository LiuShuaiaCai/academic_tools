// miniprogram/utils/aiRecognizer.js
// AI 识别公共工具 - 统一使用 wx.cloud.extend.AI
// 所有 AI 调用从云函数迁移到小程序端，避免 cloud.AI 版本兼容问题

// 注意：wx.cloud.extend.AI.createModel 只接受 "cloudbase" 或 "hunyuan-v3" 等平台提供商
// 自定义模型通过 "cloudbase" 提供商路由，模型标识放在 generateText 的 data.model 中
// 支持的后备：aiChat 云函数（用于 deepseek / kimi-custom 等自定义模型）
var AI_REVIEW_PROVIDERS = {
  'deepseek': {
    name: 'DeepSeek V3',
    group: 'cloudbase',
    model: 'deepseek-v3-0324',
    maxChars: 60000
  },
  'kimi-custom': {
    name: 'Kimi',
    group: 'cloudbase',            // 自定义模型通过 cloudbase 提供商路由
    model: 'kimi-custom',          // 控制台自定义模型的标识名
    maxChars: 100000
  },
  'hunyuan-exp': {
    name: '混元 Turbo',
    group: 'hunyuan-exp',
    model: 'hunyuan-turbos-latest',
    maxChars: 80000
  }
};

var DEFAULT_REVIEW_PROVIDER = 'kimi-custom';
var AI_REVIEW_TIMEOUT = 120000;
var AI_TEMPERATURE = 0.1;
var AI_MAX_TOKENS = 1024;
var AI_MAX_RETRIES = 3;

/**
 * 带重试的 generateText 封装，自动处理 429 限流
 * @param {object} model - wx.cloud.extend.AI.createModel 返回的模型实例
 * @param {object} params - generateText 参数
 * @returns {Promise<object>} generateText 结果
 */
async function generateTextWithRetry(model, params) {
  var lastError;
  for (var attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      return await model.generateText(params);
    } catch (err) {
      lastError = err;
      var status = err.statusCode || err.status || 0;
      var isRateLimited = status === 429 ||
        (err.message && err.message.indexOf('Too Many') !== -1) ||
        (err.message && err.message.indexOf('rate limit') !== -1);

      if (isRateLimited && attempt < AI_MAX_RETRIES) {
        var delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn('[aiRecognizer] 429 限流, ' + delay + 'ms 后重试 (' + (attempt + 1) + '/' + AI_MAX_RETRIES + ')');
        await new Promise(function(resolve) { setTimeout(resolve, delay); });
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}


/**
 * 从 AI 返回结果中提取文本内容（兼容多种返回格式）
 */
function extractContent(result) {
  if (result && result.choices && result.choices[0] && result.choices[0].message) {
    return result.choices[0].message.content || result.choices[0].message || '';
  }
  if (result && result.content) {
    return result.content;
  }
  return '';
}

/**
 * 从文本中解析 JSON（容错）
 */
function parseJSONFromText(text) {
  // 先尝试直接 parse
  try {
    var parsed = JSON.parse(text.trim());
    if (typeof parsed === 'object') return parsed;
  } catch (e) {
    // not plain JSON
  }
  // 再尝试正则提取
  var jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e2) {
      console.error('[aiRecognizer] JSON解析失败:', e2.message);
    }
  }
  return null;
}

/**
 * 构建标准返回结构
 */
function buildResult(parsed, rawContent) {
  return {
    success: true,
    paperTitle: (parsed && parsed.paperTitle) || '',
    journal: (parsed && parsed.journal) || '',
    reviewId: (parsed && parsed.reviewId) || '',
    invitedDate: (parsed && parsed.invitedDate) || '',
    deadline: (parsed && parsed.deadline) || '',
    systemUrl: (parsed && parsed.systemUrl) || '',
    editorEmail: (parsed && parsed.editorEmail) || '',
    raw: rawContent
  };
}

/**
 * 统计有效字段数
 */
function countFilledFields(parsed) {
  var fields = ['paperTitle', 'journal', 'reviewId', 'invitedDate', 'deadline', 'systemUrl', 'editorEmail'];
  var count = 0;
  fields.forEach(function(f) {
    if (parsed && parsed[f] && parsed[f].trim()) count++;
  });
  return count;
}

// ==================== 公共 API ====================

/**
 * 识别邮件文本（用户粘贴的审稿邀请邮件）
 * @param {string} emailText - 邮件全文
 * @returns {Promise<object>} 结构化字段
 */
async function recognizeEmailText(emailText) {
  if (!emailText || emailText.trim().length < 20) {
    return { success: false, error: '邮件内容过短，请粘贴完整邮件' };
  }

  console.log('[aiRecognizer] recognizeEmailText 开始, 文本长度:', emailText.length);

  var provider = AI_REVIEW_PROVIDERS[DEFAULT_REVIEW_PROVIDER];
  var model = wx.cloud.extend.AI.createModel(provider.group || DEFAULT_REVIEW_PROVIDER);

  var result;
  try {
    result = await generateTextWithRetry(model, {
      model: provider.model,
      messages: [
        { role: 'system', content: '你是一个学术审稿邮件解析助手。从审稿邀请邮件中提取关键信息。只返回JSON，不要任何其他文字。' },
        {
          role: 'user',
          content: '请从以下审稿邀请邮件文本中提取信息，以严格的JSON格式返回：\n\n' +
            '{\n' +
            '  "paperTitle": "论文标题（完整标题，如果没有则空字符串）",\n' +
            '  "journal": "期刊名或会议名（如果没有则空字符串）",\n' +
            '  "reviewId": "审稿ID或稿件编号（如 MS-123、#2024-xxx 等，没有则空字符串）",\n' +
            '  "invitedDate": "邀请日期（YYYY-MM-DD 格式，如无法确定则空字符串）",\n' +
            '  "deadline": "截止日期/回复期限（YYYY-MM-DD 格式，如无法确定则空字符串）",\n' +
            '  "systemUrl": "审稿系统链接/提交网址（完整 URL，没有则空字符串）",\n' +
            '  "editorEmail": "编辑邮箱地址（没有则空字符串）"\n' +
            '}\n\n' +
            '注意：\n1. 只返回 JSON，不要其他文字\n2. 日期格式统一为 YYYY-MM-DD\n3. 无法确定的字段返回空字符串\n\n' +
            '=== 邮件内容 ===\n' + emailText
        }
      ],
      temperature: AI_TEMPERATURE,
      max_tokens: AI_MAX_TOKENS
    });
  } catch (err) {
    console.error('[aiRecognizer] recognizeEmailText 失败:', err.message || err);
    return { success: false, error: 'AI 识别失败：' + (err.message || err) };
  }

  var content = extractContent(result);
  console.log('[aiRecognizer] recognizeEmailText 返回长度:', content.length);
  var parsed = parseJSONFromText(content);
  console.log('[aiRecognizer] recognizeEmailText 有效字段:', countFilledFields(parsed));

  return buildResult(parsed, content);
}

/**
 * 识别稿件文本（从文件提取后）
 * @param {string} paperText - 稿件全文或截断后的文本
 * @param {number} maxInput - 最大送入字符数，默认 30000
 * @returns {Promise<object>} 结构化字段
 */
async function recognizeManuscript(paperText, maxInput) {
  if (!paperText || paperText.trim().length < 50) {
    return { success: false, error: '文件内容为空或过短' };
  }

  maxInput = maxInput || 3000;
  var truncated = paperText.length > maxInput
    ? paperText.substring(0, maxInput) + '\n\n[... 稿件内容过长，已截断 ...]'
    : paperText;

  console.log('[aiRecognizer] recognizeManuscript 开始, 送入长度:', truncated.length);

  var provider = AI_REVIEW_PROVIDERS[DEFAULT_REVIEW_PROVIDER];
  var model = wx.cloud.extend.AI.createModel(provider.group || DEFAULT_REVIEW_PROVIDER);

  var result;
  try {
    result = await generateTextWithRetry(model, {
      model: provider.model,
      messages: [
        { role: 'system', content: '你是一个学术论文解析助手。从论文稿件文本中提取元数据信息。只返回JSON，不要任何其他文字。' },
        {
          role: 'user',
          content: '请从以下学术论文稿件中提取元数据信息，以严格的JSON格式返回：\n\n' +
            '{\n' +
            '  "paperTitle": "论文标题（完整标题，尽量从正文第一页标题部分提取）",\n' +
            '  "journal": "如果稿件中有期刊/会议名称信息则提取，否则空字符串",\n' +
            '  "reviewId": "稿件中如有审稿编号/稿件ID则提取，否则空字符串",\n' +
            '  "invitedDate": "如有投稿日期则提取（YYYY-MM-DD 格式），否则空字符串",\n' +
            '  "deadline": "如有修改截止日期则提取（YYYY-MM-DD 格式），否则空字符串",\n' +
            '  "systemUrl": "稿件中通常没有，返回空字符串",\n' +
            '  "editorEmail": "稿件中通常没有，返回空字符串"\n' +
            '}\n\n' +
            '注意：\n1. 只返回 JSON，不要其他文字\n2. 日期格式统一为 YYYY-MM-DD\n3. 论文标题尽量从稿件第一页标题/页眉提取\n4. 稿件文本中不存在的信息字段返回空字符串\n\n' +
            '=== 稿件内容（前 ' + maxInput.toLocaleString() + ' 字）===\n' + truncated
        }
      ],
      temperature: AI_TEMPERATURE,
      max_tokens: AI_MAX_TOKENS
    });
  } catch (err) {
    console.error('[aiRecognizer] recognizeManuscript 失败:', err.message || err);
    return { success: false, error: 'AI 识别失败：' + (err.message || err) };
  }

  var content = extractContent(result);
  console.log('[aiRecognizer] recognizeManuscript 返回长度:', content.length);
  var parsed = parseJSONFromText(content);
  console.log('[aiRecognizer] recognizeManuscript 有效字段:', countFilledFields(parsed));

  var output = buildResult(parsed, content);
  output.originalLength = paperText.length;
  return output;
}

/**
 * 识别邮件截图（多模态）
 * @param {string} imageUrl - 图片临时链接（通过 wx.cloud.getTempFileURL 获取）
 * @returns {Promise<object>} 结构化字段
 */
async function recognizeEmailImage(imageUrl) {
  if (!imageUrl) {
    return { success: false, error: '缺少图片链接' };
  }

  console.log('[aiRecognizer] recognizeEmailImage 开始');

  var provider = AI_REVIEW_PROVIDERS[DEFAULT_REVIEW_PROVIDER];
  var model = wx.cloud.extend.AI.createModel(provider.group || DEFAULT_REVIEW_PROVIDER);

  var result;
  try {
    result = await generateTextWithRetry(model, {
      model: 'hunyuan-vision',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '这是一张学术审稿邀请邮件的截图。请仔细识别并提取以下信息，以JSON格式返回：\n\n' +
                '{\n' +
                '  "paperTitle": "论文标题（完整标题）",\n' +
                '  "journal": "期刊名或会议名",\n' +
                '  "reviewId": "审稿ID或稿件编号",\n' +
                '  "invitedDate": "邀请日期（YYYY-MM-DD格式）",\n' +
                '  "deadline": "截止日期（YYYY-MM-DD格式）",\n' +
                '  "systemUrl": "审稿系统链接/提交网址",\n' +
                '  "editorEmail": "编辑邮箱地址"\n' +
                '}\n\n' +
                '注意：只返回JSON，日期格式统一为YYYY-MM-DD，找不到的字段返回空字符串。'
            },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      temperature: AI_TEMPERATURE,
      max_tokens: AI_MAX_TOKENS
    });
  } catch (err) {
    console.error('[aiRecognizer] recognizeEmailImage 失败:', err.message || err);
    return { success: false, error: 'AI 识别失败：' + (err.message || err) };
  }

  var content = extractContent(result);
  console.log('[aiRecognizer] recognizeEmailImage 返回长度:', content.length);
  var parsed = parseJSONFromText(content);
  console.log('[aiRecognizer] recognizeEmailImage 有效字段:', countFilledFields(parsed));

  return buildResult(parsed, content);
}

/**
 * OCR 图片识别 DOI 和标题
 * @param {string} imageUrl - 图片临时链接
 * @returns {Promise<object>} { success, doi, title, raw }
 */
async function ocrImage(imageUrl) {
  if (!imageUrl) {
    return { success: false, error: '缺少图片链接' };
  }

  console.log('[aiRecognizer] ocrImage 开始');

  var provider = AI_REVIEW_PROVIDERS[DEFAULT_REVIEW_PROVIDER];
  var model = wx.cloud.extend.AI.createModel(provider.group || DEFAULT_REVIEW_PROVIDER);

  var result;
  try {
    result = await generateTextWithRetry(model, {
      model: 'hunyuan-vision',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '这是一张学术论文的图片。请识别其中的 DOI 和论文标题。以JSON格式返回：{"doi":"识别到的DOI或空字符串","title":"识别到的标题或空字符串"}。如果都没有识别到，两个都返回空字符串。'
            },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      temperature: AI_TEMPERATURE,
      max_tokens: 512
    });
  } catch (err) {
    console.error('[aiRecognizer] ocrImage 失败:', err.message || err);
    return { success: false, error: 'AI 识别失败：' + (err.message || err) };
  }

  var content = extractContent(result);
  console.log('[aiRecognizer] ocrImage 返回长度:', content.length);

  var jsonMatch = content.match(/\{[\s\S]*?\}/);
  var parsed = { doi: '', title: '' };
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[aiRecognizer] ocrImage JSON解析失败:', e.message);
    }
  }

  return {
    success: true,
    doi: parsed.doi || '',
    title: parsed.title || '',
    raw: content
  };
}

// ==================== AI 审稿 ====================

/**
 * 构建审稿 Prompt
 */
function buildReviewPrompt(paperText, maxChars) {
  var truncated = paperText;
  if (truncated.length > maxChars) {
    truncated = truncated.substring(0, maxChars) + '\n\n[... 稿件内容过长，已截断 ...]';
  }
  return '请对以下学术论文进行专业审稿，从以下几个方面给出详细意见：\n\n' +
    '1. **创新性**：研究的创新点和贡献\n' +
    '2. **方法论**：实验设计、方法合理性\n' +
    '3. **结果与分析**：结果的可信度和解释\n' +
    '4. **写作质量**：结构、语言、参考文献\n' +
    '5. **改进建议**：具体的修改意见\n' +
    '6. **总体评价**：推荐接收 / 修改后接收 / 修改后重投 / 拒稿\n\n' +
    '请用条理清晰的中文输出，每个部分用标题标注。\n\n' +
    '=== 稿件内容 ===\n' + truncated;
}

/**
 * AI 审稿
 * @param {string} paperText - 稿件文本
 * @param {number} originalLength - 原文长度
 * @returns {Promise<{success, text, modelName, originalLength, truncatedLength}>}
 */
function startAiReview(paperText, originalLength) {
  return new Promise(function(resolve, reject) {
    var providerId = DEFAULT_REVIEW_PROVIDER;
    var provider = AI_REVIEW_PROVIDERS[providerId];
    var maxChars = provider.maxChars;
    var modelName = provider.name;
    var prompt = buildReviewPrompt(paperText, maxChars);

    console.log('[aiRecognizer] startAiReview 开始, 送入长度:', prompt.length);

    var group = (AI_REVIEW_PROVIDERS[providerId] || {}).group || providerId;
    var model = wx.cloud.extend.AI.createModel(group);

    var aiPromise = generateTextWithRetry(model, {
      model: provider.model,
      messages: [
        { role: 'system', content: '你是一位经验丰富的学术审稿专家，擅长各个学科领域的论文审稿。你的审稿意见专业、客观、具有建设性。' },
        { role: 'user', content: prompt }
      ]
    });

    var timeoutPromise = new Promise(function(_, timeoutReject) {
      setTimeout(function() {
        timeoutReject(new Error('AI 审稿超时（' + (AI_REVIEW_TIMEOUT / 1000) + '秒），请稍后重试'));
      }, AI_REVIEW_TIMEOUT);
    });

    Promise.race([aiPromise, timeoutPromise]).then(function(res) {
      var reviewText = '';
      if (res && res.choices && res.choices[0] && res.choices[0].message) {
        reviewText = res.choices[0].message.content || res.choices[0].message;
      } else if (res && res.content) {
        reviewText = res.content;
      } else if (typeof res === 'string') {
        reviewText = res;
      }

      if (reviewText) {
        resolve({
          success: true,
          text: reviewText,
          modelName: modelName,
          originalLength: originalLength,
          truncatedLength: paperText.length
        });
      } else {
        reject(new Error('AI 返回格式异常'));
      }
    }).catch(function(err) {
      reject(err);
    });
  });
}

module.exports = {
  recognizeEmailText: recognizeEmailText,
  recognizeManuscript: recognizeManuscript,
  recognizeEmailImage: recognizeEmailImage,
  ocrImage: ocrImage,
  startAiReview: startAiReview,
  DEFAULT_REVIEW_PROVIDER: DEFAULT_REVIEW_PROVIDER,
  AI_REVIEW_PROVIDERS: AI_REVIEW_PROVIDERS
};
