// pages/settings/settings.js
Page({
  data: {
    settings: [
      { key: 'msgRemind', title: '消息提醒', desc: '截止前3天/1天推送提醒', value: true },
      { key: 'emailRemind', title: '邮件提醒', desc: '同步发送邮件通知', value: true },
      { key: 'soundFeedback', title: '音效反馈', desc: '操作完成播放提示音', value: false }
    ],
    reminderQuota: 0,
    loadingQuota: false,
    currentOpenid: ''
  },

  onLoad: function () {
    var that = this;
    this.loadSettings();
    // 先从云函数获取 openid，防止 storage 为空时查询全部数据
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function(res) {
      var openid = res.result && res.result.openid ? res.result.openid : '';
      that.setData({ currentOpenid: openid });
      // 同步到 storage 供其他工具使用
      if (openid) {
        wx.setStorageSync('openid', openid);
      }
      that.loadUserSettings();
    }).catch(function(err) {
      console.error('[settings] 获取用户标识失败', err);
      // 回退：尝试从 storage 读取
      var fallbackOpenid = wx.getStorageSync('openid') || '';
      that.setData({ currentOpenid: fallbackOpenid }, function() {
        that.loadUserSettings();
      });
    });
  },

  // ========== 加载本地设置 ==========
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

  // ========== 从云端加载用户设置（ reminderQuota 等）==========
  loadUserSettings: function () {
    var that = this;
    var db = wx.cloud.database();
    var openid = that.data.currentOpenid;
    if (!openid) return;
    db.collection('user_settings').where({ _openid: openid }).get().then(function (res) {
      if (res.data && res.data.length > 0) {
        var us = res.data[0];
        var quota = us.reminderQuota || 0;
        if (quota < 0) quota = 0;
        that.setData({ reminderQuota: quota });
        var saved = wx.getStorageSync('settings') || {};
        saved.reminderQuota = us.reminderQuota || 0;
        saved.msgRemind = us.msgRemind !== false;  // 云端无值时默认 true
        saved.emailRemind = us.emailRemind !== false;
        saved.soundFeedback = us.soundFeedback === true;
        wx.setStorageSync('settings', saved);
      }
    }).catch(function (err) {
      console.error('[设置] 加载云端设置失败', err);
      wx.showToast({ title: '额度加载失败', icon: 'none' });
    });
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
    data.reminderQuota = this.data.reminderQuota;
    try {
      wx.setStorageSync('settings', data);
    } catch (e) {
      wx.showToast({ title: '本地保存失败', icon: 'error' });
      return;
    }

    // 同步到云端
    var db = wx.cloud.database();
    var that = this;
    var openid = that.data.currentOpenid;
    if (!openid) {
      wx.showToast({ title: '用户信息获取中，请稍后重试', icon: 'none' });
      return;
    }
    db.collection('user_settings').where({ _openid: openid }).get().then(function (res) {
      var saveData = {
        msgRemind: data.msgRemind,
        emailRemind: data.emailRemind,
        soundFeedback: data.soundFeedback,
        reminderQuota: that.data.reminderQuota,
        updateTime: db.serverDate()
      };
      if (res.data && res.data.length > 0) {
        return db.collection('user_settings').doc(res.data[0]._id).update({ data: saveData });
      } else {
        return db.collection('user_settings').add({ data: saveData });
      }
    }).then(function () {
      wx.showToast({ title: '已保存', icon: 'success' });
    }).catch(function (e) {
      console.error('设置保存失败', e);
      wx.showToast({ title: '云端保存失败', icon: 'error' });
    });
  },

  // ========== 请求订阅消息授权（补充额度）==========
  requestSubscribeAuth: function () {
    var that = this;
    that.setData({ loadingQuota: true });
    wx.requestSubscribeMessage({
      tmplIds: ['QHjTeMKp-0TwGCtPiHvCHsW420pBuiSLHAqNqsV1x1Q'],
      success: function (res) {
        var accepted = res['QHjTeMKp-0TwGCtPiHvCHsW420pBuiSLHAqNqsV1x1Q'] === 'accept';
        if (accepted) {
          var newQuota = that.data.reminderQuota + 1;
          that.setData({ reminderQuota: newQuota, loadingQuota: false });
          var saved = wx.getStorageSync('settings') || {};
          saved.reminderQuota = newQuota;
          wx.setStorageSync('settings', saved);
          that.syncQuotaToCloud(newQuota);
          wx.showToast({ title: '额度 +1', icon: 'success' });
        } else {
          that.setData({ loadingQuota: false });
          wx.showToast({ title: '授权未通过', icon: 'none' });
        }
      },
      fail: function (err) {
        that.setData({ loadingQuota: false });
        console.error('订阅授权失败', err);
        wx.showToast({ title: '授权失败', icon: 'none' });
      }
    });
  },

  // ========== 同步额度到云端 ==========
  syncQuotaToCloud: function (quota) {
    var that = this;
    var db = wx.cloud.database();
    var openid = that.data.currentOpenid;
    if (!openid) {
      console.error('[settings] 无法同步额度：缺少 openid');
      return;
    }
    db.collection('user_settings').where({ _openid: openid }).get().then(function (res) {
      if (res.data && res.data.length > 0) {
        return db.collection('user_settings').doc(res.data[0]._id).update({
          data: { reminderQuota: quota, updateTime: db.serverDate() }
        });
      } else {
        return db.collection('user_settings').add({
          data: { reminderQuota: quota, updateTime: db.serverDate() }
        });
      }
    }).then(function () {
      // 同步成功，刷新本地缓存
      var saved = wx.getStorageSync('settings') || {};
      saved.reminderQuota = quota;
      wx.setStorageSync('settings', saved);
    }).catch(function (err) {
      console.error('同步额度失败', err);
      wx.showToast({ title: '额度保存失败，请检查网络', icon: 'none' });
      // 回滚显示，下次进入会重新加载云端值
      that.loadUserSettings();
    });
  },

  // ========== 返回 ==========
  goBack: function () {
    wx.navigateBack();
  }
});
