/**
 * reviews 模块格式工具函数
 * 从 reviews.js 提取的 formatItem、buildAdvOptions 等
 */
var dbInit = require('./dbInit');
var parseDate = dbInit.parseDate;
var config = require('./reviews-config');
var STATUS_LABEL_MAP = config.STATUS_LABEL_MAP;

function formatItem(item) {
  var now = new Date();
  var d = item.deadline ? parseDate(item.deadline) : null;
  var daysLeft = d ? Math.ceil((d - now) / 86400000) : null;
  return {
    _id: item._id,
    paperTitle: item.paperTitle || '',
    journal: item.journal || '',
    deadline: item.deadline || '',
    invitedDate: item.invitedDate || '',
    status: item.status || 'pending',
    completed: item.completed || false,
    decision: item.decision || '',
    decisionNote: item.decisionNote || '',
    decisionTime: item.decisionTime || '',
    round: item.round || 0,
    roundLabel: config.getRoundLabel(item.round),
    systemUrl: item.systemUrl || '',
    systemAccount: item.systemAccount || '',
    systemPassword: item.systemPassword || '',
    note: item.note || '',
    relatedReviewId: item.relatedReviewId || '',
    timeline: item.timeline || [],
    daysLeft: daysLeft,
    urgent: daysLeft >= 0 && daysLeft <= 7
  };
}

/**
 * 构建高级筛选选项
 * @param {Array} list - 已格式化的数据列表
 * @param {Object} currentAdv - 当前高级筛选值 { advStatus, advJournal }
 * @returns {Object} extra - 需要 setData 的字段
 */
function buildAdvOptions(list, currentAdv) {
  currentAdv = currentAdv || {};
  var statusCount = {};
  var journalCount = {};
  var decisionCount = {};
  list.forEach(function(i) {
    var s = i.status || '';
    if (s) statusCount[s] = (statusCount[s] || 0) + 1;
    var j = i.journal || '';
    if (j) journalCount[j] = (journalCount[j] || 0) + 1;
    var dc = i.decision || '';
    if (dc) decisionCount[dc] = (decisionCount[dc] || 0) + 1;
  });

  var statusOpt = Object.keys(statusCount).map(function(k) {
    return { value: k, label: (STATUS_LABEL_MAP[k] || k) + ' (' + statusCount[k] + ')' };
  });
  statusOpt.sort(function(a, b) { return b.count - a.count; });

  var journalOpt = Object.keys(journalCount).map(function(k) {
    return { value: k, label: k + ' (' + journalCount[k] + ')' };
  });
  journalOpt.sort(function(a, b) { return b.count - a.count; });

  var decisionOpt = Object.keys(decisionCount).map(function(k) {
    return { value: k, label: (config.getDecisionLabel(k) || k) + ' (' + decisionCount[k] + ')' };
  });

  var advStatusIndex = findIndexByValue(statusOpt, currentAdv.advStatus);
  var advJournalIndex = findIndexByValue(journalOpt, currentAdv.advJournal);

  return {
    advStatusOptions: statusOpt,
    advJournalOptions: journalOpt,
    advDecisionOptions: decisionOpt,
    advStatusIndex: advStatusIndex,
    advJournalIndex: advJournalIndex,
    advStatusLabel: (statusOpt[advStatusIndex] || {}).label || '',
    advJournalLabel: (journalOpt[advJournalIndex] || {}).label || ''
  };
}

function findIndexByValue(options, value) {
  if (!value) return -1;
  for (var i = 0; i < options.length; i++) {
    if (options[i].value === value) return i;
  }
  return -1;
}

function formatDeadlineToDate(deadline) {
  if (!deadline) return '';
  var d = parseDate(deadline);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

module.exports = {
  formatItem: formatItem,
  buildAdvOptions: buildAdvOptions,
  findIndexByValue: findIndexByValue,
  formatDeadlineToDate: formatDeadlineToDate
};
