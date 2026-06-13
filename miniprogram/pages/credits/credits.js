// pages/credits/credits.js
var creditsUtil = require('../../utils/credits.js');

Page({
  data: {
    credits: 0,
    signedToday: false,
    continuousDays: 0,
    signinDays: 0,
    signinLoading: false,
    records: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    page: 1,
    pageSize: 20,
    // 统计相关
    statsLoading: true,
    monthEarn: 0,
    monthSpend: 0,
    monthNet: 0,
    trendData: [],
    maxTrendValue: 10,
    // 规则弹窗
    showRules: false,
    // 页面初始加载状态（防止默认值闪烁）
    pageLoading: true
  },

  onLoad: function() {
    this.initAndLoad();
  },

  onShow: function() {
    // 从其他页面返回时刷新数据
    if (this.data.records.length > 0 || !this.data.loading) {
      this.loadCreditsInfo();
    }
  },

  initAndLoad: function() {
    var that = this;
    // 先初始化积分（新用户赠送100）
    creditsUtil.initCredits().then(function(initRes) {
      if (initRes && initRes.initialized) {
        console.log('[积分] 新用户赠送100积分');
      }
      that.loadCreditsInfo();
      that.loadRecords();
      that.loadStats();
      // 检查积分有效期
      that.checkExpire();
    }).catch(function(e) {
      console.error('[积分] 初始化失败', e);
      that.loadCreditsInfo();
      that.loadRecords();
      that.loadStats();
    });
  },

  loadCreditsInfo: function() {
    var that = this;
    creditsUtil.getCreditsInfo().then(function(res) {
      if (res.success !== false) {
        that.setData({
          credits: res.credits || 0,
          signedToday: res.signedToday || false,
          continuousDays: res.continuousDays || 0,
          signinDays: res.signinDays || 0,
          pageLoading: false
        });
      } else {
        that.setData({ pageLoading: false });
      }
    }).catch(function(e) {
      console.error('[积分] 获取积分信息失败', e);
      that.setData({ pageLoading: false });
    });
  },

  loadRecords: function() {
    var that = this;
    that.setData({ loading: true });

    creditsUtil.getCreditsList(1, that.data.pageSize).then(function(res) {
      if (res.success !== false) {
        that.setData({
          records: res.list || [],
          hasMore: res.hasMore || false,
          page: 1,
          loading: false
        });
      } else {
        that.setData({ loading: false });
      }
    }).catch(function(e) {
      console.error('[积分] 获取记录失败', e);
      that.setData({ loading: false });
    });
  },

  loadMore: function() {
    var that = this;
    if (that.data.loadingMore || !that.data.hasMore) return;

    that.setData({ loadingMore: true });
    var nextPage = that.data.page + 1;

    creditsUtil.getCreditsList(nextPage, that.data.pageSize).then(function(res) {
      if (res.success !== false) {
        var newRecords = res.list || [];
        that.setData({
          records: that.data.records.concat(newRecords),
          hasMore: res.hasMore || false,
          page: nextPage,
          loadingMore: false
        });
      } else {
        that.setData({ loadingMore: false });
      }
    }).catch(function(e) {
      console.error('[积分] 加载更多失败', e);
      that.setData({ loadingMore: false });
    });
  },

  doSignin: function() {
    var that = this;
    if (that.data.signinLoading || that.data.signedToday) return;

    that.setData({ signinLoading: true });
    creditsUtil.doSignin().then(function(res) {
      if (res.success) {
        var msg = '签到成功 +' + res.earnedPoints + '积分';
        if (res.bonusPoints > 0) {
          msg += '（含连续签到奖励 +' + res.bonusPoints + '）';
        }
        wx.showToast({ title: msg, icon: 'none' });
        that.setData({
          credits: res.credits,
          signedToday: true,
          continuousDays: res.continuousDays,
          signinDays: res.signinDays
        });
        // 刷新流水和统计
        that.loadRecords();
        that.loadStats();
      } else if (res.alreadySigned) {
        wx.showToast({ title: '今日已签到', icon: 'none' });
      }
      that.setData({ signinLoading: false });
    }).catch(function(e) {
      console.error('[积分] 签到失败', e);
      wx.showToast({ title: '签到失败', icon: 'error' });
      that.setData({ signinLoading: false });
    });
  },

  // 显示积分规则弹窗
  showRulesModal: function() {
    this.setData({ showRules: true });
  },

  // 隐藏积分规则弹窗
  hideRulesModal: function() {
    this.setData({ showRules: false });
  },

  // 阻止事件冒泡
  stopBubble: function() {},

  loadStats: function() {
    var that = this;
    that.setData({ statsLoading: true });
    creditsUtil.getCreditsStats().then(function(res) {
      if (res.success) {
        var trendData = res.trendData || [];
        // 计算趋势图最大值
        var maxValue = 10;
        for (var i = 0; i < trendData.length; i++) {
          var item = trendData[i];
          var itemMax = Math.max(item.earn || 0, item.spend || 0);
          if (itemMax > maxValue) maxValue = itemMax;
        }
        that.setData({
          monthEarn: res.monthEarn || 0,
          monthSpend: res.monthSpend || 0,
          monthNet: res.monthNet || 0,
          trendData: trendData,
          maxTrendValue: maxValue,
          statsLoading: false
        });
      } else {
        that.setData({ statsLoading: false });
      }
    }).catch(function(e) {
      console.error('[积分] 获取统计失败', e);
      that.setData({ statsLoading: false });
    });
  },

  // 检查并清理过期积分（每次进入页面时检查）
  checkExpire: function() {
    var that = this;
    creditsUtil.cleanExpiredCredits().then(function(res) {
      if (res.success && res.cleaned > 0) {
        wx.showModal({
          title: '📢 积分过期通知',
          content: '您好，您有 ' + res.expiredAmount + ' 积分已到期清除。\n\n💡 温馨提示：注册赠送的100积分永久有效，继续签到获取更多积分吧！',
          showCancel: false,
          confirmText: '我知道了'
        });
        // 刷新余额显示
        that.loadCreditsInfo();
        that.loadRecords();
      }
    }).catch(function(e) {
      console.error('[积分] 检查积分过期失败', e);
    });
  },

  goToRecord: function() {
    // 滚动到积分明细区域（已在当前页面）
    wx.pageScrollTo({ selector: '.records-section', duration: 300 });
  }
});