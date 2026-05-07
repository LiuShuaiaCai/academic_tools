// pages/credits/credits.js
var creditsUtil = require('../../utils/credits.js');

Page({
  data: {
    credits: 0,
    signedToday: false,
    continuousDays: 0,
    signinDays: 0,
    signinLoading: false,
    showRules: false,
    records: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    page: 1,
    pageSize: 20
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
    }).catch(function(e) {
      console.error('[积分] 初始化失败', e);
      that.loadCreditsInfo();
      that.loadRecords();
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
          signinDays: res.signinDays || 0
        });
      }
    }).catch(function(e) {
      console.error('[积分] 获取积分信息失败', e);
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
        // 刷新流水
        that.loadRecords();
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

  toggleRules: function() {
    this.setData({ showRules: !this.data.showRules });
  },

  goToRecord: function() {
    // 滚动到积分明细区域（已在当前页面）
    wx.pageScrollTo({ selector: '.records-section', duration: 300 });
  }
});