// app.js
App({
  globalData: {
    env: "cloud1-d9gwkfeid5c310b5a",
    firstLaunch: false,
    userRole: null // researcher / reviewer / editor
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

    // 初始化积分（新用户赠送100）
    wx.cloud.callFunction({
      name: 'creditsAPI',
      data: { action: 'initCredits' }
    }).then(function(res) {
      if (res.result && res.result.initialized) {
        console.log('[app.js] 新用户积分初始化完成');
      }
    }).catch(function(err) {
      console.error('[app.js] 积分初始化失败', err);
    });

    // 检查邀请参数，给分享者加积分
    this._checkInviteReward(options);

    // 检查是否已完成引导
    var hasOnboarded = wx.getStorageSync('hasOnboarded');
    if (!hasOnboarded) {
      this.globalData.firstLaunch = true;
    }
  },

  // 检查邀请奖励
  _checkInviteReward: function(options) {
    var that = this;
    var query = options.query || options.referrerInfo || {};
    // 兼容场景值1044（群分享卡片）和其他场景
    var inviterOpenid = query.inviter || query.inviterOpenid || '';
    if (!inviterOpenid) return;

    // 标记已处理，避免重复奖励
    var inviteKey = 'invited_by_' + inviterOpenid;
    var processed = wx.getStorageSync(inviteKey);
    if (processed) return;

    // 给分享者加50积分
    // 注意：云函数端需要 openid，这里通过调用云函数处理
    // 由于邀请者 openid 无法在当前用户上下文中直接写入，
    // 简化处理：当前用户首次打开时记录 inviter，由分享者下次打开时检查
    wx.setStorageSync(inviteKey, true);
    console.log('[app.js] 邀请来源已记录:', inviterOpenid);
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
