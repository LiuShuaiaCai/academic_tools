/**
 * conferences 模块公用配置
 * 从 conferences.js 提取的常量、选项数据
 */

// ======== 会议状态定义 ========
var STATUS_DEF = {
  pending:     { label: '待截稿', color: '#F59E0B', bg: '#FEF3C7' },
  registered:  { label: '已报名', color: '#10B981', bg: '#D1FAE5' },
  expired:     { label: '已过期', color: '#9CA3AF', bg: '#F3F4F6' }
};

var STATUS_LABEL_MAP = {
  pending:    '待截稿',
  registered: '已报名',
  expired:    '已过期'
};

// ======== 列表页快速筛选选项 ========
var FILTER_OPTIONS = [
  { value: 'all',       label: '全部' },
  { value: 'pending',   label: '待截稿' },
  { value: 'near',      label: '急需处理' },
  { value: 'registered', label: '已报名' }
];

// ======== 表单选项 ========
var STATUS_OPTIONS_FOR_FORM = [
  { value: 'pending',    label: '待截稿' },
  { value: 'registered', label: '已报名' }
];

// ======== 时间线事件选项 ========
var TL_EVENT_OPTIONS = [
  { value: 'deadline',   label: '截稿', color: '#EF4444' },
  { value: 'notification', label: '录用通知', color: '#F59E0B' },
  { value: 'registration',  label: '报名', color: '#10B981' },
  { value: 'start',      label: '会议开始', color: '#3B82F6' },
  { value: 'end',        label: '会议结束', color: '#8B5CF6' }
];

// ======== 辅助函数 ========
function getStatusOptions() {
  return Object.keys(STATUS_DEF).map(function(k) {
    return { value: k, label: STATUS_DEF[k].label, color: STATUS_DEF[k].color, bg: STATUS_DEF[k].bg };
  });
}

function getStatusLabel(status) {
  return STATUS_LABEL_MAP[status] || status || '';
}

function getStatusColor(status) {
  return (STATUS_DEF[status] || {}).color || '#9CA3AF';
}

function getStatusBg(status) {
  return (STATUS_DEF[status] || {}).bg || '#F3F4F6';
}

function getFilterOptions() {
  return FILTER_OPTIONS;
}

module.exports = {
  STATUS_DEF: STATUS_DEF,
  STATUS_LABEL_MAP: STATUS_LABEL_MAP,
  FILTER_OPTIONS: FILTER_OPTIONS,
  STATUS_OPTIONS_FOR_FORM: STATUS_OPTIONS_FOR_FORM,
  TL_EVENT_OPTIONS: TL_EVENT_OPTIONS,
  getStatusOptions: getStatusOptions,
  getStatusLabel: getStatusLabel,
  getStatusColor: getStatusColor,
  getStatusBg: getStatusBg,
  getFilterOptions: getFilterOptions
};
