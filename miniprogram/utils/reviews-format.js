/**
 * reviews 模块格式工具函数
 * 从 reviews.js 提取的 formatItem、buildAdvOptions 等
 */
var dbInit = require('./dbInit');
var parseDate = dbInit.parseDate;
var config = require('./reviews-config');
var STATUS_LABEL_MAP = config.STATUS_LABEL_MAP;
var STATUS_DEF = config.STATUS_DEF;

function formatItem(item) {
  var st = (!!item.completed) ? STATUS_DEF.completed : (STATUS_DEF[item.status] || STATUS_DEF.pending);

  var todayStr = (function(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  })();

  var overdueRaw = item.deadline ? (function(){
    var dlDateStr = String(item.deadline).substring(0, 10);
    var todayDate = new Date(todayStr + 'T00:00:00');
    var dlDate = new Date(dlDateStr + 'T00:00:00');
    return Math.round((dlDate.getTime() - todayDate.getTime()) / 86400000);
  })() : null;

  var daysLeft = overdueRaw;

  return {
    _id: item._id,
    paperTitle: item.paperTitle || '',
    journal: item.journal || '',
    deadline: item.deadline || '',
    invitedDate: item.invitedDate || '',
    status: item.status || 'pending',
    completed: !!item.completed,
    decision: item.decision || '',
    decisionNote: item.decisionNote || '',
    decisionTime: item.decisionTime || '',
    round: item.round || 0,
    roundLabel: config.getRoundLabel(item.round),
    systemUrl: item.systemUrl || '',
    editorEmail: item.editorEmail || '',
    systemAccount: item.systemAccount || '',
    systemPassword: item.systemPassword || '',
    note: item.note || '',
    reviewId: item.reviewId || '',
    relatedReviewId: item.relatedReviewId || '',
    timeline: item.timeline || [],
    daysLeft: daysLeft,
    urgent: daysLeft !== null && daysLeft >= 0 && daysLeft <= 7,
    statusLabel: st.label,
    statusColor: st.color,
    statusBg: st.bg,
    decisionLabel: item.decision ? config.getDecisionLabel(item.decision) : '⏳ 待处理',
    overdueLabel: (!item.completed && overdueRaw !== null) ? (function(d){
      if(d < 0) return '已超期' + Math.abs(d) + '天';
      if(d === 0) return '今天到期';
      if(d === 1) return '明天到期';
      if(d >= 2 && d <= 3) return '剩余' + d + '天';
      return item.deadline ? String(item.deadline).substring(0, 10) : '';
    })(overdueRaw) : (item.completed ? '已完成' : ''),
    overdueClass: (!item.completed && overdueRaw !== null) ? (overdueRaw <= 0 ? 'overdue' : (overdueRaw <= 1 ? 'urgent-critical' : (overdueRaw <= 3 ? 'urgent' : 'normal'))) : (item.completed ? 'completed' : '')
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
