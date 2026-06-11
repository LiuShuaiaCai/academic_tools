/**
 * chatBot.js - 特刊策划调用工具
 * V4: 异步轮询架构 - 触发任务后每3秒轮询结果，支持进度回调
 */

/**
 * 特刊策划（异步轮询模式）
 * @param {string} keyword - 研究关键词
 * @param {function} onProgress - 进度回调 (progress: 'searching'|'fetching_authors'|'generating'|'completed')
 * @returns {Promise<object>} 解析后的策划方案 JSON
 */
function planSpecialIssue(keyword, onProgress) {
  return new Promise(function(resolve, reject) {
    // Step 1: 触发任务
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { keyword: keyword, action: 'trigger' }
    }).then(function(res) {
      var result = res.result;
      console.log('[chatBot] 触发任务, success:', result.success, 'taskId:', result.taskId);

      if (!result.success) {
        reject(new Error(result.error || '创建任务失败'));
        return;
      }

      var taskId = result.taskId;
      if (onProgress) onProgress('searching');

      // Step 2: 轮询结果
      var pollCount = 0;
      var maxPolls = 120; // 最多轮询 120 次（6 分钟）

      var pollTimer = setInterval(function() {
        pollCount++;
        if (pollCount > maxPolls) {
          clearInterval(pollTimer);
          reject(new Error('处理超时，请稍后重试'));
          return;
        }

        wx.cloud.callFunction({
          name: 'specialIssueAgent',
          data: { action: 'poll', taskId: taskId }
        }).then(function(pollRes) {
          var pollResult = pollRes.result;
          if (!pollResult.success) return;

          var data = pollResult.data;
          console.log('[chatBot] 轮询 #' + pollCount + ', status:', data.status, 'progress:', data.progress);

          // 进度更新
          if (onProgress && data.progress) {
            onProgress(data.progress);
          }

          if (data.status === 'completed') {
            clearInterval(pollTimer);
            resolve(data.result);
          } else if (data.status === 'failed') {
            clearInterval(pollTimer);
            reject(new Error(data.error || '策划生成失败'));
          }
          // status === 'processing' → 继续轮询
        }).catch(function(err) {
          console.warn('[chatBot] 轮询请求失败:', err);
          // 单次轮询失败不终止，继续等待
        });
      }, 3000); // 每 3 秒轮询一次
    }).catch(function(err) {
      console.error('[chatBot] 触发任务失败:', err);
      reject(new Error('网络错误: ' + (err.errMsg || err.message || JSON.stringify(err))));
    });
  });
}

/**
 * 从 AI 回复中提取 JSON
 */
function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    var jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim());
    }
    var objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      return JSON.parse(objMatch[0]);
    }
    throw new Error('无法从回复中提取有效的 JSON');
  }
}

module.exports = {
  planSpecialIssue: planSpecialIssue,
  extractJSON: extractJSON
};
