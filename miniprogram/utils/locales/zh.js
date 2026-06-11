/**
 * 中文语言包
 */
module.exports = {
  // 通用
  common: {
    loading: '加载中...',
    loadMore: '加载更多',
    noData: '暂无数据',
    retry: '重试',
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    back: '返回',
    search: '搜索',
    clear: '清除'
  },

  // 导航
  nav: {
    home: '首页',
    toolbox: '工具箱',
    calendar: '日历',
    profile: '我的',
    academicTools: '学术工具',
    specialIssue: '特刊策划'
  },

  // 特刊策划页面
  specialIssue: {
    title: '特刊话题策划',
    subtitle: '基于 OpenAlex 学术数据，智能策划特刊方案',
    inputPlaceholder: '输入研究关键词，如 "Large Language Models"',
    searchBtn: '开始策划',
    searching: '分析中...',
    progressSearching: '正在搜索论文和学者数据...',
    progressFetchingAuthors: '正在获取学者详细数据...',
    progressGenerating: 'AI 正在分析生成方案...',
    progressHint: '预计需要 1-2 分钟，请耐心等待',
    languageToggle: '中 / EN',

    // 话题信息
    topicTitle: '话题标题',
    topicHeat: '热度值',
    perspective: '方案视角',
    topicSummary: '话题摘要',
    keywords: '关键词',
    rationale: '创建原因',
    citationTrend: '引用趋势',
    citationChartTitle: '年引用量',

    // 趋势
    totalPapers: '相关论文',
    totalCitations: '总被引数',
    avgCitations: '篇均被引',
    growthDescription: '增长趋势',

    // 推荐客编
    recommendedEditors: '推荐客座编辑',
    institution: '机构',
    expertise: '研究方向',
    worksCount: '论文数',
    citedByCount: '被引数',
    hIndex: 'H指数',
    recommendReason: '推荐理由',
    worksByYear: '逐年发文',
    citationsByYear: '逐年被引',

    // 来源论文
    sourceArticles: '来源论文',
    authors: '作者',
    year: '年份',
    doi: 'DOI',
    openAccess: '开放获取',

    // 错误/状态
    enterKeyword: '请输入研究关键词',
    searchFailed: '策划生成失败，请重试',
    networkError: '网络异常，请检查后重试',
    timeoutError: '分析超时，请尝试更具体的关键词',

    // 空状态
    emptyHint: '输入关键词，开始策划特刊话题',
    emptyDesc: '系统将基于 OpenAlex 数据库分析近5年论文和学者数据，为您生成完整的特刊策划方案',

    // 历史记录
    history: '最近策划',
    noHistory: '暂无策划记录',

    // V5 新增
    createTopic: '创建话题',
    createTopicTitle: '创建特刊策划话题',
    keywordLabel: '研究关键词',
    constraintsLabel: '附加要求（可选）',
    constraintsPlaceholder: '例如：请聚焦中国学者；客编至少包含2位女性学者...',
    creditCostHint: '创建将消耗 {cost} 积分',
    currentBalance: '当前余额：{balance} 积分',
    confirmCreate: '确认创建',
    createSuccess: '任务创建成功',
    progressDetail: '执行进度',
    stepPending: '未开始',
    stepRunning: '进行中',
    stepCompleted: '已完成',
    createdAt: '创建时间',
    completedAt: '完成时间',
    viewDetail: '查看详情',
    taskStatus_processing: '进行中',
    taskStatus_completed: '已完成',
    taskStatus_failed: '失败',
    deductFailed: '积分扣费失败',
    retryDeduct: '补扣积分',
    noTasks: '暂无话题，点击"创建话题"开始',
    searchTasks: '搜索话题',
    regenerate: '重新生成',
    regenerateHint: '消耗 30 积分重新生成策划方案',
    regenerateCount: '已重新生成 {count} 次',
    viewHistory: '查看历史',
    noHistory2: '暂无历史记录',
    guestEditors: '推荐客编',
    topicInfo: '话题信息'
  }
};
