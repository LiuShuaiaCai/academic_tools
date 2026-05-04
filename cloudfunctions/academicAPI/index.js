// cloudfunctions/academicAPI/index.js
// 职责：业务接口（用户配置、工具开关等）
// 每个方法独立，通过 action 参数调用

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 格式化时间 YYYY-MM-DD HH:mm:ss
function formatTime(date) {
  var d = date ? new Date(date) : new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

// 查询单条记录
async function findRecord(collection, whereCondition) {
  var res = await db.collection(collection).where(whereCondition).limit(1).get();
  return res.data.length > 0 ? res.data[0] : null;
}

// 存在更新，不存在添加
async function upsert(collection, whereCondition, data) {
  var existing = await findRecord(collection, whereCondition);
  data.updateTime = formatTime();

  if (existing) {
    await db.collection(collection).doc(existing._id).update({ data: data });
    return { action: 'updated', _id: existing._id };
  } else {
    data.createTime = formatTime();
    data.deleteTime = null;
    var res = await db.collection(collection).add({ data: data });
    return { action: 'created', _id: res._id };
  }
}

// ==================== 方法 ====================

// 获取当前用户 OpenID
async function getUserId() {
  var wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID || ''
  };
}

// 获取用户配置
async function getUserConfig() {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  return await findRecord('user_config', { _openid: openid });
}

// 保存/更新用户配置（user_config 表 _openid 唯一）
async function saveUserConfig(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var res = await upsert('user_config', { _openid: openid }, {
    role: event.role,
    settings: event.settings || {}
  });
  return { success: true, action: res.action };
}

// 获取已发布工具定义（所有页面统一使用）
// isPublished !== false 的都返回（兼容老数据没有该字段的情况）
async function getAllTools() {
  var res = await db.collection('tools').where({ deleteTime: null }).orderBy('category', 'asc').orderBy('order', 'asc').get();
  var result = [];
  for (var i = 0; i < res.data.length; i++) {
    if (res.data[i].isPublished !== false) {
      result.push(res.data[i]);
    }
  }
  return result;
}

// 数据迁移：给 tools 表补 isPublished 字段（老数据兼容）
async function migrateTools() {
  var res = await db.collection('tools').where({ deleteTime: null }).get();
  var updated = 0;
  for (var i = 0; i < res.data.length; i++) {
    var tool = res.data[i];
    if (tool.isPublished === undefined) {
      await db.collection('tools').doc(tool._id).update({
        data: { isPublished: true, updateTime: formatTime() }
      });
      updated++;
    }
  }
  return { success: true, updated: updated };
}

// 数据迁移：给 tools 表补 iconEmoji 字段
async function migrateIconEmoji() {
  var emojiMap = {
    'paper-plane': '📄',
    'glasses': '👓',
    'calendar-alt': '📅',
    'folder-open': '📁',
    'quote-right': '📚',
    'exclamation-triangle': '⚠️',
    'trophy': '🏆',
    'sticky-note': '📝'
  };
  var res = await db.collection('tools').where({ deleteTime: null }).get();
  var updated = 0;
  for (var i = 0; i < res.data.length; i++) {
    var tool = res.data[i];
    if (!tool.iconEmoji && emojiMap[tool.icon]) {
      await db.collection('tools').doc(tool._id).update({
        data: { iconEmoji: emojiMap[tool.icon], updateTime: formatTime() }
      });
      updated++;
    }
  }
  return { success: true, updated: updated };
}

// 数据迁移：给 tools 表补 pagePath 字段
async function migratePagePath() {
  var pathMap = {
    'submission': '/pages/submissions/submissions',
    'review': '/pages/reviews/reviews',
    'conference': '/pages/conferences/conferences',
    'archive': '/pages/archive/archive',
    'note': '/pages/toolbox/toolbox'
  };
  var res = await db.collection('tools').where({ deleteTime: null }).get();
  var updated = 0;
  for (var i = 0; i < res.data.length; i++) {
    var tool = res.data[i];
    if (!tool.pagePath && pathMap[tool.id]) {
      await db.collection('tools').doc(tool._id).update({
        data: { pagePath: pathMap[tool.id], updateTime: formatTime() }
      });
      updated++;
    }
  }
  return { success: true, updated: updated };
}

// 清理 user_tools 重复数据（同 openid+toolId 只保留最新一条）
async function cleanUserTools() {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var res = await db.collection('user_tools').where({ _openid: openid, deleteTime: null }).get();

  // 按 toolId 分组，保留最新一条
  var groups = {};
  for (var i = 0; i < res.data.length; i++) {
    var item = res.data[i];
    var key = item.toolId;
    if (!groups[key] || item.updateTime > groups[key].updateTime) {
      groups[key] = item;
    }
  }

  var removed = 0;
  for (var j = 0; j < res.data.length; j++) {
    var item2 = res.data[j];
    var keep = groups[item2.toolId];
    if (keep && keep._id !== item2._id) {
      await db.collection('user_tools').doc(item2._id).update({
        data: { deleteTime: formatTime() }
      });
      removed++;
    }
  }
  return { success: true, removed: removed };
}

// 获取用户工具配置
async function getUserTools() {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var userTools = {};

  var res = await db.collection('user_tools').where({ _openid: openid, deleteTime: null }).get();
  for (var i = 0; i < res.data.length; i++) {
    userTools[res.data[i].toolId] = res.data[i].enabled;
  }
  return userTools;
}

// 切换用户工具开关（user_tools 表 _openid + toolId 唯一）
async function toggleUserTool(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var enabled = event.enabled !== undefined ? event.enabled : true;

  var res = await upsert('user_tools', { _openid: openid, toolId: event.toolId }, {
    _openid: openid,
    toolId: event.toolId,
    enabled: enabled
  });
  return { success: true, action: res.action, enabled: enabled };
}

// 批量保存用户工具配置（onboarding 时用）
async function saveUserTools(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var toolIds = event.toolIds || [];
  var results = [];

  for (var i = 0; i < toolIds.length; i++) {
    var toolId = toolIds[i];
    var res = await upsert('user_tools', { _openid: openid, toolId: toolId }, {
      _openid: openid,
      toolId: toolId,
      enabled: true
    });
    results.push({ toolId: toolId, action: res.action });
  }
  return { success: true, results: results };
}

// 投稿全量统计（totalCount, incompleteCount, nearCount, urgentCount）
async function submissionStats() {
  var now = new Date();
  // 云函数在 UTC+0 运行，需要转北京时间（UTC+8）来计算"今天"日期
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');
  var res = await db.collection('submissions').where({ deleteTime: null }).limit(1000).get();
  var list = res.data || [];
  var total = 0, incomplete = 0, near = 0, urgent = 0;
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    total++;
    if (!item.completed) {
      incomplete++;
      if (item.deadline) {
        var dlDateStr = String(item.deadline).substring(0, 10);
        var dlDate = new Date(dlDateStr + 'T00:00:00');
        var todayDate = new Date(todayStr + 'T00:00:00');
        var days = Math.round((dlDate.getTime() - todayDate.getTime()) / 86400000);
        if (days >= 2 && days <= 3) near++;
        if (days >= 0 && days <= 1) urgent++;
      }
    }
  }
  console.log('[submissionStats] result: total=' + total + ' incomplete=' + incomplete + ' near=' + near + ' urgent=' + urgent);
  return { success: true, total: total, incomplete: incomplete, near: near, urgent: urgent };
}

// 修复被错误标记为 completed=true 的投稿（没有终态事件的应改为 false）
async function fixCompleted() {
  var completedEvents = ['接收', '发表', '出版', 'online', 'Online', 'accepted', 'published'];
  var res = await db.collection('submissions').where({ deleteTime: null }).limit(1000).get();
  var list = res.data || [];
  var fixed = 0;
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item.completed) continue;
    var tl = item.timeline || [];
    var hasCompletedEvent = tl.some(function(t){
      return completedEvents.some(function(k){ return (t.event||'').indexOf(k) !== -1; });
    });
    if (!hasCompletedEvent) {
      await db.collection('submissions').doc(item._id).update({ data: { completed: false } });
      fixed++;
    }
  }
  return { success: true, fixed: fixed, total: list.length };
}

// ==================== 入口 ====================

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'getAllTools':       return await getAllTools();
      case 'migrateTools':      return await migrateTools();
      case 'migrateIconEmoji': return await migrateIconEmoji();
      case 'migratePagePath': return await migratePagePath();
      case 'cleanUserTools':    return await cleanUserTools();
      case 'getUserId':         return await getUserId();
      case 'getUserConfig':   return await getUserConfig();
      case 'saveUserConfig':  return await saveUserConfig(event);
      case 'getUserTools':    return await getUserTools();
      case 'toggleUserTool':  return await toggleUserTool(event);
      case 'saveUserTools':   return await saveUserTools(event);
      case 'submissionStats': return await submissionStats();
      case 'fixCompleted':    return await fixCompleted();
      default:                return { error: '未知操作: ' + (event.action || 'empty') };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
};
