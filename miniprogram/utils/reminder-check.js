// utils/reminder-check.js
// 提醒额度检查工具（实时查云端，不依赖本地缓存）

/**
 * 检查提醒额度，不足时自动在 page/component 上显示提示
 * @param {Object} ctx - Page 或 Component 实例 (this)
 * @returns {Promise}
 */
function checkAndShowTip(ctx) {
  return new Promise(function (resolve, reject) {
    var db = wx.cloud.database();
    db.collection('user_settings').get().then(function (res) {
      var us = (res.data && res.data.length > 0) ? res.data[0] : null;
      var msgRemind = us ? us.msgRemind !== false : true; // 无记录默认开启
      var quota = us ? (us.reminderQuota || 0) : 0;

      if (!msgRemind) {
        resolve({ showed: false, reason: 'msgRemind_off' });
        return;
      }
      if (quota < 5) {
        if (ctx && ctx.setData) {
          ctx.setData({ showQuotaTip: true });
        }
        resolve({ showed: true, quota: quota });
      } else {
        resolve({ showed: false, reason: 'quota_sufficient', quota: quota });
      }
    }).catch(function (err) {
      console.error('[reminder-check] 查询云端设置失败', err);
      reject(err);
    });
  });
}

/**
 * 手动隐藏提示
 * @param {Object} ctx - Page 或 Component 实例
 */
function hideTip(ctx) {
  if (ctx && ctx.setData) {
    ctx.setData({ showQuotaTip: false });
  }
}

/**
 * 跳转到设置页
 */
function navigateToSettings() {
  wx.navigateTo({
    url: '/pages/settings/settings'
  });
}

module.exports = {
  checkAndShowTip: checkAndShowTip,
  hideTip: hideTip,
  navigateToSettings: navigateToSettings
};
