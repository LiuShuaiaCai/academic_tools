// app.js
App({
  globalData: {
    env: "cloud1-d9gwkfeid5c310b5a",
    firstLaunch: false,
    userRole: null // researcher / reviewer / editor
  },

  onLaunch: function () {
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

    // 检查是否已完成引导
    var hasOnboarded = wx.getStorageSync('hasOnboarded');
    if (!hasOnboarded) {
      this.globalData.firstLaunch = true;
    }
  }
});
