// pages/profile/profile.js
var creditsUtil = require('../../utils/credits.js');

Page({
  data: {
    userRole: '',
    roleLabels: { researcher: '科研人员', editor: '学术编辑' },
    credits: 0,
    signedToday: false,
    continuousDays: 0,
    avatar: '🎓',
    nickname: '我的学术空间',
    isWechatAvatar: false,
    profileCompleted: false,
    currentOpenid: '',
    enabledToolCount: 0  // 用户实际启用的工具总数
  },

  onLoad: function () {
    var that = this;
    var role = wx.getStorageSync('userRole') || 'researcher';
    this.setData({ userRole: role });
    // 先获取 openid，再加载统计
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function(res) {
      var openid = res.result && res.result.openid ? res.result.openid : '';
      that.setData({ currentOpenid: openid }, function() {
        that.loadStats();
      });
    }).catch(function(err) {
      console.error('[profile] 获取用户标识失败', err);
      that.loadStats();
    });
  },

  onShow: function () {
    // 避免首次加载时 currentOpenid 未就绪就查数据库（onLoad 拿到 openid 后会调 loadStats）
    if (this.data.currentOpenid) {
      this.loadStats();
    }
    this.loadCreditsInfo();
    this.loadProfile();
  },

  loadCreditsInfo: function() {
    var self = this;
    creditsUtil.getCreditsInfo().then(function(res) {
      if (res.success !== false) {
        self.setData({
          credits: res.credits || 0,
          signedToday: res.signedToday || false,
          continuousDays: res.continuousDays || 0
        });
      }
    }).catch(function() {});
  },

  // 加载用户资料（头像和昵称）——优先从数据库取，取不到或无效时显示默认
  loadProfile: function() {
    var self = this;
    var defaults = {
      avatar: '🎓',
      nickname: '我的学术空间',
      isWechatAvatar: false,
      profileCompleted: false
    };

    wx.cloud.callFunction({
      name: 'creditsAPI',
      data: { action: 'getUserProfile' },
      success: function(res) {
        var profile = (res.result && res.result.success) ? res.result.profile : null;
        if (!profile) {
          self.setData(defaults);
          return;
        }

        var avatar = profile.avatar || '';
        var isWechatAvatar = false;

        // 只有有效的网络/云存储路径才当头像用，否则回退默认
        if (avatar && (avatar.indexOf('http') === 0 || avatar.indexOf('cloud://') === 0)) {
          isWechatAvatar = true;
        } else {
          avatar = defaults.avatar;
        }

        self.setData({
          avatar: avatar,
          nickname: profile.nickname || defaults.nickname,
          isWechatAvatar: isWechatAvatar,
          profileCompleted: profile.profileCompleted || false
        });
      },
      fail: function(err) {
        console.error('[profile] 加载资料失败', err);
        self.setData(defaults);
      }
    });
  },

  // 头像选择回调：先上传到云存储，再保存永久 fileID
  onChooseAvatar: function(e) {
    var avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;
    var self = this;
    wx.showLoading({ title: '上传中' });
    var cloudPath = 'avatars/' + Date.now() + '.png';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: avatarUrl
    }).then(function(uploadRes) {
      var fileID = uploadRes.fileID;
      self.setData({
        avatar: fileID,
        isWechatAvatar: true
      });
      return self.saveAvatar(fileID);
    }).then(function() {
      wx.hideLoading();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    }).catch(function(err) {
      wx.hideLoading();
      console.error('[profile] 头像上传失败', err);
      wx.showToast({ title: '头像上传失败', icon: 'none' });
    });
  },

  // 保存头像 fileID 到云端
  saveAvatar: function(fileID) {
    return new Promise(function(resolve, reject) {
      wx.cloud.callFunction({
        name: 'creditsAPI',
        data: {
          action: 'updateProfile',
          profile: { avatar: fileID }
        },
        success: function(res) {
          if (res.result && res.result.success) {
            resolve(res.result);
          } else {
            reject(new Error('保存失败'));
          }
        },
        fail: function(err) {
          reject(err);
        }
      });
    });
  },

  // 昵称输入
  onNicknameInput: function(e) {
    var nickname = e.detail.value;
    this.setData({ nickname: nickname });
    this.saveNickname(nickname);
  },

  // 保存昵称到云端
  saveNickname: function(nickname) {
    wx.cloud.callFunction({
      name: 'creditsAPI',
      data: {
        action: 'updateProfile',
        profile: { nickname: nickname }
      },
      success: function(res) {
        if (res.result && res.result.success) {
          console.log('昵称已更新');
        }
      }
    });
  },

  // 跳转编辑资料页
  goToEditProfile: function() {
    wx.navigateTo({ url: '/pages/editProfile/editProfile' });
  },

  doSignin: function() {
    var self = this;
    if (self.data.signedToday) return;
    creditsUtil.doSignin().then(function(res) {
      if (res.success) {
        wx.showToast({ title: '签到成功 +' + res.earnedPoints + '积分', icon: 'none' });
        self.setData({ credits: res.credits, signedToday: true, continuousDays: res.continuousDays });
      } else if (res.alreadySigned) {
        wx.showToast({ title: '今日已签到', icon: 'none' });
        self.setData({ signedToday: true });
      }
    }).catch(function() {
      wx.showToast({ title: '签到失败', icon: 'none' });
    });
  },

  goToCredits: function() {
    wx.navigateTo({ url: '/pages/credits/credits' });
  },

  loadStats: function () {
    var self = this;
    var db = wx.cloud.database();
    var TASK_COLLECTION_MAP = {
      submission: 'submissions',
      review: 'reviews',
      conference: 'conferences',
      archive: 'archives',
      specialIssue: 'special_issue_tasks',
      citation: 'citation_library'
    };

    // 获取用户启用的工具列表，只显示有对应数据库集合的工具（自动排除待发布工具）
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserTools' }
    }).then(function(res) {
      var userTools = res.result || {};
      var toolCache = require('../../utils/toolCache.js');
      return toolCache.getAllTools().then(function(toolDefs) {
        var enabledTools = [];
        for (var i = 0; i < toolDefs.length; i++) {
          var t = toolDefs[i];
          // 只显示已启用且有对应集合的工具（citation_library / special_issue_tasks 等）
          if (userTools[t.id] === true && TASK_COLLECTION_MAP[t.id]) {
            enabledTools.push({
              id: t.id,
              name: t.name,
              color: t.color || 'blue',
              pagePath: t.pagePath || ''
            });
          }
        }
        return enabledTools;
      });
    }).then(function(tools) {
      // 记录实际启用的工具总数（用于 badge 显示）
      var totalEnabled = tools.length;
      if (tools.length === 0) {
        self.setData({ statItems: [], enabledToolCount: 0 });
        return;
      }
      // 最多显示4个统计项，避免页面过长也减少查询
      var displayTools = tools.slice(0, 4);
      var countPromises = displayTools.map(function(tool) {
        var colName = TASK_COLLECTION_MAP[tool.id];
        if (!colName) return Promise.resolve({ total: 0 });
        return db.collection(colName).where({ deleteTime: null, _openid: self.data.currentOpenid }).count().catch(function() { return { total: 0 }; });
      });
      return Promise.all(countPromises).then(function(results) {
        var statItems = [];
        for (var i = 0; i < displayTools.length; i++) {
          statItems.push({
            id: displayTools[i].id,
            name: displayTools[i].name,
            count: results[i].total,
            color: displayTools[i].color,
            pagePath: displayTools[i].pagePath
          });
        }
        self.setData({ statItems: statItems, enabledToolCount: totalEnabled });
      });
    }).catch(function (e) {
      console.error('[个人中心] 加载统计失败', e);
    });
  },

  // 统计卡片点击 → 跳转到独立的统计页面
  _statPageMap: {
    submission: '/pages/submissions/stats/stats',
    review: '/pages/reviews/stats/stats',
    conference: '/pages/conferences/stats/stats',
    archive: '/pages/archive/stats/stats'
  },

  goToStatPage: function(e) {
    var toolId = e.currentTarget.dataset.id;
    var statsPage = this._statPageMap[toolId];
    if (statsPage) {
      wx.navigateTo({ url: statsPage });
      return;
    }
    // 兜底：旧逻辑用 pagePath
    var pagePath = e.currentTarget.dataset.page;
    if (pagePath) wx.navigateTo({ url: pagePath });
  },

  // ========== 导航 ==========
  goToToolManager: function () {
    wx.navigateTo({ url: '/pages/toolManager/toolManager' });
  },

  goToSettings: function () {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  // ========== 反馈与关于 ==========
  sendFeedback: function () {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  showAbout: function () {
    wx.showModal({
      title: '关于学术工具',
      content: '版本：v1.0.0\n\n学术工具是一款面向科研人员、学术编辑的工具集，帮助您高效管理学术工作流。',
      showCancel: false
    });
  },

  // ========== 账户操作 ==========
  resetOnboarding: function () {
    wx.showModal({
      title: '重新引导',
      content: '确定要重新进行角色设置吗？',
      success: function (res) {
        if (res.confirm) {
          wx.removeStorageSync('hasOnboarded');
          wx.removeStorageSync('userRole');
          wx.reLaunch({ url: '/pages/onboarding/onboarding' });
        }
      }
    });
  },

  logout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: function (res) {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.reLaunch({ url: '/pages/onboarding/onboarding' });
        }
      }
    });
  },

  clearData: function () {
    wx.showModal({
      title: '清除数据',
      content: '确定要清除所有本地数据吗？',
      success: function (res) {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  }
});
