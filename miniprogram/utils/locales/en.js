/**
 * English language pack
 */
module.exports = {
  // Common
  common: {
    loading: 'Loading...',
    loadMore: 'Load More',
    noData: 'No Data',
    retry: 'Retry',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    back: 'Back',
    search: 'Search',
    clear: 'Clear'
  },

  // Navigation
  nav: {
    home: 'Home',
    toolbox: 'Toolbox',
    calendar: 'Calendar',
    profile: 'Profile',
    academicTools: 'ZhiYanTong Academic',
    specialIssue: 'Special Issue'
  },

  // Special Issue Page
  specialIssue: {
    title: 'Special Issue Planner',
    subtitle: 'AI-powered special issue planning based on OpenAlex',
    inputPlaceholder: 'Enter keyword, e.g. "Large Language Models"',
    searchBtn: 'Plan Issue',
    searching: 'Analyzing...',
    progressSearching: 'Searching papers and scholars...',
    progressFetchingAuthors: 'Fetching scholar details...',
    progressGenerating: 'AI is generating proposals...',
    progressHint: 'Estimated 1-2 minutes, please wait',
    languageToggle: '中 / EN',

    // Topic
    topicTitle: 'Topic Title',
    topicHeat: 'Topic Heat',
    perspective: 'Perspective',
    topicSummary: 'Summary',
    keywords: 'Keywords',
    rationale: 'Rationale',
    citationTrend: 'Citation Trend',
    citationChartTitle: 'Citations by Year',

    // Trend
    totalPapers: 'Related Papers',
    totalCitations: 'Total Citations',
    avgCitations: 'Avg Citations/Paper',
    growthDescription: 'Growth Trend',

    // Recommended Editors
    recommendedEditors: 'Recommended Guest Editors',
    institution: 'Institution',
    expertise: 'Expertise',
    worksCount: 'Works',
    citedByCount: 'Citations',
    hIndex: 'H-index',
    recommendReason: 'Reason',
    worksByYear: 'Works by Year',
    citationsByYear: 'Citations by Year',

    // Source Articles
    sourceArticles: 'Source Articles',
    authors: 'Authors',
    year: 'Year',
    doi: 'DOI',
    openAccess: 'Open Access',

    // Errors/States
    enterKeyword: 'Please enter a research keyword',
    searchFailed: 'Planning failed, please retry',
    networkError: 'Network error, please check and retry',
    timeoutError: 'Analysis timed out, try a more specific keyword',

    // Empty
    emptyHint: 'Enter a keyword to plan a special issue',
    emptyDesc: 'The system will analyze 5-year paper and author data from OpenAlex to generate a complete special issue proposal',

    // History
    history: 'Recent Plans',
    noHistory: 'No planning history',

    // V5 new keys
    createTopic: 'Create Topic',
    createTopicTitle: 'Create Special Issue Topic',
    keywordLabel: 'Research Keyword',
    constraintsLabel: 'Additional Requirements (optional)',
    constraintsPlaceholder: 'e.g. Focus on Chinese scholars; Include at least 2 female editors...',
    creditCostHint: 'Will cost {cost} credits',
    currentBalance: 'Current Balance: {balance} credits',
    confirmCreate: 'Confirm',
    createSuccess: 'Task created successfully',
    progressDetail: 'Progress',
    stepPending: 'Pending',
    stepRunning: 'Running',
    stepCompleted: 'Completed',
    createdAt: 'Created',
    completedAt: 'Completed',
    viewDetail: 'View Detail',
    taskStatus_processing: 'Processing',
    taskStatus_completed: 'Completed',
    taskStatus_failed: 'Failed',
    deductFailed: 'Credit deduction failed',
    retryDeduct: 'Retry Deduction',
    noTasks: 'No topics yet, click "Create Topic" to start',
    searchTasks: 'Search Topics',
    regenerate: 'Regenerate',
    regenerateHint: 'Cost 30 credits to regenerate plan',
    regenerateCount: 'Regenerated {count} times',
    viewHistory: 'View History',
    noHistory2: 'No history',
    guestEditors: 'Recommended Editors',
    topicInfo: 'Topic Info'
  }
};
