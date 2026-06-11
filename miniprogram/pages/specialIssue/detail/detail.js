// pages/specialIssue/detail/detail.js
// V5: 详情页 - 展示方案详情、来源文章、客编图表、重新生成、查看历史
var i18nUtil = require('../../../utils/i18n.js');
var creditsUtil = require('../../../utils/credits.js');

Page({
  data: {
    _lang: 'zh',
    locale: {},
    t: null,

    taskId: '',
    keyword: '',
    displayLang: 'zh',

    // 任务数据
    result: null,
    sourcePapers: [],
    sourceAuthors: [],
    regenerateCount: 0,
    regenerateHistory: [],
    creditsDeducted: false,
    completedAt: null,
    createdAt: null,

    // 状态
    loading: true,
    hasResult: false,
    error: '',
    progressText: '',

    // 图表
    editorChartData: {},
    canvas2d: true
  },

  onLoad: function(options) {
    var ctx = i18nUtil.createI18n(this);
    this._i18n = ctx;

    var taskId = options.taskId || '';
    var keyword = options.keyword || '';
    this.setData({ taskId: taskId, keyword: keyword });

    // 检测 canvas2d 支持
    var sysInfo = wx.getSystemInfoSync();
    var SDKVersion = sysInfo.SDKVersion;
    if (SDKVersion) {
      var vers = SDKVersion.split('.').map(function(v) { return parseInt(v); });
      if (vers[0] < 2 || (vers[0] === 2 && vers[1] < 9)) {
        this.setData({ canvas2d: false });
      }
    }

    this.loadTaskDetail();
  },

  onShow: function() {
    if (this._i18n) this._i18n.refresh();
    // 如果正在轮询中，重新加载
    if (this._pollTimer) {
      this.loadTaskDetail();
    }
  },

  onUnload: function() {
    this.stopPolling();
  },

  i18n: function(key, lang) {
    return i18nUtil.translate(key, lang || this.data.displayLang);
  },

  // ---- 加载任务详情 ----

  loadTaskDetail: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'poll', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      if (!data) {
        that.setData({ loading: false, error: '任务不存在' });
        return;
      }

      that.setData({
        keyword: that.data.keyword || data.constraints ? '' : '', // keep if already set
        createdAt: data.createdAt,
        completedAt: data.completedAt,
        creditsDeducted: data.creditsDeducted,
        regenerateCount: data.regenerateCount || 0,
        regenerateHistory: data.regenerateHistory || []
      });

      if (data.status === 'completed' && data.result) {
        that.setData({
          loading: false,
          hasResult: true,
          result: data.result,
          sourcePapers: data.sourcePapers || [],
          sourceAuthors: data.sourceAuthors || [],
          error: ''
        });
        that.buildEditorCharts();
      } else if (data.status === 'processing') {
        that.setData({
          loading: true,
          progressText: '任务进行中，请稍候...'
        });
        that.startPolling();
      } else {
        that.setData({
          loading: false,
          error: data.error || '任务生成失败'
        });
      }
    }).catch(function(err) {
      that.setData({
        loading: false,
        error: '加载失败: ' + (err.message || '网络错误')
      });
    });
  },

  // ---- 轮询 ----

  startPolling: function() {
    var that = this;
    that.stopPolling();
    that._pollTimer = setInterval(function() {
      that.loadTaskDetail();
    }, 3000);
  },

  stopPolling: function() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // ---- 语言切换 ----

  toggleContentLang: function() {
    var newLang = this.data.displayLang === 'zh' ? 'en' : 'zh';
    this.setData({ displayLang: newLang });
  },

  // ---- 数据读取 ----

  getPlan: function() {
    var result = this.data.result;
    if (!result || !result.plan) return null;
    return result.plan;
  },

  getPlanContent: function(path) {
    var plan = this.getPlan();
    if (!plan) return '';
    var lang = this.data.displayLang;
    var langData = plan[lang] || plan.en || plan.zh;
    if (!langData) return '';
    var keys = path.split('.');
    var value = langData;
    for (var i = 0; i < keys.length; i++) {
      if (value && typeof value === 'object') {
        value = value[keys[i]];
      } else {
        return '';
      }
    }
    return value || '';
  },

  getPlanTitle: function() { return this.getPlanContent('title'); },
  getPlanAbstract: function() { return this.getPlanContent('abstract'); },
  getPlanKeywords: function() { return this.getPlanContent('keywords') || []; },

  getGuestEditors: function() {
    var plan = this.getPlan();
    return (plan && plan.guestEditors) ? plan.guestEditors : [];
  },

  getTopicHeat: function() {
    var plan = this.getPlan();
    return (plan && plan.topicHeat) || 0;
  },

  // 获取 LLM 引用的来源文章（根据 sourceArticleIds 筛选）
  getSourceArticles: function() {
    var plan = this.getPlan();
    var sourcePapers = this.data.sourcePapers;
    if (!plan || !plan.sourceArticleIds || sourcePapers.length === 0) {
      return sourcePapers;
    }
    var idSet = {};
    for (var i = 0; i < plan.sourceArticleIds.length; i++) {
      idSet[plan.sourceArticleIds[i]] = true;
    }
    return sourcePapers.filter(function(p) { return idSet[p.id]; });
  },

  // 获取 LLM 推荐的客编者详细信息（匹配 sourceEditorIds）
  getEnrichedEditors: function() {
    var plan = this.getPlan();
    var sourceAuthors = this.data.sourceAuthors;
    var guestEditors = this.getGuestEditors();
    if (guestEditors.length === 0) return [];

    var authorMap = {};
    for (var i = 0; i < sourceAuthors.length; i++) {
      authorMap[sourceAuthors[i].n] = sourceAuthors[i];
      authorMap[sourceAuthors[i].id] = sourceAuthors[i];
    }

    // 也按 sourceEditorIds 匹配
    if (plan && plan.sourceEditorIds) {
      return plan.sourceEditorIds.map(function(id, idx) {
        var author = authorMap[id];
        var editor = guestEditors[idx] || guestEditors[0];
        if (author) {
          return {
            name: author.n || editor.name,
            institution: author.inst || editor.institution,
            hIndex: author.h || 0,
            worksCount: author.wc || 0,
            citedByCount: author.cc || 0,
            worksByYear: author.worksByYear || { years: [], counts: [] },
            citationsByYear: author.citationsByYear || { years: [], counts: [] },
            top: author.top || []
          };
        }
        return {
          name: editor.name,
          institution: editor.institution,
          hIndex: 0, worksCount: 0, citedByCount: 0,
          worksByYear: { years: [], counts: [] },
          citationsByYear: { years: [], counts: [] },
          top: []
        };
      }).filter(function(e) { return e.name; });
    }

    // fallback: 按 name 匹配
    return guestEditors.map(function(editor) {
      var author = authorMap[editor.name];
      if (author) {
        return {
          name: author.n || editor.name,
          institution: author.inst || editor.institution,
          hIndex: author.h || 0,
          worksCount: author.wc || 0,
          citedByCount: author.cc || 0,
          worksByYear: author.worksByYear || { years: [], counts: [] },
          citationsByYear: author.citationsByYear || { years: [], counts: [] },
          top: author.top || []
        };
      }
      return {
        name: editor.name,
        institution: editor.institution,
        hIndex: 0, worksCount: 0, citedByCount: 0,
        worksByYear: { years: [], counts: [] },
        citationsByYear: { years: [], counts: [] },
        top: []
      };
    });
  },

  // ---- 客编图表 ----

  buildEditorCharts: function() {
    var editors = this.getEnrichedEditors();
    var charts = {};
    for (var i = 0; i < editors.length; i++) {
      var ed = editors[i];
      var wby = ed.worksByYear || { years: [], counts: [] };
      var ccy = ed.citationsByYear || { years: [], counts: [] };
      if (wby.years.length > 0) {
        charts['ed_works_' + i] = this.buildColumnChart(wby.years, wby.counts, '逐年发文', '#10B981');
      }
      if (ccy.years.length > 0) {
        charts['ed_cites_' + i] = this.buildColumnChart(ccy.years, ccy.counts, '逐年被引', '#F59E0B');
      }
    }
    this.setData({ editorChartData: charts });
  },

  buildColumnChart: function(years, counts, title, color) {
    if (!years || years.length === 0 || !counts || counts.length === 0) return null;
    return {
      categories: years.map(function(y) { return String(y); }),
      series: [{ name: title, data: counts }],
      opts: {
        color: [color],
        xAxis: { disableGrid: true },
        yAxis: { disabled: false, data: [{ title: '' }] },
        extra: {
          column: {
            type: 'group',
            width: Math.max(15, Math.floor(300 / years.length)),
            activeBgColor: '#000000',
            activeBgOpacity: 0.08
          }
        }
      }
    };
  },

  // ---- 重新生成 ----

  onRegenerate: function() {
    var that = this;
    wx.showModal({
      title: '重新生成',
      content: '将消耗 30 积分重新生成策划方案，确认？',
      confirmText: '确认',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '重新生成中...' });
          wx.cloud.callFunction({
            name: 'specialIssueAgent',
            data: { action: 'regenerate', taskId: that.data.taskId }
          }).then(function(res) {
            wx.hideLoading();
            if (res.result.success) {
              that.setData({ loading: true, progressText: '正在重新生成方案...' });
              that.startPolling();
            } else {
              wx.showToast({ title: res.result.error || '重新生成失败', icon: 'none' });
            }
          }).catch(function(err) {
            wx.hideLoading();
            wx.showToast({ title: '请求失败: ' + (err.message || ''), icon: 'none' });
          });
        }
      }
    });
  },

  // ---- 查看历史方案 ----

  onViewHistory: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'poll', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      var history = data && data.regenerateHistory || [];
      if (history.length === 0) {
        wx.showToast({ title: '暂无历史记录', icon: 'none' });
        return;
      }
      var items = history.map(function(h, i) {
        var title = (h.result && h.result.plan ? (h.result.plan.zh && h.result.plan.zh.title) || (h.result.plan.en && h.result.plan.en.title) : '') || ('方案 ' + (i + 1));
        return '第' + (i + 1) + '次: ' + title;
      });
      wx.showActionSheet({
        itemList: items,
        success: function(actionRes) {
          var selected = history[actionRes.tapIndex];
          that.setData({
            result: selected.result,
            hasResult: true
          });
          that.buildEditorCharts();
        }
      });
    });
  },

  // ---- 文章标题点击 ----

  onTapArticle: function(e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.setClipboardData({
        data: url,
        success: function() {
          wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' });
        }
      });
    }
  },

  // ---- 补扣积分 ----

  onRetryDeduct: function() {
    var that = this;
    creditsUtil.spendCredits('special_issue', 30, '特刊策划补扣', that.data.taskId).then(function(res) {
      if (res.success) {
        that.setData({ creditsDeducted: true });
        wx.showToast({ title: '扣费成功', icon: 'success' });
      } else if (res.insufficient) {
        // 已在 showInsufficientDialog 中处理
      } else {
        wx.showToast({ title: '扣费失败，请稍后重试', icon: 'none' });
      }
    });
  },

  // ---- 复制方案 ----

  copyFullPlan: function() {
    var plan = this.getPlan();
    if (!plan) return;
    var lang = this.data.displayLang;
    var d = plan[lang] || plan.en || plan.zh || {};
    var editors = plan.guestEditors || [];

    var lines = ['=== ' + (d.title || '') + ' ===', '', d.abstract || '', '',
      this.i18n('specialIssue.topicHeat') + ': ' + (plan.topicHeat || 0), '',
      this.i18n('specialIssue.keywords') + ': ' + (d.keywords || []).join(', '), '',
      '--- ' + this.i18n('specialIssue.guestEditors') + ' ---'
    ];

    for (var i = 0; i < editors.length; i++) {
      lines.push((i + 1) + '. ' + editors[i].name + ' - ' + editors[i].institution);
    }

    wx.setClipboardData({
      data: lines.join('\n'),
      success: function() { wx.showToast({ title: '方案已复制', icon: 'success' }); }
    });
  },

  // ---- 格式化 ----

  formatNumber: function(num) {
    if (!num && num !== 0) return '0';
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  formatTime: function(ts) {
    if (!ts) return '--';
    var d = new Date(ts);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
});
