// pages/journal/warnings/warnings.js
// 预警期刊页 - 增强版

Page({
  data: {
    warningList: [],
    loading: true,
    
    // 筛选
    filterLevel: null,  // 'high' / 'medium' / 'low' / null
    filterStatus: null,  // 'active' / 'resolved' / null
    
    // 统计数据
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    totalCount: 0
  },

  onLoad: function() {
    this.loadWarnings();
  },

  onPullDownRefresh: function() {
    this.loadWarnings();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载预警期刊列表
   */
  loadWarnings: function() {
    this.setData({ loading: true });

    const filters = {};
    if (this.data.filterLevel) filters.warning_level = this.data.filterLevel;
    if (this.data.filterStatus) filters.status = this.data.filterStatus;

    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'getWarningJournals',
        filters: filters
      }
    }).then(res => {
      const result = res.result;
      if (result.code === 0) {
        const warnings = result.data.warnings || [];
        this.setData({
          warningList: warnings,
          totalCount: warnings.length,
          highCount: warnings.filter(w => w.warning_level === 'high').length,
          mediumCount: warnings.filter(w => w.warning_level === 'medium').length,
          lowCount: warnings.filter(w => w.warning_level === 'low').length,
          loading: false
        });
        
        // 无筛选时加载全部统计
        if (!this.data.filterLevel && !this.data.filterStatus) {
          this.loadAllStats();
        }
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    }).catch(err => {
      console.error('[loadWarnings] Error:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  /**
   * 加载全量统计（不受筛选影响）
   */
  loadAllStats: function() {
    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'getWarningJournals',
        filters: {}
      }
    }).then(res => {
      const result = res.result;
      if (result.code === 0) {
        const warnings = result.data.warnings || [];
        this.setData({
          highCount: warnings.filter(w => w.warning_level === 'high').length,
          mediumCount: warnings.filter(w => w.warning_level === 'medium').length,
          lowCount: warnings.filter(w => w.warning_level === 'low').length,
          totalCount: warnings.length
        });
      }
    }).catch(() => {});
  },

  /**
   * 筛选预警级别
   */
  filterByLevel: function(e) {
    const level = e.currentTarget.dataset.level;
    this.setData({
      filterLevel: this.data.filterLevel === level ? null : level
    });
    this.loadWarnings();
  },

  /**
   * 筛选状态
   */
  filterByStatus: function(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      filterStatus: this.data.filterStatus === status ? null : status
    });
    this.loadWarnings();
  },

  /**
   * 查看期刊详情
   */
  goToDetail: function(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/journal/detail/detail?journalId=${id}`
    });
  }
});
