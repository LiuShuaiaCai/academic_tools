// app.js
App({
  globalData: {
    env: "online-d7ghspq5r1b409893",
    firstLaunch: false,
    userRole: null, // researcher / reviewer / editor
    locale: 'zh'   // 当前语言：zh | en
  },

  onLaunch: function (options) {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }
    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true
    });

    // 每次启动都调用云函数检查并初始化数据库
    wx.cloud.callFunction({
      name: 'academicTools',
      data: { type: 'initDB' }
    }).then(function(res) {
      console.log('[app.js] 数据库初始化完成', res.result);
    }).catch(function(err) {
      console.error('[app.js] 数据库初始化失败', err);
    });

    // 初始化积分（新用户赠送100），完成后才检查邀请奖励（确保用户记录已存在）
    var that = this;
    wx.cloud.callFunction({
      name: 'creditsAPI',
      data: { action: 'initCredits' }
    }).then(function(res) {
      var isNewUser = res.result && res.result.initialized === true;
      if (isNewUser) {
        console.log('[app.js] 新用户积分初始化完成');
      }
      // 将真正的新用户标识传递给邀请奖励检查
      that._checkInviteReward(options, isNewUser);
    }).catch(function(err) {
      console.error('[app.js] 积分初始化失败', err);
    });

    // 检查是否已完成引导
    var hasOnboarded = wx.getStorageSync('hasOnboarded');
    if (!hasOnboarded) {
      this.globalData.firstLaunch = true;
    }

    // 初始化 i18n 语言设置
    try {
      var storedLocale = wx.getStorageSync('app_locale');
      if (storedLocale) {
        this.globalData.locale = storedLocale;
      }
    } catch (e) { /* ignore */ }
  },

  // 检查邀请奖励（仅真正的新用户触发奖励发放）
  // isNewUser：initCredits 返回 initialized=true 才是新用户
  _checkInviteReward: function(options, isNewUser) {
    var query = options.query || options.referrerInfo || {};
    // 兼容场景值1044（群分享卡片）和其他场景
    var inviterOpenid = query.inviter || query.inviterOpenid || '';
    if (!inviterOpenid) return;

    // 本地已处理过则跳过（双重保险，云端也有幂等保护）
    var inviteKey = 'invited_by_' + inviterOpenid;
    var processed = wx.getStorageSync(inviteKey);
    if (processed) return;

    // 调用云函数，isNewUser 为 true 才给邀请者发积分
    wx.cloud.callFunction({
      name: 'creditsAPI',
      data: {
        action: 'claimInviteReward',
        inviterOpenid: inviterOpenid,
        isNewUser: isNewUser
      }
    }).then(function(res) {
      var result = res.result || {};
      if (result.success && result.rewarded) {
        console.log('[app.js] 邀请奖励发放成功，邀请者获得', result.points, '积分');
      } else {
        console.log('[app.js] 邀请奖励未发放，原因:', result.reason);
      }
      // 无论是否发放成功，都记录本地标记避免重复调用
      wx.setStorageSync(inviteKey, true);
    }).catch(function(err) {
      console.error('[app.js] 邀请奖励检查失败:', err);
      // 云函数失败不记录本地标记，下次启动会重试
    });
  },

  // 全局分享配置（邀请好友）
  onShareAppMessage: function() {
    var openid = wx.getStorageSync('openid') || '';
    return {
      title: '学术管理工具 - 高效管理投稿、审稿、学术会议',
      path: '/pages/home/home?inviter=' + openid,
      imageUrl: ''
    };
  }
});
