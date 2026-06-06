// cloudfunctions/fileService/index.js
// 职责：文件处理服务
// - extractText: 从云存储文件提取文本（PDF/Word），maxChars=0 时不截断
// - getImageTempURL: 获取云存储图片临时链接

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const axios = require('axios');

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

// ==================== 文本提取 ====================

async function extractText(event) {
  var fileID = event.fileID;
  if (!fileID) return { success: false, error: '缺少 fileID 参数' };

  var text = await extractTextFromFile(fileID);
  if (!text || text.trim().length < 50) {
    return { success: false, error: '文件内容为空或过短' };
  }

  var maxChars = event.maxChars;
  if (maxChars === undefined || maxChars === null) {
    maxChars = 60000;
  }
  var resultText = text;
  if (maxChars > 0 && text.length > maxChars) {
    resultText = text.substring(0, maxChars) + '\n\n[... 稿件内容过长，已截断 ...]';
  }

  return { success: true, text: resultText, originalLength: text.length };
}

// ==================== 获取图片临时链接（AI识别由小程序端完成）====================

async function getImageTempURL(event) {
  var fileID = event.fileID;
  if (!fileID) return { success: false, error: '缺少 fileID 参数' };

  try {
    var urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
    var imgURL = urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
    if (!imgURL) return { success: false, error: '无法获取图片链接' };

    return { success: true, imageUrl: imgURL };
  } catch (err) {
    console.error('[getImageTempURL] 失败', err);
    return { success: false, error: '获取图片链接失败：' + err.message };
  }
}

// ==================== 入口 ====================

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'extractText':  return await extractText(event);
      case 'getImageTempURL':    return await getImageTempURL(event);
      default: return { error: '未知操作: ' + (event.action || 'empty') };
    }
  } catch (e) {
    console.error('[fileService] error:', e.message);
    return { success: false, error: e.message };
  }
};
