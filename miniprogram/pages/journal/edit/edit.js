// pages/journal/edit/edit.js
// 期刊指标数据录入页

Page({
  data: {
    keyword: '',
    searchResults: [],
    selectedJournal: null,
    form: {
      impact_factor: '',
      if_year: '',
      jcr_quartile: '',
      jcr_year: '',
      cas_quartile: '',
      cas_year: '',
      cas_edition: '',
      acceptance_rate: '',
      review_cycle: '',
      self_citation_rate: '',
      metrics_source: 'admin',
      metrics_verified: true
    }
  },

  /**
   * 输入搜索关键词
   */
  onKeywordInput: function(e) {
    this.setData({
      keyword: e.detail.value
    });
  },

  /**
   * 搜索期刊
   */
  onSearch: function() {
    const { keyword } = this.data;
    if (!keyword) {
      wx.showToast({ title: '请输入期刊名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '搜索中...' });

    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'searchJournals',
        keyword: keyword,
        page: 1,
        pageSize: 20,
        filters: {}
      }
    }).then(res => {
      wx.hideLoading();
      const result = res.result;
      if (result.code === 0) {
        this.setData({
          searchResults: result.data.journals || []
        });
      } else {
        wx.showToast({ title: result.message || '搜索失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('[searchJournals] Error:', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  /**
   * 选择期刊
   */
  selectJournal: function(e) {
    const { id, title } = e.currentTarget.dataset;
    this.setData({
      selectedJournal: { _id: id, title: title },
      searchResults: []
    });

    // 加载该期刊已有数据
    this.loadJournalData(id);
  },

  /**
   * 加载期刊已有数据
   */
  loadJournalData: function(journalId) {
    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'getJournalDetail',
        journalId: journalId
      }
    }).then(res => {
      const result = res.result;
      if (result.code === 0 && result.data.journal) {
        const journal = result.data.journal;
        this.setData({
          'form.impact_factor': journal.impact_factor || '',
          'form.if_year': journal.if_year || '',
          'form.jcr_quartile': journal.jcr_quartile || '',
          'form.jcr_year': journal.jcr_year || '',
          'form.cas_quartile': journal.cas_quartile || '',
          'form.cas_year': journal.cas_year || '',
          'form.cas_edition': journal.cas_edition || '',
          'form.acceptance_rate': journal.acceptance_rate || '',
          'form.review_cycle': journal.review_cycle || '',
          'form.self_citation_rate': journal.self_citation_rate || '',
          'form.metrics_source': journal.metrics_source || 'admin',
          'form.metrics_verified': journal.metrics_verified || false
        });
      }
    }).catch(err => {
      console.error('[loadJournalData] Error:', err);
    });
  },

  /**
   * 表单输入
   */
  onFieldInput: function(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },

  /**
   * 设置分区
   */
  setQuartile: function(e) {
    const { type, value } = e.currentTarget.dataset;
    if (type === 'jcr') {
      this.setData({
        'form.jcr_quartile': value
      });
    } else if (type === 'cas') {
      this.setData({
        'form.cas_partition': value
      });
    }
  },

  /**
   * 设置版本
   */
  setEdition: function(e) {
    const { value } = e.currentTarget.dataset;
    this.setData({
      'form.cas_edition': value
    });
  },

  /**
   * 设置数据来源
   */
  setSource: function(e) {
    const { value } = e.currentTarget.dataset;
    this.setData({
      'form.metrics_source': value
    });
  },

  /**
   * 切换验证状态
   */
  toggleVerified: function() {
    this.setData({
      'form.metrics_verified': !this.data.form.metrics_verified
    });
  },

  /**
   * 提交表单
   */
  submitForm: function() {
    const { selectedJournal, form } = this.data;
    if (!selectedJournal) {
      wx.showToast({ title: '请先选择期刊', icon: 'none' });
      return;
    }

    // 构造更新数据
    const updates = {};
    if (form.impact_factor) updates.impact_factor = parseFloat(form.impact_factor);
    if (form.if_year) updates.if_year = parseInt(form.if_year);
    if (form.jcr_quartile) updates.jcr_quartile = form.jcr_quartile;
    if (form.jcr_year) updates.jcr_year = parseInt(form.jcr_year);
    if (form.cas_quartile) updates.cas_quartile = form.cas_quartile;
    if (form.cas_year) updates.cas_year = parseInt(form.cas_year);
    if (form.cas_edition) updates.cas_edition = form.cas_edition;
    if (form.acceptance_rate) updates.acceptance_rate = parseFloat(form.acceptance_rate);
    if (form.review_cycle) updates.review_cycle = form.review_cycle;
    if (form.self_citation_rate) updates.self_citation_rate = parseFloat(form.self_citation_rate);
    updates.metrics_source = form.metrics_source;
    updates.metrics_verified = form.metrics_verified;
    updates.metrics_last_verified_at = form.metrics_verified ? new Date() : null;
    updates.updated_at = new Date();

    wx.showLoading({ title: '提交中...' });

    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'updateJournal',
        journalId: selectedJournal._id,
        updates: updates
      }
    }).then(res => {
      wx.hideLoading();
      const result = res.result;
      if (result.code === 0) {
        wx.showToast({ title: '提交成功', icon: 'success' });
        this.resetForm();
      } else {
        wx.showToast({ title: result.message || '提交失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('[submitForm] Error:', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  /**
   * 重置表单
   */
  resetForm: function() {
    this.setData({
      selectedJournal: null,
      form: {
        impact_factor: '',
        if_year: '',
        jcr_quartile: '',
        jcr_year: '',
        cas_partition: '',
        cas_year: '',
        cas_edition: '',
        acceptance_rate: '',
        review_cycle: '',
        self_citation_rate: '',
        metrics_source: 'admin',
        metrics_verified: true
      }
    });
  }
});
