/**
 * conferences 模块格式工具函数
 * 从 conferences.js 提取的 formatItem、buildAdvOptions 等
 */
var dbInit = require('./dbInit');
var parseDate = dbInit.parseDate;
var config = require('./conferences-config');

function formatItem(item) {
  var now = new Date();
  var d = item.deadline ? parseDate(item.deadline) : null;
  var daysLeft = d ? Math.ceil((d - now) / 86400000) : null;

  // 根据 daysLeft 判断状态
  var status = 'pending';
  if (daysLeft !== null) {
    if (daysLeft < 0) {
      status = 'registered'; // 已报名/已完成
    } else if (daysLeft > 14) {
      status = 'pending'; // 超过14天还早
    } else {
      status = 'pending'; // 14天内，紧急
    }
  }

  return {
    _id: item._id,
    name: item.name || '',
    shortName: item.shortName || '',
    location: item.location || '',
    deadline: item.deadline || '',
    deadlineLabel: item.deadline ? this.formatDate(parseDate(item.deadline)) : '',
    notificationDate: item.notificationDate || '',
    notificationLabel: item.notificationDate ? this.formatDate(parseDate(item.notificationDate)) : '',
    startDate: item.startDate || '',
    startDateLabel: item.startDate ? this.formatDate(parseDate(item.startDate)) : '',
    url: item.url || '',
    note: item.note || '',
    status: item.status || status,
    createTime: item.createTime,
    updateTime: item.updateTime,
    daysLeft: daysLeft,
    urgent: daysLeft !== null && daysLeft >= 0 && daysLeft <= 14,
    critical: daysLeft !== null && daysLeft >= 0 && daysLeft <= 3
  };
}

// 格式化日期为 YYYY-MM-DD
function formatDate(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 将 deadline 字符串转为日期选择器的 YYYY-MM-DD 格式
function formatDeadlineToDate(deadline) {
  if (!deadline) return '';
  var d = parseDate(deadline);
  if (isNaN(d.getTime())) return '';
  return formatDate(d);
}

/**
 * 构建高级筛选选项
 * @param {Array} list - 已格式化的数据列表
 * @param {Object} currentAdv - 当前高级筛选值
 * @returns {Object} extra - 需要 setData 的字段
 */
function buildAdvOptions(list, currentAdv) {
  currentAdv = currentAdv || {};
  var locationCount = {};
  var statusCount = {};

  list.forEach(function(i) {
    var loc = i.location || '';
    if (loc) locationCount[loc] = (locationCount[loc] || 0) + 1;
    var s = i.status || '';
    if (s) statusCount[s] = (statusCount[s] || 0) + 1;
  });

  var locationOpt = Object.keys(locationCount).map(function(k) {
    return { value: k, label: k + ' (' + locationCount[k] + ')' };
  });
  locationOpt.sort(function(a, b) { return b.count - a.count; });

  var statusOpt = Object.keys(statusCount).map(function(k) {
    return { value: k, label: config.getStatusLabel(k) + ' (' + statusCount[k] + ')' };
  });

  var locationIndex = findIndexByValue(locationOpt, currentAdv.advLocation);
  var statusIndex = findIndexByValue(statusOpt, currentAdv.advStatus);

  return {
    advLocationOptions: locationOpt,
    advStatusOptions: statusOpt,
    advLocationIndex: locationIndex,
    advStatusIndex: statusIndex,
    advLocationLabel: (locationOpt[locationIndex] || {}).label || '',
    advStatusLabel: (statusOpt[statusIndex] || {}).label || ''
  };
}

function findIndexByValue(options, value) {
  if (!value) return -1;
  for (var i = 0; i < options.length; i++) {
    if (options[i].value === value) return i;
  }
  return -1;
}

// 绑定到 this 的方法
formatItem.prototype.formatDate = formatDate;

module.exports = {
  formatItem: formatItem,
  formatDate: formatDate,
  formatDeadlineToDate: formatDeadlineToDate,
  buildAdvOptions: buildAdvOptions,
  findIndexByValue: findIndexByValue
};
