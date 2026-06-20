// pages/reviews/stats/stats.js
var revConfig = require('../../../utils/reviews-config.js');

Page({
  data: {
    loaded: false,

    // 筛选
    yearIdx: 0,
    monthIdx: 0,
    journalIdx: 0,
    yearOptions: ['全部'],
    monthOptions: ['全部'],
    journalOptions: ['全部期刊'],

    // KPI
    total: 0,
    completed: 0,
    incomplete: 0,
    avgDays: 0,
    suggestedAccept: 0,
    suggestedReject: 0,

    // 趋势图
    trendChartData: {},
    // 状态分布图
    statusChartData: {},

    // 期刊统计
    journalStats: [],

    // 图表配置
    lineOpts: {
      animation: true,
      xAxis: { disableGrid: true, labelCount: 6 },
      yAxis: { disabled: false, disableGrid: false, min: 0 },
      extra: { line: { type: 'straight', width: 2 } },
      legend: { show: false },
      color: ['#3B82F6', '#10B981']
    },
    ringOpts: {
      animation: true,
      dataLabel: false,
      legend: { show: false },
      enableTooltip: true,
      subtitle: {
        name: '审稿统计',
        fontSize: 12,
        color: '#6B7280'
      },
      extra: {
        ring: {
          ringWidth: 30,
          activeOpacity: 0.5,
          activeRadius: 6,
          offsetAngle: 0,
          labelWidth: 15
        }
      }
    }
  },

  onLoad: function() {
    this.loadStats();
  },

  onShow: function() {
    this.loadStats();
  },

  /** 加载统计数据 */
  loadStats: function() {
    var that = this;
    var data = { action: 'reviewStatsDetail' };

    // 附加筛选参数
    var year = that.data.yearOptions[that.data.yearIdx];
    var month = that.data.monthOptions[that.data.monthIdx];
    var journal = that.data.journalOptions[that.data.journalIdx];
    if (year && year !== '全部') data.year = year;
    if (month && month !== '全部') data.month = month;
    if (journal && journal !== '全部期刊') data.journal = journal;

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: data
    }).then(function(res) {
      var r = res.result || {};
      if (!r.success) {
        that.setData({ loaded: true });
        return;
      }

      // ---- KPI ----
      that.setData({
        total: r.total || 0,
        completed: r.completed || 0,
        incomplete: r.incomplete || 0,
        avgDays: r.avgDays || 0,
        suggestedAccept: r.suggestedAccept || 0,
        suggestedReject: r.suggestedReject || 0
      });

      // ---- 更新筛选器选项（首次加载）----
      var years = r.years || [];
      var journals = r.journals || [];
      var yearOpts = ['全部'].concat(years);
      var journalOpts = ['全部期刊'].concat(journals);

      // 更新月份选项（所有月份）
      var monthOpts = ['全部'];
      var mnames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
      if (data.year && data.year !== '全部') {
        for (var mi = 1; mi <= 12; mi++) {
          monthOpts.push(data.year + '-' + String(mi).padStart(2, '0'));
        }
      } else {
        monthOpts = monthOpts.concat(mnames);
      }

      that.setData({
        yearOptions: yearOpts,
        monthOptions: monthOpts,
        journalOptions: journalOpts,
        // 保持可用索引范围
        yearIdx: Math.min(that.data.yearIdx, yearOpts.length - 1),
        monthIdx: Math.min(that.data.monthIdx, monthOpts.length - 1),
        journalIdx: Math.min(that.data.journalIdx, journalOpts.length - 1)
      });

      // ---- 趋势折线图 ----
      var trendData = r.trendData || [];
      var trendChartData = {};
      if (trendData.length > 0) {
        trendChartData = {
          categories: trendData.map(function(d) { return d.month; }),
          series: [
            { name: '邀请数', data: trendData.map(function(d) { return d.invited; }) },
            { name: '完成数', data: trendData.map(function(d) { return d.completed; }) }
          ]
        };
      }

      // ---- 状态环形图 ----
      var statusMap = r.statusBreakdown || {};
      var stDef = revConfig.STATUS_DEF;
      var ringSeries = [];
      Object.keys(statusMap).forEach(function(k) {
        var sd = stDef[k] || { label: k, color: '#9CA3AF' };
        ringSeries.push({ name: sd.label, data: statusMap[k], color: sd.color });
      });
      var statusChartData = {};
      if (ringSeries.length > 0) {
        statusChartData = { series: ringSeries };
      }

      // ---- 期刊统计 ----
      var journalStats = (r.journalStats || []).map(function(js, idx) {
        return {
          journal: js.journal,
          year: js.year,
          invited: js.invited,
          completed: js.completed,
          pending: js.pending,
          isFirstOfGroup: idx === 0 || (idx > 0 && (r.journalStats[idx-1].journal !== js.journal || r.journalStats[idx-1].year !== js.year))
        };
      });

      that.setData({
        loaded: true,
        trendChartData: trendChartData,
        statusChartData: statusChartData,
        journalStats: journalStats
      });
    }).catch(function(e) {
      console.error('[审稿统计] 加载失败', e);
      that.setData({ loaded: true });
    });
  },

  // ---- 筛选器事件 ----
  onYearChange: function(e) {
    var idx = parseInt(e.detail.value);
    var year = this.data.yearOptions[idx];
    // 切换年份后更新月份列表
    var monthOpts = ['全部'];
    var mnames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    if (year && year !== '全部') {
      for (var mi = 1; mi <= 12; mi++) {
        monthOpts.push(year + '-' + String(mi).padStart(2, '0'));
      }
    } else {
      monthOpts = monthOpts.concat(mnames);
    }
    this.setData({ yearIdx: idx, monthIdx: 0, monthOptions: monthOpts, loaded: false });
    this.loadStats();
  },

  onMonthChange: function(e) {
    this.setData({ monthIdx: parseInt(e.detail.value), loaded: false });
    this.loadStats();
  },

  onJournalChange: function(e) {
    this.setData({ journalIdx: parseInt(e.detail.value), loaded: false });
    this.loadStats();
  },

  resetFilters: function() {
    var yearOpts = this.data.yearOptions;
    var mnames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    var monthOpts = ['全部'].concat(mnames);
    this.setData({
      yearIdx: 0, monthIdx: 0, journalIdx: 0,
      monthOptions: monthOpts,
      loaded: false
    });
    this.loadStats();
  },

  goToList: function() {
    wx.navigateTo({ url: '/pages/reviews/reviews' });
  }
});
