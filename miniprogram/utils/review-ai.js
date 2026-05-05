/**
 * AI 审稿工具模块
 * 提取自 reviews/form.js，供小程序端调用 AI 审稿使用
 * 默认使用混元（hunyuan-exp），无模型选择功能
 */

// 模型配置（分组名 → 实际模型名 / 参数）
var AI_MODELS = {
  'deepseek': {
    name: 'DeepSeek V3',
    model: 'deepseek-v3-0324',
    maxChars: 60000
  },
  'kimi-custom': {
    name: 'Kimi',
    model: 'moonshot-v1-128k',
    maxChars: 100000
  },
  'hunyuan-exp': {
    name: '混元 Turbo',
    model: 'hunyuan-turbos-latest',
    maxChars: 80000
  }
};

var DEFAULT_PROVIDER = 'deepseek';

// AI 请求超时时间（毫秒），审稿生成耗时长，设 120 秒
var AI_TIMEOUT = 120000;

/**
 * 构建审稿 Prompt
 * @param {string} paperText - 稿件文本
 * @param {number} maxChars  - 最大字符数
 * @returns {string}
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
 * 小程序端调用 AI 审稿
 * @param {string} paperText      - 稿件文本
 * @param {number} originalLength - 原文长度（用于标注）
 * @returns {Promise<{success: boolean, text: string, modelName: string}>}
 */
function callAIWithText(paperText, originalLength) {
  return new Promise(function(resolve, reject) {
    var providerId = DEFAULT_PROVIDER;
    var provider = AI_MODELS[providerId];
    var maxChars = provider.maxChars;
    var modelName = provider.name;
    var prompt = buildReviewPrompt(paperText, maxChars);

    var model = wx.cloud.extend.AI.createModel(providerId);

    // 带超时的 AI 请求
    var aiPromise = model.generateText({
      model: provider.model,
      messages: [
        { role: 'system', content: '你是一位经验丰富的学术审稿专家，擅长各个学科领域的论文审稿。你的审稿意见专业、客观、具有建设性。' },
        { role: 'user', content: prompt }
      ]
    });

    // 超时计时器
    var timeoutPromise = new Promise(function(_, timeoutReject) {
      setTimeout(function() {
        timeoutReject(new Error('AI 审稿超时（' + (AI_TIMEOUT / 1000) + '秒），请稍后重试'));
      }, AI_TIMEOUT);
    });

    // 竞速：AI 返回 vs 超时
    Promise.race([aiPromise, timeoutPromise]).then(function(res) {
      // 解析返回
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
      // 超时或其他错误统一处理
      reject(err);
    });
  });
}

module.exports = {
  buildReviewPrompt: buildReviewPrompt,
  callAIWithText: callAIWithText,
  DEFAULT_PROVIDER: DEFAULT_PROVIDER,
  AI_MODELS: AI_MODELS,
  AI_TIMEOUT: AI_TIMEOUT
};
