// pages/specialIssue/detail/detail.js
// V5: 详情页 - 展示方案详情、来源文章、客编图表、重新生成、查看历史
var creditsUtil = require('../../../utils/credits.js');
var theme = require('../../../utils/theme.js');

Page({
  data: {
    taskId: '',
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
    planTopicHeat: 0,
    planSourceArticleIds: [],
    planSourceEditorIds: [],

    // 方向选择面板
    plans: [],
    showDirectionPanel: false,
    expandedDirection: '',
    selectingDirection: false,
    compareHeights: [],

    // scheme detail 展示数据
    sourcePapers: [],
    sourceAuthors: [],

    // 方向详情弹窗
    showDetailModal: false,
    detailModalPlan: null,

    // 方案进度弹窗
    showProgressModal: false,
    selectedSchemeSteps: [],
    selectedSchemeProgress: '',

    // 状态
    loading: true,
    hasResult: false,
    error: '',
    progressText: '',

    // 图表
    editorChartData: {},
    canvas2d: true,

    // 引用统计弹窗
    showCiteModal: false,
    citeModalTitle: '',
    citeModalData: { years: [], counts: [], heights: [] },

    // 主题色（由 loadToolTheme 从 DB 加载）
    theme: {}
  },

  onLoad: function(options) {
    this.loadToolTheme();
    var taskId = options.taskId || '';
    var schemeId = options.schemeId || '';
    var directionKey = options.directionKey || '';
    this.setData({ taskId: taskId, schemeId: schemeId, directionKey: directionKey });

    // 检测 canvas2d 支持
    var sysInfo = wx.getSystemInfoSync();
    var SDKVersion = sysInfo.SDKVersion;
    if (SDKVersion) {
      var vers = SDKVersion.split('.').map(function(v) { return parseInt(v); });
      if (vers[0] < 2 || (vers[0] === 2 && vers[1] < 9)) {
        this.setData({ canvas2d: false });
      }
    }

    if (schemeId) {
      this.loadSchemeDetail();
    } else {
      this.loadTrendDetail();
    }
  },

  loadToolTheme: function() {
    var that = this;
    theme.loadToolTheme('specialIssue').then(function(t) {
      that.setData({ theme: t });
    });
  },

  onShow: function() {
    // 如果正在轮询中，页面回来时刷新
    if (this._pollTimer) {
      if (this.data.schemeId) {
        this.loadSchemeDetail();
      } else {
        this.loadTrendDetail();
      }
    }
  },

  onUnload: function() {
    this.stopPolling();
  },

  // ---- 加载趋势分析详情（新的 getTrendDetail 接口） ----
  loadTrendDetail: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getTrendDetail', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      console.log('[detail] getTrendDetail返回:', JSON.stringify(data));
      if (!data) {
        that.setData({ loading: false, error: '任务不存在' });
        return;
      }

      var plans = data.directions || [];
      var schemesByDir = data.schemesByDir || {};

      // 方向卡片预处理
      for (var p = 0; p < plans.length; p++) {
        plans[p]._topicLabel = 'Topic' + (p + 1);
        plans[p]._paperCount = plans[p].paperCount || 0;
        plans[p]._avgCitationsStr = (plans[p].avgCitations || 0).toFixed(1);
        plans[p]._avgFWCIStr = (plans[p].avgFWCI || 0).toFixed(2);
        plans[p]._hotRecentAvgStr = (plans[p].hotRecentAvg || 0).toFixed(1);
        plans[p]._topJournalRatioStr = ((plans[p].topJournalRatio || 0) * 100).toFixed(0) + '%';
        // 从 direction 的 sourcePapers 字段获取依据论文
        plans[p]._matchedPapers = plans[p].sourcePapers || [];
        var h = plans[p].topicHeat || 0;
        if (h >= 800) plans[p]._heatColor = 'linear-gradient(135deg, #DC2626, #EF4444)';
        else if (h >= 600) plans[p]._heatColor = 'linear-gradient(135deg, #EA580C, #F97316)';
        else if (h >= 400) plans[p]._heatColor = 'linear-gradient(135deg, #CA8A04, #EAB308)';
        else plans[p]._heatColor = 'linear-gradient(135deg, #2563EB, #3B82F6)';
        // 该方向下的方案列表
        plans[p]._schemes = schemesByDir[plans[p].key] || [];
        // 按钮状态
        var dirSchemes = schemesByDir[plans[p].key] || [];
        var hasGenerating = false;
        var hasCompleted = false;
        var hasFailed = false;
        var latestSchemeId = '';
        for (var s = 0; s < dirSchemes.length; s++) {
          if (dirSchemes[s].status === 'generating') { hasGenerating = true; latestSchemeId = dirSchemes[s].schemeId; }
          if (dirSchemes[s].status === 'completed') { hasCompleted = true; }
          if (dirSchemes[s].status === 'failed') { hasFailed = true; latestSchemeId = dirSchemes[s].schemeId; }
        }
        if (hasGenerating) {
          plans[p]._schemeStatus = 'generating';
          plans[p]._schemeId = latestSchemeId;
          plans[p]._progressPercent = plans[p]._progressPercent || 0;
        } else if (hasCompleted) {
          plans[p]._schemeStatus = 'completed';
          plans[p]._schemeId = (dirSchemes.find(function(s) { return s.status === 'completed'; }) || {}).schemeId || '';
        } else if (hasFailed) {
          plans[p]._schemeStatus = 'failed';
          plans[p]._schemeId = latestSchemeId;
        } else {
          plans[p]._schemeStatus = 'idle';
        }
      }
      plans.sort(function(a, b) { return (b.topicHeat || 0) - (a.topicHeat || 0); });

      var maxHeat = 1;
      for (var p = 0; p < plans.length; p++) maxHeat = Math.max(maxHeat, plans[p].topicHeat || 0);
      var compareHeights = plans.map(function(p) { return Math.max(Math.round((p.topicHeat || 0) / maxHeat * 100), 4); });

      that.setData({
        loading: false,
        showDirectionPanel: true,
        keyword: data.keyword || '',
        plans: plans,
        compareHeights: compareHeights,
        schemeCount: data.schemeCount || 0,
        generatingSchemeId: data.generatingSchemeId || '',
        error: ''
      });
      wx.setNavigationBarTitle({ title: '趋势领域分析' });

      // 如果有正在生成的方案，启动轮询
      if (data.generatingSchemeId) {
        that._pollingSchemeId = data.generatingSchemeId;
        that.startSchemePolling();
      }
    }).catch(function(err) {
      console.error('[detail] 加载趋势失败:', err);
      that.setData({ loading: false, error: that.getDisplayError(err.message || '网络错误') });
    });
  },

  // ---- 加载方案详情（getSchemeDetail 接口） ----
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

      that.setData({
        loading: false,
        hasResult: true,
        showDirectionPanel: false,
        result: data.plan || {},   // 兼容 getPlan() 等工具函数
        planTitle: langData.title || '',
        planAbstract: langData.abstract || '',
        planKeywords: langData.keywords || [],
        planGuestEditors: plan.guestEditors || [],
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
      if (data.status === 'generating') {
        // 更新对应方向卡片的进度
        var steps = data.steps || [];
        var done = steps.filter(function(s) { return s.status === 'completed' || s.status === 'failed'; }).length;
        var pct = steps.length > 0 ? Math.round(done / steps.length * 100) : 0;
        var plans = that.data.plans;
        for (var i = 0; i < plans.length; i++) {
          if (plans[i]._schemeId === schemeId || plans[i]._schemeStatus === 'generating') {
            plans[i]._progressPercent = pct;
            plans[i]._schemeSteps = steps;
          }
        }
        that.setData({ plans: plans });
      }
      if (data.status === 'completed') {
        that.stopPolling();
        that._pollingSchemeId = null;
        // 重新加载趋势详情或方案详情
        if (that.data.schemeId) {
          that.loadSchemeDetail();
        } else {
          that.loadTrendDetail();
        }
      } else if (data.status === 'failed') {
        that.stopPolling();
        that._pollingSchemeId = null;
        that.loadTrendDetail();
      }
    }).catch(function() {});
  },

  // ---- 生成方案（startScheme） ----
  onGenerateScheme: function(e) {
    var that = this;
    var directionKey = e.currentTarget.dataset.key;
    if (!directionKey) return;

    // 防抖：正在生成中不允许重复点击
    if (that.data.selectingDirection) return;
    that.setData({ selectingDirection: true });
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'startScheme', taskId: that.data.taskId, directionKey: directionKey }
    }).then(function(res) {
      var result = res.result || {};
      if (result.success && result.schemeId) {
        wx.showToast({ title: '方案生成已启动', icon: 'none' });
        that._pollingSchemeId = result.schemeId;
        that.startSchemePolling();
        // 立即刷新方向状态
        that.loadTrendDetail();
      } else {
        wx.showToast({ title: result.error || '启动失败', icon: 'none' });
        that.setData({ selectingDirection: false });
      }
    }).catch(function() {
      that.setData({ selectingDirection: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // ---- 查看已完成方案 ----
  onViewScheme: function(e) {
    var schemeId = e.currentTarget.dataset.schemeId;
    if (!schemeId) {
      // 从 key 反查 _schemeId
      var key = e.currentTarget.dataset.key;
      var plan = this.data.plans.find(function(p) { return p.key === key; });
      schemeId = (plan && plan._schemeId) || '';
    }
    if (!schemeId) return;
    wx.navigateTo({ url: '../detail/detail?schemeId=' + schemeId });
  },

  // ---- 查看生成中方案进度（弹窗） ----
  onViewSchemeProgress: function(e) {
    var that = this;
    var key = e.currentTarget.dataset.key;
    var schemeId = e.currentTarget.dataset.schemeId;
    var plan = that.data.plans.find(function(p) { return p.key === key; }) || {};

    // 先用已有的步骤显示
    if (plan._schemeSteps && plan._schemeSteps.length > 0) {
      that.setData({
        showProgressModal: true,
        selectedSchemeSteps: plan._schemeSteps,
        selectedSchemeProgress: (plan._progressPercent || 0) + '%'
      });
      return;
    }

    // 没有缓存步骤则实时查询
    if (!schemeId) return;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getSchemeStatus', schemeId: schemeId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      if (!data) return;
      var steps = data.steps || [];
      that.setData({
        showProgressModal: true,
        selectedSchemeSteps: steps,
        selectedSchemeProgress: data.progress || ''
      });
    }).catch(function() {
      wx.showToast({ title: '查询进度失败', icon: 'none' });
    });
  },

  onHideProgress: function() {
    this.setData({ showProgressModal: false });
  },

  getStepStatusIcon: function(status) {
    if (status === 'completed') return '✅';
    if (status === 'running') return '⏳';
    if (status === 'failed') return '❌';
    return '⏸️';
  },

  // ---- 重试失败方案 ----
  onRetryScheme: function(e) {
    var that = this;
    var key = e.currentTarget.dataset.key;
    var schemeId = e.currentTarget.dataset.schemeId;
    if (!key) return;

    wx.showModal({
      title: '重试方案',
      content: '将重新为此方向生成方案，是否继续？',
      confirmText: '确认重试',
      success: function(res) {
        if (!res.confirm) return;
        that.onGenerateScheme({ currentTarget: { dataset: { key: key, schemeId: schemeId } } });
      }
    });
  },

  // ---- 加载任务详情（轮询用，仅处理 processing 状态，其余走 loadTrendDetail） ----

  loadTaskDetail: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'poll', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      console.log('[detail] poll返回:', JSON.stringify(data));
      if (!data) {
        that.setData({ loading: false, error: '任务不存在' });
        return;
      }

      if (data.status === 'processing') {
        that.setData({
          loading: true,
          hasResult: false,
          showDirectionPanel: false,
          progressText: '任务进行中，请稍候...'
        });
        that.startPolling();
      } else {
        // 非 processing 状态：转到 loadTrendDetail 读取完整数据
        that.stopPolling();
        that.loadTrendDetail();
      }
    }).catch(function(err) {
      console.error('[detail] 加载失败:', err);
      that.setData({
        loading: false,
        error: that.getDisplayError(err.message || '网络错误')
      });
    });
  },

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
    // 兼容旧格式 { plan: {...} } 和新格式直接为 plan 对象
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

  // ---- 点击被引数：显示年度引用柱状图 ----

  onTapCitations: function(e) {
    var idx = e.currentTarget.dataset.index;
    var paper = this.data.sourcePapers[idx];
    if (!paper || !paper.citationsByYear) return;
    var years = paper.citationsByYear.years || [];
    var counts = paper.citationsByYear.counts || [];
    if (years.length === 0) {
      wx.showToast({ title: '暂无年度引用数据', icon: 'none' });
      return;
    }
    var maxCount = Math.max.apply(null, counts) || 1;
    var heights = counts.map(function(c) { return Math.max((c / maxCount) * 80, 4); });
    this.setData({
      showCiteModal: true,
      citeModalTitle: (paper.title || '文章') + ' 的引用趋势',
      citeModalData: { years: years, counts: counts, heights: heights }
    });
  },

  hideCiteModal: function() {
    this.setData({ showCiteModal: false });
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

    // fallback: 按 name 匹配
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
            console.log('[onRegenerate] 云函数返回:', JSON.stringify(res));
            console.log('[onRegenerate] res.result:', JSON.stringify(res.result));
            if (res.result.success) {
              console.log('[onRegenerate] 成功，开始轮询');
              that.setData({ loading: true, progressText: '正在重新生成方案...' });
              that.startPolling();
            } else {
              console.log('[onRegenerate] 失败, error:', res.result.error, 'balance:', res.result.balance);
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
        var firstDir = (h.directions && h.directions[0]) || {};
        var title = (firstDir.zh && firstDir.zh.title) || (firstDir.en && firstDir.en.title) || ('方向 ' + (i + 1));
        return '第' + (i + 1) + '次: ' + title;
      });
      wx.showActionSheet({
        itemList: items,
        success: function(actionRes) {
          var selected = history[actionRes.tapIndex];
          // 展示历史方向数据
          var dirs = selected.directions || [];
          that.setData({
            plans: dirs,
            showDirectionPanel: true,
            hasResult: false
          });
          wx.setNavigationBarTitle({ title: '历史方向' });
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

  // ---- 方向选择面板 ----

  onExpandDirection: function(e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ expandedDirection: key });
  },

  onCollapseDirection: function() {
    this.setData({ expandedDirection: '' });
  },

  // 弹窗显示方向详情
  onOpenDetail: function(e) {
    var key = e.currentTarget.dataset.key;
    var plan = this.data.plans.find(function(p) { return p.key === key; });
    if (plan) {
      this.setData({ showDetailModal: true, detailModalPlan: plan });
    }
  },

  hideDetailModal: function() {
    this.setData({ showDetailModal: false, detailModalPlan: null });
  },

  // 弹窗内直接选择方向 → 使用新 onGenerateScheme
  onSelectFromModal: function(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    this.hideDetailModal();
    this.onGenerateScheme({ currentTarget: { dataset: { key: key } } });
  },

  stopBubble: function() {},

  onSelectDirection: function(e) {
    var that = this;
    var key = e.currentTarget.dataset.key;
    var plan = that.data.plans.find(function(p) { return p.key === key; });
    if (!plan) return;

    var zhTitle = (plan.zh && plan.zh.title) || '';
    wx.showModal({
      title: '确认选择',
      content: '选择方向「' + zhTitle + '」生成详细方案？',
      confirmText: '确认',
      success: function(res) {
        if (res.confirm) {
          that.doSelectDirection(key);
        }
      }
    });
  },

  doSelectDirection: function(key) {
    var that = this;
    that.setData({ selectingDirection: true });
    wx.showLoading({ title: '启动方案生成...' });

    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'startScheme', taskId: that.data.taskId, directionKey: key }
    }).then(function(res) {
      wx.hideLoading();
      var result = res.result || {};
      if (result.success && result.schemeId) {
        // Phase 2 已启动
        wx.showToast({ title: '方案生成已启动', icon: 'none' });
        that._pollingSchemeId = result.schemeId;
        that.startSchemePolling();
        that.loadTrendDetail();
      } else {
        that.setData({ selectingDirection: false });
        wx.showToast({ title: result.error || '启动失败', icon: 'none' });
      }
    }).catch(function(err) {
      wx.hideLoading();
      that.setData({ selectingDirection: false });
      wx.showToast({ title: '请求失败: ' + (err.message || ''), icon: 'none' });
    });
  },

  // 获取方向热度条宽度
  getHeatBarWidth: function(heat) {
    return Math.min(heat / 10, 100);
  },

  formatTime: function(ts) {
    if (!ts) return '--';
    var d = new Date(ts);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
});
