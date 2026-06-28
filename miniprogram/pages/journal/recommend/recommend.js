// pages/journal/recommend/recommend.js
// 智能选荐页

Page({
  data: {
    // 筛选条件
    subject: '',
    is_oa: null,       // true/false/null
    is_medline: null,  // true/false/null
    is_pmc_journal: null, // true/false/null
    min_works: '',
    min_cited: '',

    // 推荐结果
    recommendList: [],
    loading: false,
    hasSearched: false,

    // 热门学科（快捷选择）
    hotSubjects: [
      'Medicine', 'Computer Science', 'Engineering', 'Chemistry',
      'Physics', 'Biology', 'Materials Science', 'Mathematics',
      'Environmental Science', 'Psychology', 'Economics', 'Business'
    ]
  },

  onLoad: function() {},

  /**
   * 输入学科
   */
  onSubjectInput: function(e) {
    this.setData({ subject: e.detail.value });
  },

  /**
   * 选择热门学科
   */
  selectSubject: function(e) {
    const subject = e.currentTarget.dataset.subject;
    this.setData({ subject });
  },

  /**
   * 切换OA筛选
   */
  toggleOA: function() {
    const current = this.data.is_oa;
    this.setData({
      is_oa: current === null ? true : (current === true ? false : null)
    });
  },

  /**
   * 切换MEDLINE筛选
   */
  toggleMEDLINE: function() {
    const current = this.data.is_medline;
    this.setData({
      is_medline: current === null ? true : null
    });
  },

  /**
   * 切换PMC期刊筛选
   */
  togglePMCJournal: function() {
    const current = this.data.is_pmc_journal;
    this.setData({
      is_pmc_journal: current === null ? true : null
    });
  },

  /**
   * 输入最低发文量
   */
  onMinWorksInput: function(e) {
    this.setData({ min_works: e.detail.value });
  },

  /**
   * 输入最低被引量
   */
  onMinCitedInput: function(e) {
    this.setData({ min_cited: e.detail.value });
  },

  /**
   * 获取推荐
   */
  getRecommend: function() {
    if (!this.data.subject && this.data.is_oa === null && !this.data.min_works && !this.data.min_cited
        && this.data.is_medline === null && this.data.is_pmc_journal === null) {
      wx.showToast({ title: '请至少选择一个筛选条件', icon: 'none' });
      return;
    }

    this.setData({ loading: true, hasSearched: true });

    const filters = {};
    if (this.data.subject) filters.subject = this.data.subject;
    if (this.data.is_oa !== null) filters.is_oa = this.data.is_oa;
    if (this.data.is_medline !== null) filters.is_medline = this.data.is_medline;
    if (this.data.is_pmc_journal !== null) filters.is_pmc_journal = this.data.is_pmc_journal;
    if (this.data.min_works) filters.min_works = parseInt(this.data.min_works);
    if (this.data.min_cited) filters.min_cited = parseInt(this.data.min_cited);

    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'recommendJournals',
        filters: filters
      }
    }).then(res => {
      const result = res.result;
      if (result.code === 0) {
        this.setData({
          recommendList: result.data.journals || [],
          loading: false
        });
      } else {
        wx.showToast({ title: result.message || '推荐失败', icon: 'none' });
        this.setData({ loading: false });
      }
    }).catch(err => {
      console.error('[getRecommend] Error:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  /**
   * 重置筛选
   */
  resetFilters: function() {
    this.setData({
      subject: '',
      is_oa: null,
      is_medline: null,
      is_pmc_journal: null,
      min_works: '',
      min_cited: '',
      recommendList: [],
      hasSearched: false
    });
  },

  /**
   * 查看详情
   */
  goToDetail: function(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/journal/detail/detail?journalId=${id}`
    });
  }
});
