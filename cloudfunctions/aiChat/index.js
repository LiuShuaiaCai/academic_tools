/**
 * aiChat 云函数
 * 职责：封装第三方 AI API，支持流式和同步调用
 *
 * 设计：策略模式 + 工厂模式
 * - 每个 Provider 是独立策略类，实现统一接口
 * - 添加新 Provider：只需新增一个类 + 在工厂注册一行
 * - 核心调用逻辑（chatSync / chatStream）保持不变
 *
 * API Key 管理：
 * - API Key 存储在云函数「环境变量」中，通过 process.env 读取
 * - 每个 Provider 对应一个环境变量（见各 Provider 类）
 * - event.apiKey 可兜底传入（优先级高于环境变量，仅临时测试用）
 *
 * 统一调用格式：
 *   provider   - openai | deepseek | kimi | tencent | alibaba
 *   model      - 模型名（可选，默认用各 provider 默认模型）
 *   messages   - [{role: 'user'|'assistant'|'system', content: '...'}]
 *   baseURL    - 覆盖默认 BaseURL（可选）
 *   stream     - true=流式，false=同步（默认 false）
 *   temperature / maxTokens / topP / stop / timeout
 */

const axios = require('axios');

// ==================== 策略基类 ====================

class BaseProvider {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.defaultModel = config.defaultModel;
    this.baseURL = config.baseURL;
    this.authType = config.authType || 'Bearer';
    this.authPrefix = config.authPrefix || '';
    this.supportsStream = config.supportsStream !== false;
    this.extra = config.extra || {};
    // 环境变量名（子类覆盖）
    this.envKey = config.envKey || `${this.id.toUpperCase()}_API_KEY`;
  }

  /** 获取 API Key：event > env > '' */
  resolveApiKey(eventApiKey) {
    return eventApiKey || process.env[this.envKey] || '';
  }

  /** 构建请求头 */
  buildHeaders(apiKey) {
    const token = this.authPrefix
      ? `${this.authPrefix} ${apiKey}`
      : `${this.authType} ${apiKey}`;
    return { 'Content-Type': 'application/json', 'Authorization': token };
  }

  /** 构建请求体（子类可覆盖） */
  buildBody(model, messages, params) {
    const body = { model: model || this.defaultModel, messages };
    if (params.temperature !== undefined) body.temperature = parseFloat(params.temperature);
    if (params.maxTokens !== undefined) body.max_tokens = parseInt(params.maxTokens);
    if (params.topP !== undefined) body.top_p = parseFloat(params.topP);
    if (params.stop !== undefined) body.stop = params.stop;
    for (const k in this.extra) {
      if (body[k] === undefined) body[k] = this.extra[k];
    }
    return body;
  }

  /** 是否支持流式（子类可覆盖） */
  doesSupportStream() {
    return this.supportsStream;
  }

  /** 请求超时（子类可覆盖） */
  getTimeout(isStream) {
    return isStream ? 300000 : 120000;
  }

  /** 解析响应（子类覆盖） */
  parseResponse(data) {
    return (
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      ''
    );
  }

  /** 解析错误（子类覆盖） */
  parseError(response) {
    return (
      response?.data?.error?.message ||
      response?.data?.message ||
      JSON.stringify(response?.data)
    );
  }
}

// ==================== Provider 实现 ====================

// --- OpenAI ---
class OpenAIProvider extends BaseProvider {
  constructor() {
    super({
      id: 'openai',
      name: 'OpenAI',
      defaultModel: 'gpt-4.1-mini',
      baseURL: 'https://api.openai.com',
      authType: 'Bearer',
      supportsStream: true,
      envKey: 'OPENAI_API_KEY'
    });
  }
}

// --- DeepSeek ---
class DeepSeekProvider extends BaseProvider {
  constructor() {
    super({
      id: 'deepseek',
      name: 'DeepSeek',
      defaultModel: 'deepseek-v3-0324',
      baseURL: 'https://api.deepseek.com',
      authType: 'Bearer',
      supportsStream: true,
      envKey: 'DEEPSEEK_API_KEY'
    });
  }
}

// --- Kimi（Moonshot AI）---
class KimiProvider extends BaseProvider {
  constructor() {
    super({
      id: 'kimi',
      name: 'Kimi',
      defaultModel: 'kimi-k2.6',
      baseURL: 'https://api.moonshot.cn',
      authType: 'Bearer',
      supportsStream: true,
      envKey: 'KIMI_API_KEY'
    });
  }
}

// --- 腾讯混元 ---
class TencentProvider extends BaseProvider {
  constructor() {
    super({
      id: 'tencent',
      name: '腾讯混元',
      defaultModel: 'hunyuan-turbos-latest',
      baseURL: 'https://hunyuan.cloud.tencent.com',
      authType: 'Bearer',
      supportsStream: true,
      envKey: 'TENCENT_API_KEY'
    });
  }

  buildBody(model, messages, params) {
    const body = super.buildBody(model, messages, params);
    body.stream = false;
    return body;
  }
}

// --- 阿里通义千问（DashScope）---
class AlibabaProvider extends BaseProvider {
  constructor() {
    super({
      id: 'alibaba',
      name: '通义千问',
      defaultModel: 'qwen-plus',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      authType: 'Bearer',
      supportsStream: true,
      envKey: 'ALIBABA_API_KEY'
    });
  }

  buildHeaders(apiKey) {
    const headers = super.buildHeaders(apiKey);
    headers['X-DashScope-Mode'] = 'session';
    return headers;
  }

  parseResponse(data) {
    return (
      data?.choices?.[0]?.message?.content ||
      data?.output?.choices?.[0]?.message?.content ||
      ''
    );
  }
}

// ==================== 工厂 ====================

const PROVIDER_CLASSES = {
  openai:   OpenAIProvider,
  deepseek: DeepSeekProvider,
  kimi:     KimiProvider,
  tencent:  TencentProvider,
  alibaba:  AlibabaProvider,
};

function createProvider(providerId) {
  const ProviderClass = PROVIDER_CLASSES[providerId];
  if (!ProviderClass) {
    throw new Error(`不支持的 provider: ${providerId}，可选: ${Object.keys(PROVIDER_CLASSES).join(', ')}`);
  }
  return new ProviderClass();
}

// ==================== 工具函数 ====================

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'messages 必须是非空数组';
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m.role || typeof m.role !== 'string') {
      return `messages[${i}].role 必填`;
    }
    // 支持字符串 content（文本）或数组 content（多模态：图片识别等）
    if (!m.content || (typeof m.content !== 'string' && !Array.isArray(m.content))) {
      return `messages[${i}].content 必填（字符串或多模态数组）`;
    }
  }
  return null;
}

// ==================== 核心调用 ====================

async function chatSync(provider, model, messages, params) {
  const p = createProvider(provider);

  const apiKey = p.resolveApiKey(params.apiKey);
  if (!apiKey) {
    throw new Error(`缺少 API Key，请配置环境变量 ${p.envKey}，或通过 event.apiKey 传入`);
  }

  const baseURL = params.baseURL || p.baseURL;
  const endpoint = baseURL + '/v1/chat/completions';
  const body = p.buildBody(model, messages, params);

  try {
    const res = await axios.post(endpoint, body, {
      headers: p.buildHeaders(apiKey),
      timeout: params.timeout || p.getTimeout(false)
    });

    // 调试：打印第三方 API 原始返回
    console.log('[aiChat] ' + provider + ' 原始响应: ' + JSON.stringify({
      model: res.data.model,
      object: res.data.object,
      choices: res.data.choices && res.data.choices.map(function(c) {
        return {
          index: c.index,
          finish_reason: c.finish_reason,
          content_type: c.message ? typeof c.message.content : 'N/A',
          content_len: c.message ? (c.message.content ? String(c.message.content).length : 0) : 0,
          content_preview: c.message ? String(c.message.content || '').substring(0, 200) : 'NO_MESSAGE'
        };
      }),
      usage: res.data.usage,
      // 兜底：如果 choices 不存在，打印顶层 keys
      top_keys: Object.keys(res.data)
    }));
    const content = p.parseResponse(res.data);
    if (!content) throw new Error('AI 返回格式异常，未能提取内容');

    return {
      success: true,
      provider: provider,
      model: res.data.model || model || p.defaultModel,
      content,
      usage: res.data.usage || null
    };

  } catch (err) {
    if (err.response) {
      const msg = p.parseError(err.response);
      throw new Error(`[${provider} API ${err.response.status}] ${msg}`);
    }
    throw new Error(`[${provider}] 请求失败: ${err.message}`);
  }
}

async function chatStream(provider, model, messages, params) {
  const p = createProvider(provider);
  if (!p.doesSupportStream()) {
    throw new Error(`${provider} 不支持流式调用`);
  }

  const apiKey = p.resolveApiKey(params.apiKey);
  if (!apiKey) {
    throw new Error(`缺少 API Key，请配置环境变量 ${p.envKey}`);
  }

  const baseURL = params.baseURL || p.baseURL;
  const endpoint = baseURL + '/v1/chat/completions';
  const body = p.buildBody(model, messages, params);
  body.stream = true;

  const res = await axios.post(endpoint, body, {
    headers: p.buildHeaders(apiKey),
    responseType: 'stream',
    timeout: params.timeout || p.getTimeout(true)
  });

  return res.data;
}

// ==================== 图片预处理 ====================

/**
 * 将外部图片 URL 转为 base64 data URL
 * 兼容不支持远程 URL 的模型 API（如 Kimi 多模态）
 */
async function urlToBase64(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  const contentType = response.headers['content-type'] || 'image/jpeg';
  const base64 = Buffer.from(response.data).toString('base64');
  return `data:${contentType};base64,${base64}`;
}

/**
 * 预处理 messages：将 image_url 中的外部 URL 转为 base64
 */
async function preprocessMessages(messages) {
  const processed = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      processed.push(msg);
      continue;
    }
    // content 是数组（多模态）
    const content = [];
    for (const part of msg.content) {
      if (part.type === 'image_url' && part.image_url && part.image_url.url) {
        const imgUrl = part.image_url.url;
        // 已是 base64 data URL 则跳过
        if (imgUrl.startsWith('data:')) {
          content.push(part);
          continue;
        }
        try {
          console.log('[aiChat] 下载图片: ' + imgUrl.substring(0, 80) + '...');
          const base64Url = await urlToBase64(imgUrl);
          console.log('[aiChat] 图片转换完成, 大小: ' + base64Url.length + ' chars');
          content.push({ type: 'image_url', image_url: { url: base64Url } });
        } catch (e) {
          console.error('[aiChat] 图片下载失败，保留原始URL:', e.message);
          content.push(part); // 回退：保留原始 URL
        }
      } else {
        content.push(part);
      }
    }
    processed.push({ ...msg, content });
  }
  return processed;
}

// ==================== 入口 ====================

async function chat(event) {
  const { provider, model, messages, baseURL, stream, temperature, maxTokens, topP, stop, timeout } = event;

  if (!provider) throw new Error('缺少 provider 参数');
  if (!messages) throw new Error('缺少 messages 参数');

  const err = validateMessages(messages);
  if (err) throw new Error('messages 格式错误: ' + err);

  // 多模态场景：将外部图片 URL 转为 base64（兼容 Kimi 等不支持远程 URL 的模型）
  const processedMessages = await preprocessMessages(messages);

  const params = { apiKey: event.apiKey, baseURL, temperature, maxTokens, topP, stop, timeout };
  const isStream = stream === true || stream === 'true';

  return isStream
    ? await chatStream(provider, model, processedMessages, params)
    : await chatSync(provider, model, processedMessages, params);
}

function listProviders() {
  return {
    success: true,
    providers: Object.keys(PROVIDER_CLASSES).map(id => {
      const p = createProvider(id);
      return {
        id: p.id,
        name: p.name,
        defaultModel: p.defaultModel,
        baseURL: p.baseURL,
        supportsStream: p.doesSupportStream(),
        envKey: p.envKey
      };
    })
  };
}

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'chat':           return await chat(event);
      case 'listProviders':  return listProviders();
      default:
        return { error: `未知 action: ${event.action || 'empty'}，支持: chat, listProviders` };
    }
  } catch (e) {
    console.error('[aiChat] error:', e.message);
    return { success: false, error: e.message };
  }
};
