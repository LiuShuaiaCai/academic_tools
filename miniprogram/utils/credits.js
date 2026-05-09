// miniprogram/utils/credits.js
// 积分工具函数：扣费检查、余额不足弹窗
// 调用云函数: creditsAPI

/**
 * 检查余额并消耗积分
 * @param {string} action - 消耗类型：'ai_review' / 'new_submission' / 'new_review' / 'new_conference'
 * @param {number} points - 消耗积分数（可选，不传则用默认值）
 * @param {string} description - 描述（可选）
 * @param {string} relatedId - 关联业务ID（可选）
 * @returns {Promise<{success: boolean, balance: number}>}
 */
function spendCredits(action, points, description, relatedId) {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: {
      action: 'spendCredits',
      actionType: action,
      points: points,
      description: description,
      relatedId: relatedId
    }
  }).then(function(res) {
    var result = res.result;
    if (result.insufficient) {
      // 余额不足，弹出提示
      return showInsufficientDialog(result.balance, result.required);
    }
    return result;
  });
}

/**
 * 显示积分不足弹窗（更醒目的样式）
 */
function showInsufficientDialog(balance, required) {
  return new Promise(function(resolve) {
    wx.showModal({
      title: '⚠️ 积分不足',
      content: '当前余额：' + balance + ' 积分\n需要：' + required + ' 积分\n\n💡 每日签到可获得 +10 积分',
      confirmText: '去签到',
      cancelText: '取消',
      confirmColor: '#F59E0B',
      success: function(res) {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/credits/credits' });
        }
        resolve({ success: false, insufficient: true, balance: balance });
      },
      fail: function() {
        resolve({ success: false, insufficient: true, balance: balance });
      }
    });
  });
}

/**
 * 获取积分信息
 */
function getCreditsInfo() {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: { action: 'getCreditsInfo' }
  }).then(function(res) {
    return res.result || {};
  });
}

/**
 * 执行签到
 */
function doSignin() {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: { action: 'doSignin' }
  }).then(function(res) {
    return res.result || {};
  });
}

/**
 * 初始化积分（新用户）
 */
function initCredits() {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: { action: 'initCredits' }
  }).then(function(res) {
    return res.result || {};
  });
}

/**
 * 获取积分流水列表
 */
function getCreditsList(page, pageSize) {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: { action: 'getCreditsList', page: page || 1, pageSize: pageSize || 20 }
  }).then(function(res) {
    return res.result || {};
  });
}

/**
 * 获取积分月度统计
 */
function getCreditsStats() {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: { action: 'getCreditsStats' }
  }).then(function(res) {
    return res.result || {};
  });
}

/**
 * 清理过期积分（每天检查）
 */
function cleanExpiredCredits() {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: { action: 'cleanExpiredCredits' }
  }).then(function(res) {
    return res.result || {};
  });
}

// 兼容旧接口
function checkCreditsExpire() {
  return cleanExpiredCredits();
}

/**
 * 完善用户资料
 */
function completeProfile(profile) {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: { action: 'completeProfile', profile: profile }
  }).then(function(res) {
    return res.result || {};
  });
}

/**
 * 获取用户资料
 */
function getUserProfile() {
  return wx.cloud.callFunction({
    name: 'creditsAPI',
    data: { action: 'getUserProfile' }
  }).then(function(res) {
    return res.result || {};
  });
}

// 积分消耗默认值映射
var CREDIT_COSTS = {
  ai_review: 20,
  new_submission: 5,
  new_review: 5,
  new_conference: 5
};

module.exports = {
  spendCredits: spendCredits,
  showInsufficientDialog: showInsufficientDialog,
  getCreditsInfo: getCreditsInfo,
  doSignin: doSignin,
  initCredits: initCredits,
  getCreditsList: getCreditsList,
  getCreditsStats: getCreditsStats,
  cleanExpiredCredits: cleanExpiredCredits,
  checkCreditsExpire: checkCreditsExpire,
  completeProfile: completeProfile,
  getUserProfile: getUserProfile,
  CREDIT_COSTS: CREDIT_COSTS
};
