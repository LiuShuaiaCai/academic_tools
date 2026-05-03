// pages/profile/profile.js
Page({
  data: {
    userRole: '',
    roleLabels: { researcher: '科研人员', reviewer: '审稿人', editor: '学术编辑' },
    stats: { submissions: 0, reviews: 0, conferences: 0, archives: 0 },
    menuItems: [
      { icon: '🔧', text: '工具管理', action: 'goToToolManager' },
      { icon: '💾', text: '数据备份', action: 'backupData' },
      { icon: '📥', text: '数据还原', action: 'restoreData' },
      { icon: '⚙️', text: '设置', action: 'goToSettings' },
      { icon: '💬', text: '意见反馈', action: 'sendFeedback' },
      { icon: 'ℹ️', text: '关于', action: 'showAbout' },
      { icon: '🔄', text: '重新设置角色', action: 'resetOnboarding' },
      { icon: '🚪', text: '退出登录', action: 'logout' },
      { icon: '🗑️', text: '清除本地数据', action: 'clearData' }
    ]
  },

  onLoad: function () {
    var role = wx.getStorageSync('userRole') || 'researcher';
    this.setData({ userRole: role });
    this.loadStats();
  },

  onShow: function () {
    this.loadStats();
  },

  loadStats: function () {
    var self = this;
    var db = wx.cloud.database();
    Promise.all([
      db.collection('submissions').count().catch(function () { return { total: 0 }; }),
      db.collection('reviews').count().catch(function () { return { total: 0 }; }),
      db.collection('conferences').count().catch(function () { return { total: 0 }; }),
      db.collection('archives').count().catch(function () { return { total: 0 }; })
    ]).then(function (results) {
      self.setData({
        'stats.submissions': results[0].total,
        'stats.reviews': results[1].total,
        'stats.conferences': results[2].total,
        'stats.archives': results[3].total
      });
    }).catch(function (e) {
      console.error('[个人中心] 加载统计失败', e);
    });
  },

  // ========== 导航 ==========
  goToToolManager: function () {
    wx.navigateTo({ url: '/pages/toolManager/toolManager' });
  },

  goToSettings: function () {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  // ========== 数据管理 ==========
  backupData: function () {
    var self = this;
    wx.showLoading({ title: '备份中...' });
    var db = wx.cloud.database();
    var collections = ['submissions', 'reviews', 'conferences', 'archives', 'tools'];
    var backup = { timestamp: new Date(), version: '1.0.0', data: {} };

    var promises = collections.map(function (col) {
      return db.collection(col).get().then(function (res) {
        backup.data[col] = res.data || [];
      }).catch(function () {
        backup.data[col] = [];
      });
    });

    Promise.all(promises).then(function () {
      var fs = wx.getFileSystemManager();
      var filePath = wx.env.USER_DATA_PATH + '/backup_' + Date.now() + '.json';

      fs.writeFile({
        filePath: filePath,
        data: JSON.stringify(backup),
        success: function () {
          wx.hideLoading();
          wx.showModal({
            title: '备份成功',
            content: '数据已备份到本地，可随时还原',
            showCancel: false
          });
        },
        fail: function () {
          wx.hideLoading();
          wx.showToast({ title: '备份失败', icon: 'error' });
        }
      });
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: '备份失败', icon: 'error' });
    });
  },

  restoreData: function () {
    var self = this;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: function (res) {
        var filePath = res.tempFiles[0].path;
        var fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: filePath,
          encoding: 'utf-8',
          success: function (data) {
            try {
              var backup = JSON.parse(data.data);
              self.processRestore(backup);
            } catch (e) {
              wx.showToast({ title: '文件格式错误', icon: 'error' });
            }
          },
          fail: function () {
            wx.showToast({ title: '读取失败', icon: 'error' });
          }
        });
      }
    });
  },

  processRestore: function (backup) {
    var self = this;
    wx.showLoading({ title: '还原中...' });
    var db = wx.cloud.database();
    var collections = ['submissions', 'reviews', 'conferences', 'archives'];
    var chain = Promise.resolve();

    collections.forEach(function (col) {
      chain = chain.then(function () {
        return db.collection(col).get().then(function (existing) {
          var deleteChain = Promise.resolve();
          existing.data.forEach(function (item) {
            deleteChain = deleteChain.then(function () {
              return db.collection(col).doc(item._id).remove();
            });
          });
          return deleteChain;
        }).then(function () {
          var items = backup.data[col] || [];
          var addChain = Promise.resolve();
          items.forEach(function (item) {
            addChain = addChain.then(function () {
              return db.collection(col).add({ data: item });
            });
          });
          return addChain;
        });
      });
    });

    chain.then(function () {
      wx.hideLoading();
      wx.showToast({ title: '还原成功', icon: 'success' });
      self.loadStats();
    }).catch(function (e) {
      wx.hideLoading();
      wx.showToast({ title: '还原失败', icon: 'error' });
      console.error('[个人中心] 还原失败', e);
    });
  },

  // ========== 反馈与关于 ==========
  sendFeedback: function () {
    wx.showModal({
      title: '意见反馈',
      content: '如有问题或建议，请发送邮件至 support@example.com',
      showCancel: false
    });
  },

  showAbout: function () {
    wx.showModal({
      title: '关于学术工具',
      content: '版本：v1.0.0\n\n学术工具是一款面向科研人员、审稿人、学术编辑的工具集，帮助您高效管理学术工作流。',
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
