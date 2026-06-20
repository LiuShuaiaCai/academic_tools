// pages/specialIssue/detail/detail.js
// 方案详情页：展示方案详情、来源文章、客编图表、重新生成、查看历史
var creditsUtil = require('../../../utils/credits.js');
var theme = require('../../../utils/theme.js');

Page({
  data: {
    taskId: '',
    schemeId: '',
    directionKey: '',
    keyword: '',
    displayLang: 'zh',

    // 任务数据
    regenerateCount: 0,
    regenerateHistory: [],
    creditsDeducted: false,
    completedAt: null,
    createdAt: null,

    // 预处理后的展示数据（避免WXML中调用方法）
    planTitle: '',
    planAbstract: '',
    planKeywords: [],
    planGuestEditors: [],
    enrichedEditors: [],
    planTopicHeat: 0,
    planSourceArticleIds: [],
    planSourceEditorIds: [],

    // scheme detail 展示数据
    sourcePapers: [],
    displayPapers: [],
    sourceAuthors: [],

    // 状态
    loading: true,
    hasResult: false,
    error: '',
    progressText: '',

    // 图表
    editorChartData: {},
    canvas2d: true,

    // 引用统计弹窗（ucharts 柱状图）
    showCiteModal: false,
    citeModalTitle: '',
    citeYearChartData: {},
    citeUseCanvas2d: false,

    // 工作经历弹窗
    showWorkHistoryModal: false,
    workHistoryTitle: '',
    workHistoryList: [],

    // 单指标按年统计弹窗
    showMetricYearModal: false,
    metricYearModalTitle: '',
    metricYearChartData: {},

    // 主题色
    theme: {}
  },

  onLoad: function(options) {
    this.loadToolTheme();
    var schemeId = options.schemeId || '';
    this.setData({
      taskId: options.taskId || '',
      schemeId: schemeId,
      keyword: options.keyword || ''
    });

    // 检测 canvas2d 支持
    var appBaseInfo = wx.getAppBaseInfo();
    var SDKVersion = appBaseInfo.SDKVersion;
    if (SDKVersion) {
      var vers = SDKVersion.split('.').map(function(v) { return parseInt(v); });
      if (vers[0] < 2 || (vers[0] === 2 && vers[1] < 9)) {
        this.setData({ canvas2d: false });
      }
    }
    // 引用柱状图 canvas2d 检测（真机用 canvas2d）
    var deviceInfo = wx.getDeviceInfo();
    var platform = deviceInfo.platform;
    this.setData({ citeUseCanvas2d: platform === 'ios' || platform === 'android' });

    this.loadSchemeDetail();
  },

  loadToolTheme: function() {
    var that = this;
    theme.loadToolTheme('specialIssue').then(function(t) {
      that.setData({ theme: t });
    });
  },

  onShow: function() {
    if (this._pollTimer) {
      this.loadSchemeDetail();
    }
  },

  onUnload: function() {
    this.stopPolling();
  },

  // ---- 加载方案详情 ----
  loadSchemeDetail: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getSchemeDetail', schemeId: that.data.schemeId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      console.log('[detail] getSchemeDetail返回:', JSON.stringify(data));
      if (!data) {
        that.setData({ loading: false, error: '方案不存在' });
        return;
      }

      if (data.status === 'generating') {
        that._pollingSchemeId = data.schemeId;
        that.startSchemePolling();
        that.setData({ loading: true, progressText: '方案生成中...' });
        return;
      }

      if (data.status === 'failed') {
        that.setData({ loading: false, error: data.error || '生成失败' });
        return;
      }

      var plan = data.plan || {};
      var zh = plan.zh || {};
      var en = plan.en || {};
      var langData = zh.title ? zh : (en.title ? en : {});

      // 筛选关联文章
      var allPapers = data.sourcePapers || [];
      var articleIds = plan.sourceArticleIds || [];
      var idSet = {};
      for (var i = 0; i < articleIds.length; i++) idSet[articleIds[i]] = true;
      var displayPapers = articleIds.length > 0
        ? allPapers.filter(function(p) { return idSet[p.id]; })
        : allPapers;

      // 用 sourceAuthors 数据补全客编信息（h指数、作品数、被引、研究领域）
      var enrichedEditors = that.enrichEditors(plan.guestEditors || [], data.sourceAuthors || []);
      that.setData({
        loading: false,
        hasResult: true,
        result: data.plan || {},
        directionKey: data.directionKey || '',
        planTitle: langData.title || '',
        planAbstract: langData.abstract || '',
        planKeywords: langData.keywords || [],
        planGuestEditors: plan.guestEditors || [],
        enrichedEditors: enrichedEditors,
        planTopicHeat: plan.topicHeat || 0,
        planSourceArticleIds: plan.sourceArticleIds || [],
        planSourceEditorIds: plan.sourceEditorIds || [],
        sourcePapers: allPapers,
        displayPapers: displayPapers,
        sourceAuthors: data.sourceAuthors || [],
        keyword: data.keyword || '',
        error: ''
      });
      wx.setNavigationBarTitle({ title: '方案详情' });
      that.buildEditorCharts();
    }).catch(function(err) {
      console.error('[detail] 加载方案失败:', err);
      that.setData({ loading: false, error: that.getDisplayError(err.message || '网络错误') });
    });
  },

  // ---- 轮询方案进度 ----
  startSchemePolling: function() {
    var that = this;
    that.stopPolling();
    that._pollTimer = setInterval(function() {
      that.pollSchemeStatus();
    }, 3000);
  },

  pollSchemeStatus: function() {
    var that = this;
    var schemeId = that._pollingSchemeId;
    if (!schemeId) return;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getSchemeStatus', schemeId: schemeId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      if (!data) return;
      if (data.status === 'completed') {
        that.stopPolling();
        that._pollingSchemeId = null;
        that.loadSchemeDetail();
      } else if (data.status === 'failed') {
        that.stopPolling();
        that._pollingSchemeId = null;
        that.setData({ loading: false, error: data.error || '生成失败' });
      }
    }).catch(function() {});
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
    var plan = this.getPlan();
    var langData = (plan && plan[newLang]) || {};
    this.setData({
      displayLang: newLang,
      planTitle: langData.title || '',
      planAbstract: langData.abstract || '',
      planKeywords: langData.keywords || []
    });
  },

  // ---- 数据读取 ----
  getPlan: function() {
    var result = this.data.result;
    if (!result) return null;
    return result.plan || result;
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

  // ---- 点击被引数：显示年度引用柱状图（qiun-wx-ucharts）----
  onTapCitations: function(e) {
    var idx = e.currentTarget.dataset.index;
    var paper = this.data.displayPapers[idx];
    if (!paper || !paper.citationsByYear) return;
    var years = paper.citationsByYear.years || [];
    var counts = paper.citationsByYear.counts || [];
    if (years.length === 0) {
      wx.showToast({ title: '暂无年度引用数据', icon: 'none' });
      return;
    }
    var yearChartData = {
      categories: years.map(function(y) { return String(y); }),
      series: [{ name: '被引次数', data: counts }]
    };
    this.setData({
      showCiteModal: true,
      citeModalTitle: (paper.title || '文章') + ' 的引用趋势',
      citeYearChartData: yearChartData
    });
  },

  hideCiteModal: function() {
    this.setData({ showCiteModal: false, citeYearChartData: {} });
  },

  // ---- 按年统计工具函数（限制近5年） ----
  takeLastNYears: function(cby, n) {
    n = n || 5;
    if (!cby || cby.length === 0) return [];
    if (cby.length <= n) return cby;
    return cby.slice(-n);
  },

  // ---- 点击"查看工作经历"按钮 ----
  onTapWorkHistory: function(e) {
    var idx = e.currentTarget.dataset.index;
    var editor = this.data.enrichedEditors[idx];
    if (!editor) return;
    var affiliations = editor.affiliations || [];
    if (affiliations.length === 0) {
      wx.showToast({ title: '暂无机构履历', icon: 'none' });
      return;
    }
    var that = this;
    var timeline = affiliations.map(function(aff) {
      var sortedYears = (aff.years || []).slice().sort();
      var firstYear = sortedYears[0];
      var lastYear = sortedYears[sortedYears.length - 1];
      var period = firstYear
        ? (firstYear === lastYear ? String(firstYear) : firstYear + ' - ' + lastYear)
        : '—';
      return {
        displayName: aff.displayName || '未知机构',
        period: period,
        countryCode: aff.countryCode || '',
        countryName: that.getCountryName(aff.countryCode || ''),
        firstYear: firstYear || 9999
      };
    });
    timeline.sort(function(a, b) { return b.firstYear - a.firstYear; });
    this.setData({
      showWorkHistoryModal: true,
      workHistoryTitle: (editor.name || '学者') + ' 的工作经历',
      workHistoryList: timeline
    });
  },

  hideWorkHistoryModal: function() {
    this.setData({ showWorkHistoryModal: false, workHistoryList: [] });
  },

  getCountryName: function(code) {
    var map = {
      'US': '美国', 'CN': '中国', 'GB': '英国', 'DE': '德国', 'FR': '法国',
      'JP': '日本', 'KR': '韩国', 'CA': '加拿大', 'AU': '澳大利亚', 'IT': '意大利',
      'ES': '西班牙', 'NL': '荷兰', 'CH': '瑞士', 'SE': '瑞典', 'SG': '新加坡',
      'IN': '印度', 'BR': '巴西', 'RU': '俄罗斯', 'TW': '中国台湾', 'HK': '中国香港'
    };
    return map[code] || code || '';
  },



  // ---- 点击单个指标 ----
  onTapMetric: function(e) {
    var idx = e.currentTarget.dataset.index;
    var metric = e.currentTarget.dataset.metric;
    var editor = this.data.enrichedEditors[idx];
    if (!editor) return;
    var cby = this.takeLastNYears(editor.countsByYear || []);
    if (cby.length === 0) {
      wx.showToast({ title: '暂无年度统计数据', icon: 'none' });
      return;
    }
    var years = cby.map(function(y) { return String(y.year); });
    var chartData;
    var titleSuffix;
    if (metric === 'works') {
      var works = cby.map(function(y) { return y.works_count || 0; });
      chartData = {
        categories: years,
        series: [{ name: '发文数', data: works }]
      };
      titleSuffix = '发文量趋势（近5年）';
    } else if (metric === 'cited') {
      var cites = cby.map(function(y) { return y.cited_by_count || 0; });
      chartData = {
        categories: years,
        series: [{ name: '被引次数', data: cites }]
      };
      titleSuffix = '被引趋势（近5年）';
    } else {
      wx.showToast({ title: '该指标为汇总统计', icon: 'none' });
      return;
    }
    this.setData({
      showMetricYearModal: true,
      metricYearModalTitle: (editor.name || '学者') + ' - ' + titleSuffix,
      metricYearChartData: chartData
    });
  },

  hideMetricYearModal: function() {
    this.setData({
      showMetricYearModal: false,
      metricYearChartData: {}
    });
  },


  onTapDoi: function(e) {
    var doi = e.currentTarget.dataset.doi;
    if (!doi) return;
    var url = 'https://doi.org/' + doi.replace(/^https?:\/\/doi\.org\//, '');
    wx.setClipboardData({
      data: url,
      success: function() {
        wx.showToast({ title: 'DOI链接已复制', icon: 'none' });
      }
    });
  },

  getTopicHeat: function() {
    var plan = this.getPlan();
    return (plan && plan.topicHeat) || 0;
  },

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

  enrichEditors: function(guestEditors, sourceAuthors) {
    if (!guestEditors || guestEditors.length === 0) return [];
    var authorMap = {};
    for (var i = 0; i < sourceAuthors.length; i++) {
      authorMap[sourceAuthors[i].n] = sourceAuthors[i];
      authorMap[sourceAuthors[i].id] = sourceAuthors[i];
    }
    return guestEditors.map(function(editor) {
      var author = authorMap[editor.name] || authorMap[editor.id];
      return {
        name: editor.name || '',
        institution: editor.institution || '',
        hIndex: author ? author.h : (editor.hIndex || 0),
        i10Index: author ? author.i10 : (editor.i10Index || 0),
        worksCount: author ? author.wc : (editor.worksCount || 0),
        citedByCount: author ? author.cc : (editor.citedByCount || 0),
        top: author ? (author.top || []) : (editor.topics || []),
        countsByYear: author ? author.countsByYear : (editor.countsByYear || []),
        affiliations: author ? author.affiliations : (editor.affiliations || [])
      };
    });
  },

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

    if (plan && plan.sourceEditorIds) {
      return plan.sourceEditorIds.map(function(id, idx) {
        var author = authorMap[id];
        var editor = guestEditors[idx] || guestEditors[0];
        if (author) {
          return {
            name: author.n || editor.name,
            institution: author.inst || editor.institution,
            hIndex: author.h || editor.hIndex || 0,
            worksCount: author.wc || editor.worksCount || 0,
            citedByCount: author.cc || editor.citedByCount || 0,
            countsByYear: author.countsByYear || editor.countsByYear || [],
            affiliations: author.affiliations || editor.affiliations || [],
            top: author.top || editor.topics || []
          };
        }
        return {
          name: editor.name,
          institution: editor.institution,
          hIndex: editor.hIndex || 0,
          worksCount: editor.worksCount || 0,
          citedByCount: editor.citedByCount || 0,
          countsByYear: editor.countsByYear || [],
          affiliations: editor.affiliations || [],
          top: editor.topics || []
        };
      }).filter(function(e) { return e.name; });
    }

    return guestEditors.map(function(editor) {
      var author = authorMap[editor.name];
      if (author) {
        return {
          name: author.n || editor.name,
          institution: author.inst || editor.institution,
          hIndex: author.h || editor.hIndex || 0,
          worksCount: author.wc || editor.worksCount || 0,
          citedByCount: author.cc || editor.citedByCount || 0,
          countsByYear: author.countsByYear || editor.countsByYear || [],
          affiliations: author.affiliations || editor.affiliations || [],
          top: author.top || editor.topics || []
        };
      }
      return {
        name: editor.name,
        institution: editor.institution,
        hIndex: editor.hIndex || 0,
        worksCount: editor.worksCount || 0,
        citedByCount: editor.citedByCount || 0,
        countsByYear: editor.countsByYear || [],
        affiliations: editor.affiliations || [],
        top: editor.topics || []
      };
    });
  },

  // ---- 客编图表 ----
  buildEditorCharts: function() {
    var editors = this.getEnrichedEditors();
    var charts = {};
    for (var i = 0; i < editors.length; i++) {
      var ed = editors[i];
      var cby = ed.countsByYear || [];
      if (cby.length > 0) {
        var years = cby.map(function(y) { return y.year; });
        var works = cby.map(function(y) { return y.works_count || 0; });
        var cites = cby.map(function(y) { return y.cited_by_count || 0; });
        charts['ed_works_' + i] = this.buildColumnChart(years, works, '逐年发文', '#10B981');
        charts['ed_cites_' + i] = this.buildColumnChart(years, cites, '逐年被引', '#F59E0B');
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

  // ---- 重新生成方案（删除旧方案 → 启动新 Phase 2） ----
  onRegenerate: function() {
    var that = this;
    var schemeId = that.data.schemeId;
    var directionKey = that.data.directionKey;
    if (!schemeId || !directionKey) {
      wx.showToast({ title: '缺少方案信息', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '重新生成方案',
      content: '将删除当前方案并消耗 15 积分重新生成，确认？',
      confirmText: '确认',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除旧方案...' });
          wx.cloud.callFunction({
            name: 'specialIssueAgent',
            data: {
              action: 'regenerateScheme',
              taskId: that.data.taskId,
              schemeId: schemeId,
              directionKey: directionKey
            }
          }).then(function(res) {
            wx.hideLoading();
            if (res.result.success && res.result.schemeId) {
              that._pollingSchemeId = res.result.schemeId;
              // 清空旧方案数据，避免残留
              that.setData({
                schemeId: res.result.schemeId,
                loading: true,
                hasResult: false,
                progressText: '方案重新生成中...',
                result: {},
                planTitle: '',
                planAbstract: '',
                planKeywords: [],
                planGuestEditors: [],
                enrichedEditors: [],
                planTopicHeat: 0,
                planSourceArticleIds: [],
                planSourceEditorIds: [],
                sourcePapers: [],
                displayPapers: [],
                sourceAuthors: [],
                error: ''
              });
              that.startSchemePolling();
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

  // ---- 查看历史方案：跳转趋势页查看完整历史方向 ----
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
        var firstDir = (h.directions && h.directions[0]) || {};
        var title = (firstDir.zh && firstDir.zh.title) || (firstDir.en && firstDir.en.title) || ('方向 ' + (i + 1));
        return '第' + (i + 1) + '次: ' + title;
      });
      wx.showActionSheet({
        itemList: items.concat(['查看全部历史方向']),
        success: function() {
          // 跳转到趋势页查看历史方向
          wx.navigateTo({
            url: '../trend/trend?taskId=' + encodeURIComponent(that.data.taskId || '') + '&keyword=' + encodeURIComponent(that.data.keyword || '')
          });
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
      } else if (!res.insufficient) {
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
      '话题热度: ' + (plan.topicHeat || 0), '',
      '关键词: ' + (d.keywords || []).join(', '), '',
      '--- 推荐客编 ---'
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
  },

  stopBubble: function() {},

  getDisplayError: function(error) {
    var msg = error || '';
    if (!msg) return '执行失败，请稍后重试';
    if (msg.indexOf('429') >= 0 || msg.indexOf('rate_limit') >= 0 || msg.indexOf('TPD') >= 0) {
      return 'AI 服务今日额度已用完，请稍后重试';
    }
    if (msg.indexOf('超时') >= 0 || msg.indexOf('timeout') >= 0 || msg.indexOf('ETIMEDOUT') >= 0) {
      return 'AI 服务响应超时，请稍后重试';
    }
    if (msg.indexOf('Kimi API') >= 0 || msg.indexOf('openai API') >= 0 || msg.indexOf('deepseek API') >= 0 || msg.indexOf('tencent API') >= 0 || msg.indexOf('alibaba API') >= 0 || msg.indexOf('organization') >= 0 || msg.indexOf('project') >= 0) {
      return 'AI 服务暂时不可用，请稍后重试';
    }
    return '执行失败，请稍后重试';
  }
});
