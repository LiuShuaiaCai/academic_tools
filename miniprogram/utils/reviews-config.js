/**
 * reviews 模块公用配置
 * 从 reviews.js 提取的常量、选项数据
 */

var STATUS_LABEL_MAP = {
  pending: '待审稿',
  in_progress: '审稿中',
  submitted: '已提交',
  completed: '已完成'
};

var STATUS_DEF = {
  pending:     { label: '待审稿', color: '#F59E0B', bg: '#FEF3C7' },
  in_progress: { label: '审稿中', color: '#3B82F6', bg: '#DBEAFE' },
  submitted:   { label: '已提交', color: '#10B981', bg: '#D1FAE5' },
  completed:   { label: '已完成', color: '#9CA3AF', bg: '#F3F4F6' }
};

var DECISION_OPTIONS = [
  // { value: 'pending',  label: '待定', icon: '⏳', color: '#6B7280', bg: '#F3F4F6' },
  { value: 'peer',     label: '同行', icon: '👥', color: '#8B5CF6', bg: '#EDE9FE' },
  { value: 'accept',   label: '接收', icon: '✅', color: '#059669', bg: '#ECFDF5' },
  { value: 'major',    label: '大修', icon: '⚠️', color: '#DC2626', bg: '#FEF2F2' },
  { value: 'minor',    label: '小修', icon: '🔄', color: '#D97706', bg: '#FFFBEB' },
  { value: 'reject',   label: '拒绝', icon: '❌', color: '#6B7280', bg: '#F3F4F6' },
  { value: 'other',    label: '其他', icon: '📝', color: '#6B7280', bg: '#F3F4F6' }
];

var ROUND_OPTIONS = [
  { value: 0, label: '不指定' },
  { value: 1, label: 'R1' },
  { value: 2, label: 'R2' },
  { value: 3, label: 'R3' },
  { value: 4, label: 'R4' },
  { value: 5, label: 'R5+' }
];

var TL_EVENT_OPTIONS = [
  { value: 'invited',    label: '收到邀请', color: '#3B82F6' },
  { value: 'accepted',   label: '接受审稿', color: '#10B981' },
  { value: 'in_progress',label: '开始审稿', color: '#8B5CF6' },
  // { value: 'submitted',  label: '提交审稿', color: '#06B6D4' },
  // { value: 'revision',   label: '修回通知', color: '#F97316' },
  { value: 'completed',  label: '审稿完成', color: '#10B981' },
  // { value: 'declined',   label: '拒绝邀请', color: '#EF4444' },
  // { value: 'other',      label: '其他',     color: '#6B7280' }
];

var STATUS_OPTIONS_FOR_FORM = [
  { value: 'pending',     label: '待审稿' },
  { value: 'in_progress', label: '审稿中' },
  { value: 'submitted',   label: '已提交' }
];

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

function getDecisionLabel(decision) {
  var opt = DECISION_OPTIONS.find(function(o) { return o.value === decision; });
  return opt ? opt.icon + ' ' + opt.label : (decision || '');
}

function getDecisionFromValue(value) {
  var opt = DECISION_OPTIONS.find(function(o) { return o.value === value; });
  return opt || null;
}

function getRoundLabel(round) {
  if (round === undefined || round === null || round === 0) return '';
  return round >= 5 ? '#R5+' : ('#R' + round);
}

module.exports = {
  STATUS_LABEL_MAP: STATUS_LABEL_MAP,
  STATUS_DEF: STATUS_DEF,
  DECISION_OPTIONS: DECISION_OPTIONS,
  ROUND_OPTIONS: ROUND_OPTIONS,
  TL_EVENT_OPTIONS: TL_EVENT_OPTIONS,
  STATUS_OPTIONS_FOR_FORM: STATUS_OPTIONS_FOR_FORM,
  getStatusOptions: getStatusOptions,
  getStatusLabel: getStatusLabel,
  getStatusColor: getStatusColor,
  getStatusBg: getStatusBg,
  getDecisionLabel: getDecisionLabel,
  getDecisionFromValue: getDecisionFromValue,
  getRoundLabel: getRoundLabel
};
