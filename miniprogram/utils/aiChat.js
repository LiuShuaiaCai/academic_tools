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

module.exports = {
  chat,
  chatStream,
  listProviders,
  callAiChat
};
