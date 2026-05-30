/**
 * submissions 模块公用配置
 * 从 submissions.js 提取的常量、选项数据
 */

var ST_DEF = {
  preparing:    { label:'准备中',  color:'#f59e0b', bg:'#fef3c7', icon:'✏️' },
  submitted:    { label:'已投稿',  color:'#3b82f6', bg:'#dbeafe', icon:'📤' },
  revision:     { label:'返修中',  color:'#f97316', bg:'#ffedd5', icon:'🔧' },
  accepted:     { label:'已接收',  color:'#10b981', bg:'#d1fae5', icon:'✅' },
  proofreading: { label:'校对中',  color:'#8b5cf6', bg:'#ede9fe', icon:'🔍' },
  rejected:     { label:'被拒稿',  color:'#ef4444', bg:'#fee2e2', icon:'❌' },
  withdrawn:    { label:'已撤稿',  color:'#6b7280', bg:'#f3f4f6', icon:'↩️' },
  published:    { label:'已发布',  color:'#059669', bg:'#d1fae5', icon:'📢' }
};

var PRIORITY_LABEL = { low:'低', normal:'普通', high:'高', urgent:'紧急' };

var ROLE_OPTIONS = [
  { value:'first',         label:'一作' },
  { value:'corresponding',  label:'通讯' },
  { value:'co_first',      label:'共一' },
  { value:'co_corresponding',label:'共通' },
  { value:'collaborator',   label:'合作者' }
];

var PRIORITY_OPTIONS = [
  { value:'low',    label:'低' },
  { value:'normal', label:'普通' },
  { value:'high',   label:'高' },
  { value:'urgent', label:'紧急' }
];

var TYPE_OPTIONS = [
  { value:'研究论文', label:'研究论文' },
  { value:'综述',   label:'综述' },
  { value:'短通信', label:'短通信' },
  { value:'会议论文', label:'会议论文' },
  { value:'学位论文', label:'学位论文' },
  { value:'预印本', label:'预印本' },
  { value:'其他',   label:'其他' }
];

var TL_EVENT_OPTIONS = [
  { value:'submitted',    label:'投稿',    color:'#3b82f6' },
  { value:'revision',     label:'返修通知', color:'#f97316' },
  { value:'accepted',     label:'接收',    color:'#10b981' },
  { value:'proofreading', label:'校对',    color:'#8b5cf6' },
  { value:'rejected',     label:'拒稿',    color:'#ef4444' },
  { value:'withdrawn',    label:'撤稿',    color:'#6b7280' },
  { value:'published',    label:'发表',    color:'#059669' },
  { value:'other',        label:'其他',    color:'#6b7280' }
];

function getStatusOptions() {
  return Object.keys(ST_DEF).map(function(k){
    return { value:k, label:ST_DEF[k].label, color:ST_DEF[k].color, bg:ST_DEF[k].bg, icon:ST_DEF[k].icon };
  });
}

function getRoleLabel(value) {
  var map = { first:'一作', corresponding:'通讯', co_first:'共一', co_corresponding:'共通', collaborator:'合作者' };
  return map[value] || '';
}

function getPriorityLabel(value) {
  return PRIORITY_LABEL[value] || '普通';
}

function getPriorityStars(priority) {
  return { low:1, normal:2, high:3, urgent:4 }[priority] || 0;
}

function getDotColorFromEvent(event) {
  if (!event) return '#d1d5db';
  var e = event.toLowerCase();
  if (e.indexOf('accept') !== -1 || e.indexOf('publish') !== -1) return '#22c55e';
  if (e.indexOf('reject') !== -1 || e.indexOf('withdraw') !== -1) return '#ef4444';
  if (e.indexOf('submit') !== -1 || e.indexOf('revision') !== -1) return '#3b82f6';
  if (e.indexOf('review') !== -1) return '#f59e0b';
  return '#8b5cf6';
}

module.exports = {
  ST_DEF: ST_DEF,
  PRIORITY_LABEL: PRIORITY_LABEL,
  ROLE_OPTIONS: ROLE_OPTIONS,
  PRIORITY_OPTIONS: PRIORITY_OPTIONS,
  TYPE_OPTIONS: TYPE_OPTIONS,
  TL_EVENT_OPTIONS: TL_EVENT_OPTIONS,
  getStatusOptions: getStatusOptions,
  getRoleLabel: getRoleLabel,
  getPriorityLabel: getPriorityLabel,
  getPriorityStars: getPriorityStars,
  getDotColorFromEvent: getDotColorFromEvent
};
