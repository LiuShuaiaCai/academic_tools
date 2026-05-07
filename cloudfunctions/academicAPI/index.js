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
// isTaskType 缺省时根据 id 判断：submission/review/conference 默认为 true，其余为 false
async function getAllTools() {
  var knownTaskIds = ['submission', 'review', 'conference'];
  var res = await db.collection('tools').where({ deleteTime: null }).orderBy('category', 'asc').orderBy('order', 'asc').get();
  var result = [];
  for (var i = 0; i < res.data.length; i++) {
    var tool = res.data[i];
    if (tool.isPublished === false) continue;
    // isTaskType 缺省时按 id 推断，后续可在数据库中覆盖
    if (tool.isTaskType === undefined) {
      tool.isTaskType = knownTaskIds.indexOf(tool.id) !== -1;
    }
    result.push(tool);
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

// 数据迁移：给 tools 表补 isTaskType 字段（已设置过的跳过）
// submission/review/conference = true，其余 = false
async function migrateIsTaskType() {
  var taskTypeIds = ['submission', 'review', 'conference'];
  var res = await db.collection('tools').where({ deleteTime: null }).get();
  var updated = 0;
  for (var i = 0; i < res.data.length; i++) {
    var tool = res.data[i];
    if (tool.isTaskType !== undefined) continue; // 已设置过，跳过
    var isTask = taskTypeIds.indexOf(tool.id) !== -1;
    await db.collection('tools').doc(tool._id).update({
      data: { isTaskType: isTask, updateTime: formatTime() }
    });
    updated++;
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

// 投稿统计（支持搜索关键词过滤）
// 参数: event.keyword - 可选，搜索关键词，匹配 title/journal/coauthors/tags
async function submissionStats(event) {
  var now = new Date();
  // 云函数在 UTC+0 运行，需要转北京时间（UTC+8）来计算"今天"日期
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');

  var _ = db.command;
  var keyword = (event.keyword || '').trim();

  // 构建查询条件
  var conditions = [{ deleteTime: null }];
  if (keyword) {
    var reg = db.RegExp({ regexp: keyword, options: 'i' });
    conditions.push(_.or([
      { title: reg },
      { journal: reg },
      { coauthors: reg },
      { tags: reg }
    ]));
  }
  var where = conditions.length === 1 ? conditions[0] : _.and(conditions);

  var res = await db.collection('submissions').where(where).limit(1000).get();
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
  console.log('[submissionStats] keyword=' + keyword + ' total=' + total + ' incomplete=' + incomplete + ' near=' + near + ' urgent=' + urgent);
  return { success: true, total: total, incomplete: incomplete, near: near, urgent: urgent };
}

// 审稿统计（支持搜索关键词过滤）
// 参数: event.keyword - 可选，搜索关键词，匹配 paperTitle/journal
async function reviewStats(event) {
  var now = new Date();
  // 云函数在 UTC+0 运行，需要转北京时间（UTC+8）来计算"今天"日期
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');

  var _ = db.command;
  var keyword = (event.keyword || '').trim();

  // 构建查询条件
  var conditions = [{ deleteTime: null }];
  if (keyword) {
    var reg = db.RegExp({ regexp: keyword, options: 'i' });
    conditions.push(_.or([
      { paperTitle: reg },
      { journal: reg }
    ]));
  }
  var where = conditions.length === 1 ? conditions[0] : _.and(conditions);

  var res = await db.collection('reviews').where(where).limit(1000).get();
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
  console.log('[reviewStats] keyword=' + keyword + ' total=' + total + ' incomplete=' + incomplete + ' near=' + near + ' urgent=' + urgent);
  return { success: true, total: total, incomplete: incomplete, near: near, urgent: urgent };
}

// 会议统计（支持搜索关键词过滤）
// 参数: event.keyword - 可选，搜索关键词，匹配 name/shortName/location
async function conferenceStats(event) {
  var now = new Date();
  // 云函数在 UTC+0 运行，需要转北京时间（UTC+8）来计算"今天"日期
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');

  var _ = db.command;
  var keyword = (event.keyword || '').trim();

  // 构建查询条件
  var conditions = [{ deleteTime: null }];
  if (keyword) {
    var reg = db.RegExp({ regexp: keyword, options: 'i' });
    conditions.push(_.or([
      { name: reg },
      { shortName: reg },
      { location: reg }
    ]));
  }
  var where = conditions.length === 1 ? conditions[0] : _.and(conditions);

  var res = await db.collection('conferences').where(where).limit(1000).get();
  var list = res.data || [];
  var total = 0, pending = 0, near = 0, registered = 0;
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    total++;
    // pending: 待截稿（status = 'pending' 且 deadline 未过）
    if (item.status === 'pending') {
      pending++;
    }
    // near: deadline 3天内
    if (item.deadline) {
      var dlDateStr = String(item.deadline).substring(0, 10);
      var dlDate = new Date(dlDateStr + 'T00:00:00');
      var todayDate = new Date(todayStr + 'T00:00:00');
      var days = Math.round((dlDate.getTime() - todayDate.getTime()) / 86400000);
      if (days >= 0 && days <= 3) near++;
    }
    // registered: 已报名
    if (item.status === 'registered') {
      registered++;
    }
  }
  console.log('[conferenceStats] keyword=' + keyword + ' total=' + total + ' pending=' + pending + ' near=' + near + ' registered=' + registered);
  return { success: true, total: total, pending: pending, near: near, registered: registered };
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

// AI 审稿功能已迁移至独立云函数 aiService（支持多模型：Kimi/DeepSeek 等）

// ==================== 积分系统 ====================

// 积分规则常量
var CREDITS_RULES = {
  register_bonus: 100,
  daily_signin: 5,
  continuous_bonus: { 3: 5, 7: 10 },
  share_reward: 50,
  ai_review: 20,
  new_submission: 5,
  new_review: 5,
  new_conference: 5
};

// 积分动作描述映射
var ACTION_LABELS = {
  register_bonus: '注册赠送',
  daily_signin: '每日签到',
  continuous_bonus: '连续签到奖励',
  share_reward: '邀请好友奖励',
  ai_review: 'AI审稿',
  new_submission: '新增投稿',
  new_review: '新增审稿',
  new_conference: '新增会议'
};

// 获取今日日期字符串 YYYY-MM-DD（北京时间）
function getTodayStr() {
  var now = new Date();
  var beijing = new Date(now.getTime() + 8 * 3600000);
  return beijing.getFullYear() + '-' + String(beijing.getMonth() + 1).padStart(2, '0') + '-' + String(beijing.getDate()).padStart(2, '0');
}

// 初始化新用户积分（赠送100积分，仅首次调用）
async function initCredits(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  // 检查是否已初始化
  var config = await findRecord('user_config', { _openid: openid });
  if (config && config.credits !== undefined) {
    return { success: true, initialized: false, credits: config.credits };
  }

  var points = CREDITS_RULES.register_bonus;
  var now = formatTime();

  // 更新 user_config
  var configData = {
    credits: points,
    signinDays: 0,
    continuousDays: 0,
    lastSigninDate: '',
    inviteCount: 0
  };

  if (config) {
    await db.collection('user_config').doc(config._id).update({ data: configData });
  } else {
    configData.createTime = now;
    configData.deleteTime = null;
    await db.collection('user_config').add({ data: Object.assign({ _openid: openid }, configData) });
  }

  // 写入积分流水
  await db.collection('credits').add({
    data: {
      _openid: openid,
      type: 'earn',
      action: 'register_bonus',
      points: points,
      balance: points,
      description: '注册赠送 +' + points,
      createTime: now,
      updateTime: now,
      deleteTime: null
    }
  });

  return { success: true, initialized: true, credits: points };
}

// 获取积分信息（余额 + 签到状态）
async function getCreditsInfo() {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var config = await findRecord('user_config', { _openid: openid });
  var todayStr = getTodayStr();

  return {
    success: true,
    credits: (config && config.credits) || 0,
    signinDays: (config && config.signinDays) || 0,
    continuousDays: (config && config.continuousDays) || 0,
    signedToday: (config && config.lastSigninDate) === todayStr
  };
}

// 执行签到
async function doSignin() {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var todayStr = getTodayStr();
  var now = formatTime();

  // 获取当前配置
  var config = await findRecord('user_config', { _openid: openid });
  if (!config) {
    // 未初始化，先初始化
    await initCredits({});
    config = await findRecord('user_config', { _openid: openid });
  }

  // 已签到
  if (config.lastSigninDate === todayStr) {
    return { success: false, alreadySigned: true, credits: config.credits };
  }

  // 计算连续签到天数
  var lastDate = config.lastSigninDate;
  var continuousDays = config.continuousDays || 0;
  var signinDays = config.signinDays || 0;

  if (lastDate) {
    // 判断是否连续（昨天）
    var last = new Date(lastDate + 'T00:00:00');
    var yesterday = new Date(todayStr + 'T00:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    if (last.getTime() === yesterday.getTime()) {
      continuousDays++;
    } else {
      continuousDays = 1; // 断签重新计算
    }
  } else {
    continuousDays = 1;
  }
  signinDays++;

  // 计算积分
  var basePoints = CREDITS_RULES.daily_signin;
  var bonusPoints = CREDITS_RULES.continuous_bonus[continuousDays] || 0;
  var totalPoints = basePoints + bonusPoints;
  var newBalance = config.credits + totalPoints;

  // 更新 user_config
  await db.collection('user_config').doc(config._id).update({
    data: {
      credits: newBalance,
      signinDays: signinDays,
      continuousDays: continuousDays,
      lastSigninDate: todayStr,
      updateTime: now
    }
  });

  // 写入基础签到流水
  await db.collection('credits').add({
    data: {
      _openid: openid,
      type: 'earn',
      action: 'daily_signin',
      points: basePoints,
      balance: newBalance,
      description: '每日签到 +' + basePoints,
      createTime: now,
      updateTime: now,
      deleteTime: null
    }
  });

  // 写入连续签到奖励流水
  if (bonusPoints > 0) {
    await db.collection('credits').add({
      data: {
        _openid: openid,
        type: 'earn',
        action: 'continuous_bonus',
        points: bonusPoints,
        balance: newBalance,
        description: '连续签到' + continuousDays + '天 +' + bonusPoints,
        createTime: now,
        updateTime: now,
        deleteTime: null
      }
    });
  }

  return {
    success: true,
    credits: newBalance,
    continuousDays: continuousDays,
    signinDays: signinDays,
    earnedPoints: totalPoints,
    basePoints: basePoints,
    bonusPoints: bonusPoints
  };
}

// 分页获取积分流水
async function getCreditsList(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var page = event.page || 1;
  var pageSize = event.pageSize || 20;

  var total = await db.collection('credits').where({ _openid: openid, deleteTime: null }).count();

  var skip = (page - 1) * pageSize;
  var res = await db.collection('credits')
    .where({ _openid: openid, deleteTime: null })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  // 格式化列表
  var list = [];
  for (var i = 0; i < res.data.length; i++) {
    var item = res.data[i];
    list.push({
      _id: item._id,
      type: item.type,
      action: item.action,
      points: item.points,
      balance: item.balance,
      description: item.description,
      createTime: item.createTime,
      label: ACTION_LABELS[item.action] || item.action
    });
  }

  return {
    success: true,
    list: list,
    total: total.total,
    page: page,
    pageSize: pageSize,
    hasMore: skip + res.data.length < total.total
  };
}

// 消耗积分（原子操作：检查余额 → 扣费 → 写流水）
async function spendCredits(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var action = event.actionType || event.spendAction || '';  // 'ai_review' / 'new_submission' / 'new_review' / 'new_conference'
  var points = event.points;     // 消耗积分数
  var description = event.description; // 描述，如 'AI审稿 -20'
  var relatedId = event.relatedId || ''; // 关联业务ID

  if (!action || !points) {
    return { success: false, error: '参数不完整' };
  }

  var costPoints = CREDITS_RULES[action];
  if (costPoints === undefined) {
    return { success: false, error: '未知消耗类型: ' + action };
  }

  // 使用实际传入的 points（以防未来有动态定价），如果不传则用规则默认值
  var actualCost = points || costPoints;
  var desc = description || (ACTION_LABELS[action] || action) + ' -' + actualCost;

  // 获取当前余额
  var config = await findRecord('user_config', { _openid: openid });
  if (!config) {
    return { success: false, insufficient: true, balance: 0, required: actualCost };
  }

  var currentBalance = config.credits || 0;

  // 余额不足
  if (currentBalance < actualCost) {
    return {
      success: false,
      insufficient: true,
      balance: currentBalance,
      required: actualCost
    };
  }

  // 扣费
  var newBalance = currentBalance - actualCost;
  var now = formatTime();

  await db.collection('user_config').doc(config._id).update({
    data: { credits: newBalance, updateTime: now }
  });

  // 写入流水
  var flowData = {
    data: {
      _openid: openid,
      type: 'spend',
      action: action,
      points: actualCost,
      balance: newBalance,
      description: desc,
      createTime: now,
      updateTime: now,
      deleteTime: null
    }
  };
  if (relatedId) {
    flowData.data.relatedId = relatedId;
  }
  await db.collection('credits').add(flowData);

  return {
    success: true,
    balance: newBalance,
    cost: actualCost
  };
}

// ==================== 入口 ====================

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'getAllTools':       return await getAllTools();
      case 'migrateTools':      return await migrateTools();
      case 'migrateIconEmoji': return await migrateIconEmoji();
      case 'migratePagePath': return await migratePagePath();
      case 'migrateIsTaskType': return await migrateIsTaskType();
      case 'cleanUserTools':    return await cleanUserTools();
      case 'getUserId':         return await getUserId();
      case 'getUserConfig':   return await getUserConfig();
      case 'saveUserConfig':  return await saveUserConfig(event);
      case 'getUserTools':    return await getUserTools();
      case 'toggleUserTool':  return await toggleUserTool(event);
      case 'saveUserTools':   return await saveUserTools(event);
      case 'submissionStats': return await submissionStats(event);
      case 'reviewStats':     return await reviewStats(event);
      case 'conferenceStats': return await conferenceStats(event);
      case 'fixCompleted':   return await fixCompleted();
      // 积分系统
      case 'initCredits':    return await initCredits(event);
      case 'getCreditsInfo': return await getCreditsInfo();
      case 'doSignin':       return await doSignin();
      case 'getCreditsList': return await getCreditsList(event);
      case 'spendCredits':   return await spendCredits(event);
      default:                return { error: '未知操作: ' + (event.action || 'empty') };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
};
