// pages/settings/settings.js
Page({
  data: {
    settings: [
      { key: 'msgRemind', title: '消息提醒', desc: '截止前3天/1天推送提醒', value: true },
      { key: 'emailRemind', title: '邮件提醒', desc: '同步发送邮件通知', value: true },
      { key: 'soundFeedback', title: '音效反馈', desc: '操作完成播放提示音', value: false }
    ]
  },

  onLoad: function () {
    this.loadSettings();
  },

  // ========== 加载设置 ==========
  loadSettings: function () {
    try {
      var saved = wx.getStorageSync('settings');
      if (saved) {
        var settings = this.data.settings.map(function (item) {
          var obj = { key: item.key, title: item.title, desc: item.desc };
          obj.value = saved[item.key] !== undefined ? saved[item.key] : item.value;
          return obj;
        });
        this.setData({ settings: settings });
      }
    } catch (e) {
      console.error('[设置] 加载失败', e);
    }
  },

  // ========== 切换开关 ==========
  toggleSetting: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var key = 'settings[' + idx + '].value';
    var newVal = !this.data.settings[idx].value;
    var data = {};
    data[key] = newVal;
    this.setData(data);
    this.saveSettings();
  },

  // ========== 保存设置 ==========
  saveSettings: function () {
    var settings = this.data.settings;
    var data = {};
    settings.forEach(function (item) {
      data[item.key] = item.value;
    });
    try {
      wx.setStorageSync('settings', data);
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  // ========== 返回 ==========
  goBack: function () {
    wx.navigateBack();
  }
});
