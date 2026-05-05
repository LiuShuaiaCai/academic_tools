// cloudfunctions/aiService/index.js
// 职责：AI 审稿服务
// - extractText: 从云存储文件提取文本（PDF/Word）
// - aiReview: 调用 AI 进行审稿（使用 cloud.AI.createModel）
// - getProviders: 返回可用 AI 模型列表

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const axios = require('axios');

// ==================== 模型配置 ====================
const AI_MODELS = {
  'deepseek': {
    model: 'deepseek-v3-0324',
    name: 'DeepSeek V3',
    maxChars: 60000,
    temperature: 0.3,
    maxTokens: 4096
  },
  'kimi-custom': {
    model: 'moonshot-v1-128k',
    name: 'Kimi',
    maxChars: 100000,
    temperature: 0.3,
    maxTokens: 4096
  },
  'hunyuan-exp': {
    model: 'hunyuan-turbos-latest',
    name: '混元 Turbo',
    maxChars: 80000,
    temperature: 0.3,
    maxTokens: 4096
  }
};

var DEFAULT_MODEL = 'hunyuan-exp';

// ==================== 文件文本提取 ====================

async function extractTextFromFile(fileID) {
  const pdfParse = require('pdf-parse');
  const mammoth = require('mammoth');

  var urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
  var fileURL = urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
  if (!fileURL) throw new Error('无法获取文件链接');

  var downloadRes = await axios.get(fileURL, { responseType: 'arraybuffer' });
  var buffer = Buffer.from(downloadRes.data);

  var fileName = (urlRes.fileList[0].fileName || fileID).toLowerCase();

  if (fileName.endsWith('.pdf') || fileID.toLowerCase().includes('.pdf')) {
    var pdfData = await pdfParse(buffer);
    return pdfData.text;
  } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc') || fileID.toLowerCase().match(/\.docx?$/)) {
    var docResult = await mammoth.extractRawText({ buffer: buffer });
    return docResult.value;
  } else {
    throw new Error('不支持的文件类型，仅支持 PDF 和 Word');
  }
}

// ==================== AI 调用（cloud.AI.createModel）====================

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

async function callAI(groupName, paperText) {
  var config = AI_MODELS[groupName];
  if (!config) throw new Error('不支持的 AI 模型: ' + groupName);

  var prompt = buildReviewPrompt(paperText, config.maxChars);

  var model = cloud.AI.createModel(groupName);

  var result = await model.generateText({
    model: config.model,
    messages: [
      { role: 'system', content: '你是一位经验丰富的学术审稿专家，擅长各个学科领域的论文审稿。你的审稿意见专业、客观、具有建设性。' },
      { role: 'user', content: prompt }
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens
  });

  if (result && result.choices && result.choices[0] && result.choices[0].message) {
    return result.choices[0].message.content || result.choices[0].message;
  }
  if (result && result.content) {
    return result.content;
  }
  throw new Error(config.name + ' API 返回格式异常');
}

// ==================== 方法 ====================

async function extractText(event) {
  var fileID = event.fileID;
  if (!fileID) return { success: false, error: '缺少 fileID 参数' };

  var text = await extractTextFromFile(fileID);
  if (!text || text.trim().length < 50) {
    return { success: false, error: '文件内容为空或过短' };
  }

  var maxChars = event.maxChars || 60000;
  var truncated = text.length > maxChars
    ? text.substring(0, maxChars) + '\n\n[... 稿件内容过长，已截断 ...]'
    : text;

  return { success: true, text: truncated, originalLength: text.length };
}

async function aiReview(event) {
  var fileID = event.fileID;
  var provider = event.provider || DEFAULT_MODEL;

  if (!fileID) return { success: false, error: '缺少 fileID 参数' };

  var textResult = await extractTextFromFile(fileID);
  if (!textResult || textResult.trim().length < 50) {
    return { success: false, error: '文件内容为空或过短' };
  }

  var reviewText = await callAI(provider, textResult);

  return {
    success: true,
    reviewText: reviewText,
    originalLength: textResult.length
  };
}

async function getProviders() {
  var list = [];
  var keys = Object.keys(AI_MODELS);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var p = AI_MODELS[key];
    list.push({
      id: key,
      name: p.name,
      model: p.model,
      maxChars: p.maxChars
    });
  }
  return { success: true, providers: list, default: DEFAULT_MODEL };
}

// ==================== 入口 ====================

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'extractText':  return await extractText(event);
      case 'aiReview':    return await aiReview(event);
      case 'getProviders': return await getProviders();
      default: return { error: '未知操作: ' + (event.action || 'empty') };
    }
  } catch (e) {
    console.error('[aiService] error:', e.message);
    return { success: false, error: e.message };
  }
};
