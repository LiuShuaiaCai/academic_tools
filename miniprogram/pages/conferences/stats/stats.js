// pages/conferences/stats/stats.js
var confConfig = require('../../../utils/conferences-config.js');

Page({
  data: {
    loaded: false,
    total: 0,
    active: 0,
    urgent: 0,
    completed: 0,
    past: 0,
    typeList: [],
    rankList: [],
    statusList: []
  },

  onLoad: function() {
    this.loadStats();
  },

  onShow: function() {
    this.loadStats();
  },

  loadStats: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'conferenceStatsDetail' }
    }).then(function(res) {
      var r = res.result || {};
      if (!r.success && r.total === undefined) {
        that.setData({ loaded: true });
        return;
      }

      // 会议类型分布
      var typeMap = r.typeBreakdown || {};
      var typeLabels = { offline: '线下', online: '线上', hybrid: '混合' };
      var typeColors = { offline: '#3B82F6', online: '#10B981', hybrid: '#8B5CF6' };
      var typeList = [];
      Object.keys(typeMap).forEach(function(k) {
        typeList.push({
          name: k, label: typeLabels[k] || k,
          count: typeMap[k], color: typeColors[k] || '#9CA3AF',
          pct: r.total > 0 ? Math.round(typeMap[k] / r.total * 100) : 0
        });
      });

      // 会议等级分布
      var rankMap = r.rankBreakdown || {};
      var rankColors = { 'CCF-A': '#EF4444', 'CCF-B': '#F59E0B', 'CCF-C': '#3B82F6', 'SCI': '#8B5CF6', 'EI': '#10B981' };
      var rankList = [];
      Object.keys(rankMap).forEach(function(k) {
        rankList.push({
          name: k, label: k,
          count: rankMap[k], color: rankColors[k] || '#9CA3AF',
          pct: r.total > 0 ? Math.round(rankMap[k] / r.total * 100) : 0
        });
      });

      // 参会状态分布
      var statusMap = r.statusBreakdown || {};
      var stDef = confConfig.STATUS_DEF;
      var statusKeys = ['submitted', 'accepted', 'registered', 'expired'];
      var statusList = [];
      for (var i = 0; i < statusKeys.length; i++) {
        var key = statusKeys[i];
        var count = statusMap[key] || 0;
        var def = stDef[key] || { color: '#9CA3AF', bg: '#F3F4F6' };
        statusList.push({
          name: key, label: def.label,
          count: count, color: def.color, bg: def.bg,
          pct: r.total > 0 ? Math.round(count / r.total * 100) : 0
        });
      }

      that.setData({
        loaded: true,
        total: r.total || 0,
        active: r.active || 0,
        urgent: r.urgent || 0,
        completed: r.completed || 0,
        past: r.past || 0,
        typeList: typeList,
        rankList: rankList,
        statusList: statusList
      });
    }).catch(function(e) {
      console.error('[会议统计] 加载失败', e);
      that.setData({ loaded: true });
    });
  },

  goToList: function() {
    wx.navigateTo({ url: '/pages/conferences/conferences' });
  }
});
