/**
 * aiChat 云函数调用封装
 * 配合 cloudfunctions/aiChat 云函数使用
 *
 * 使用方式：
 *   const aiChat = require('./ai-chat-util.js');
 *   // 同步调用（apiKey 由云函数环境变量读取，无需传入）
 *   const res = await aiChat.chat({ provider: 'deepseek', messages: [...] });
 *   // 流式调用
 *   const sse = await aiChat.chatStream({ provider: 'deepseek', messages: [...] });
 *
 * 统一调用格式：
 *   provider   - openai | deepseek | kimi | tencent | alibaba
 *   model      - 模型名（可选，默认用各 provider 默认模型）
 *   messages   - [{role: 'user'|'assistant'|'system', content: '...'}]
 *   baseURL    - 覆盖默认 BaseURL（可选）
 *   stream     - true=流式，false=同步（默认 false）
 *   temperature / maxTokens / topP / stop / timeout
 *
 * API Key：从云函数环境变量读取（不在小程序端传递）
 */

const CLOUD_FUNCTION_NAME = 'aiChat';

/**
 * 统一调用 aiChat 云函数
 * @param {Object} params - 调用参数（见上方）
 * @returns {Promise} 云函数返回
 */
function callAiChat(params) {
  return wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: params
  });
}

/**
 * 同步调用（推荐）
 * @param {Object} params - 调用参数
 * @returns {Promise<{success, content, model, usage}>}
 */
async function chat(params) {
  const res = await callAiChat({
    action: 'chat',
    stream: false,
    ...params
  });
  return res.data;
}

/**
 * 流式调用（云函数同步返回 SSE 原始流）
 * 由于 wx.cloud.callFunction 是请求-响应模式，流式返回本质上是
 * 云函数把第三方 AI 的 SSE 流直接透传给客户端（一次性返回所有 chunk）。
 *
 * 调用方需处理 SSE 数据块：
 *   wx.cloud.callFunction({ name: 'aiChat', data: { action: 'chat', stream: true, ... } })
 *     .then(res => {
 *       // res.data 是 SSE 字符串块（多个 data: 行），需自行按 '\n\n' 拆分解析
 *       // 每块格式：data: {"choices":[{"delta":{"content":"xxx"}}]}
 *       // 结束标记：data: [DONE]
 *       const sseText = res.data;
 *     });
 *
 * 若需真正实时流式体验，建议在**小程序端**直接用 wx.cloud.extend.AI.createModel().streamText()
 *
 * @param {Object} params - 调用参数
 * @returns {Promise<string>} SSE 原始文本
 */
async function chatStream(params) {
  const res = await callAiChat({
    action: 'chat',
    stream: true,
    ...params
  });
  // 返回 SSE 原始文本，由调用方按 '\n\n' 拆分解析
  return typeof res === 'string' ? res : JSON.stringify(res);
}

/**
 * 列出支持的 providers
 * @returns {Promise<{success, providers[]}>}
 */
async function listProviders() {
  const res = await callAiChat({ action: 'listProviders' });
  return res.data;
}

// 预设模板：学术审稿
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
 * 学术审稿快捷调用
 * @param {string} paperText - 稿件文本
 * @param {string} provider - AI provider（默认 deepseek）
 * @param {string} model - 模型名（可选）
 */
async function reviewPaper(paperText, provider, model) {
  const prompt = buildReviewPrompt(paperText, 60000);
  return await chat({
    provider: provider || 'deepseek',
    model: model,
    messages: [
      { role: 'system', content: '你是一位经验丰富的学术审稿专家，擅长各个学科领域的论文审稿。你的审稿意见专业、客观、具有建设性。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3
  });
}

module.exports = {
  chat,
  chatStream,
  listProviders,
  buildReviewPrompt,
  reviewPaper,
  callAiChat
};
