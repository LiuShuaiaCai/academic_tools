/**
 * submissions 模块格式工具函数
 * 从 submissions.js 提取的 formatItem、formatTimelineForDisplay 等
 */
var config = require('../utils/submissions-config');
var ST_DEF = config.ST_DEF;

// iOS 兼容：将 "yyyy-MM-dd HH:mm:ss" 转为 "yyyy-MM-ddTHH:mm:ss"
// 纯日期 "yyyy-MM-dd" 补 T00:00:00，确保按本地时区解析
function parseDate(str) {
  if (!str) return new Date(NaN);
  var s = String(str);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    s = s + 'T00:00:00';
  } else {
    s = s.replace(' ', 'T');
  }
  return new Date(s);
}

function formatItem(item) {
  var st = ST_DEF[item.status] || ST_DEF.preparing;
  var roleLabel = config.getRoleLabel(item.role);
  var priorityLabel = config.getPriorityLabel(item.priority);
  var priorityStars = config.getPriorityStars(item.priority);

  var now = Date.now();
  var todayStr = (function(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  })();
  var daysSinceCreate = item.createTime ? Math.floor((now - parseDate(item.createTime).getTime()) / 86400000) : null;
  var overdueRaw = item.deadline ? (function(){
    var dlDateStr = String(item.deadline).substring(0, 10);
    var todayDate = new Date(todayStr + 'T00:00:00');
    var dlDate = new Date(dlDateStr + 'T00:00:00');
    return Math.round((dlDate.getTime() - todayDate.getTime()) / 86400000);
  })() : null;

  // 强制数组类型，兼容老数据
  var tl = Array.isArray(item.timeline) ? item.timeline : [];
  var fieldsArr = Array.isArray(item.fields) ? item.fields : (item.fields ? [item.fields] : []);
  var tagsArr = Array.isArray(item.tags) ? item.tags : (item.tags ? [item.tags] : []);
  var fundsArr = Array.isArray(item.funds) ? item.funds : (item.funds ? [item.funds] : []);
  var coauthorsArr = Array.isArray(item.coauthors) ? item.coauthors : (item.coauthors ? [item.coauthors] : []);
  var attachmentsArr = Array.isArray(item.attachments) ? item.attachments : [];
  var allTags = fieldsArr.concat(tagsArr);

  return {
    _id: item._id,
    title: item.title,
    journal: item.journal,
    status: item.status,
    role: item.role,
    paperType: item.paperType,
    priority: item.priority,
    deadline: item.deadline,
    manuscriptId: item.manuscriptId,
    doi: item.doi,
    url: item.url,
    corresponding: item.corresponding,
    payee: item.payee,
    coauthors: coauthorsArr.join(','),
    note: item.note || '',
    tags: tagsArr.join(','),
    fields: fieldsArr.join(','),
    funds: fundsArr.join(','),
    relatedWorkId: item.relatedWorkId || '',
    statusLabel: st.label,
    statusColor: st.color,
    statusBg: st.bg,
    roleLabel: roleLabel,
    priorityLabel: priorityLabel,
    priorityStars: priorityStars,
    // 先判断是否已完成，已完成的不再计算 urgent/near/overdue
    overdueLabel: (!item.completed && overdueRaw !== null) ? (function(d){
      if(d < 0) return '已超期' + Math.abs(d) + '天';
      if(d === 0) return '今天到期';
      if(d === 1) return '明天到期';
      if(d >= 2 && d <= 3) return '剩余' + d + '天';
      return formatDate(parseDate(item.deadline));
    })(overdueRaw) : (item.completed ? '已完成' : ''),
    overdueClass: (!item.completed && overdueRaw !== null) ? (overdueRaw <= 0 ? 'overdue' : (overdueRaw <= 1 ? 'urgent-critical' : (overdueRaw <= 3 ? 'urgent' : 'normal'))) : (item.completed ? 'completed' : ''),
    recentTimeline: formatTimelineForDisplay(tl),
    allTags: allTags.slice(0, 6),
    attachCount: attachmentsArr.length,
    completed: !!item.completed,
    tlCount: tl.length,
    createTimeFormatted: item.createTime ? formatDate(parseDate(item.createTime)) : ''
  };
}

function formatTimelineForDisplay(timeline, tlEventOptions) {
  if (!timeline || !timeline.length) return [];
  var evColorMap = {};
  (tlEventOptions || []).forEach(function(e) { evColorMap[e.label] = e.color; });
  return timeline.slice(0, 2).map(function(t) {
    return {
      date: t.date || '',
      event: t.event || '',
      dotColor: t.dotColor || evColorMap[t.event] || '#6b7280'
    };
  });
}

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function splitAndTrim(str) {
  if (!str) return [];
  return str.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
}

function splitStrToArray(arr) {
  return Array.isArray(arr) ? arr : (arr || '').split(',').map(function(t) { return t.trim(); }).filter(Boolean);
}

module.exports = {
  formatItem: formatItem,
  formatTimelineForDisplay: formatTimelineForDisplay,
  formatDate: formatDate,
  splitAndTrim: splitAndTrim,
  splitStrToArray: splitStrToArray
};
