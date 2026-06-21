// cloudfunctions/academicAPI/index.js
// 职责：业务接口（用户配置、工具开关等）
// 每个方法独立，通过 action 参数调用

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 把数据库字段（字符串或 Date 对象）安全提取为 YYYY-MM-DD（北京时间）
function extractDateStr(val) {
  if (!val) return '';
  var pad = function(n) { return String(n).padStart(2, '0'); };
  // Date 对象：加8小时偏移再读UTC，得到北京时间
  if (val instanceof Date && !isNaN(val.getTime())) {
    var d = new Date(val.getTime() + 8 * 60 * 60 * 1000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  // 字符串：直接匹配 YYYY-MM-DD 前缀（不受服务器时区影响）
  var s = String(val).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  // 兜底：尝试解析并取 local 日期分量
  return '';
}

// 获取北京时间 Date 对象
function getBeijingTime(date) {
  var d = date ? new Date(date) : new Date();
  return new Date(d.getTime() + 8 * 60 * 60 * 1000);
}

// 格式化时间 YYYY-MM-DD HH:mm:ss（北京时间）
function formatTime(date) {
  var d = getBeijingTime(date);
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
}

// 计算过期时间（当前时间 + 1年）
function getExpireTime() {
  var now = new Date();
  var beijing = new Date(now.getTime() + 8 * 3600000);
  var expireDate = new Date(beijing.getFullYear() + 1, beijing.getMonth(), beijing.getDate());
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return expireDate.getFullYear() + '-' + pad(expireDate.getMonth() + 1) + '-' + pad(expireDate.getDate()) + ' 23:59:59';
}

// 获取北京时间日期字符串
function getBeijingDateStr(date) {
  var d = date ? new Date(date) : new Date();
  var beijing = new Date(d.getTime() + 8 * 3600000);
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return beijing.getFullYear() + '-' + pad(beijing.getMonth() + 1) + '-' + pad(beijing.getDate());
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
// 强制未发布工具列表：即使数据库标记为已发布也不返回，并自动修复数据库
var FORCE_UNPUBLISHED_IDS = ['note'];

async function getAllTools() {
  var knownTaskIds = ['submission', 'review', 'conference', 'specialIssue'];
  var res = await db.collection('tools').where({ deleteTime: null }).orderBy('category', 'asc').orderBy('order', 'asc').get();
  var result = [];
  for (var i = 0; i < res.data.length; i++) {
    var tool = res.data[i];
    // 强制未发布：自动修复数据库并跳过
    if (FORCE_UNPUBLISHED_IDS.indexOf(tool.id) !== -1) {
      if (tool.isPublished !== false) {
        db.collection('tools').doc(tool._id).update({
          data: { isPublished: false, updateTime: formatTime() }
        }).catch(function() {});
      }
      continue;
    }
    if (tool.isPublished === false) continue;
    // isTaskType 缺省时按 id 推断，后续可在数据库中覆盖
    if (tool.isTaskType === undefined || tool.isTaskType === false) {
      tool.isTaskType = knownTaskIds.indexOf(tool.id) !== -1;
    }
    result.push(tool);
  }
  return result;
}

// 数据迁移：给 tools 表补 isPublished 字段（老数据兼容）
// 强制未发布的工具不会被标记为 isPublished: true
async function migrateTools() {
  var res = await db.collection('tools').where({ deleteTime: null }).get();
  var updated = 0;
  for (var i = 0; i < res.data.length; i++) {
    var tool = res.data[i];
    if (tool.isPublished === undefined) {
      var isPublished = FORCE_UNPUBLISHED_IDS.indexOf(tool.id) === -1;
      await db.collection('tools').doc(tool._id).update({
        data: { isPublished: isPublished, updateTime: formatTime() }
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

// 投稿统计（支持搜索关键词过滤）
// 参数: event.keyword - 可选，搜索关键词，匹配 title/journal/coauthors/tags
async function submissionStats(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var now = new Date();
  // 云函数在 UTC+0 运行，需要转北京时间（UTC+8）来计算"今天"日期
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');

  var _ = db.command;
  var keyword = (event.keyword || '').trim();

  // 构建查询条件
  var conditions = [{ deleteTime: null, _openid: openid }];
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
        var dlDateStr = extractDateStr(item.deadline);
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
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var now = new Date();
  // 云函数在 UTC+0 运行，需要转北京时间（UTC+8）来计算"今天"日期
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');

  var _ = db.command;
  var keyword = (event.keyword || '').trim();

  // 构建查询条件
  var conditions = [{ deleteTime: null, _openid: openid }];
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
        var dlDateStr = extractDateStr(item.deadline);
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
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var now = new Date();
  // 云函数在 UTC+0 运行，需要转北京时间（UTC+8）来计算"今天"日期
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');
  var todayDate = new Date(todayStr + 'T00:00:00');

  var _ = db.command;
  var keyword = (event.keyword || '').trim();

  // 构建查询条件
  var conditions = [{ deleteTime: null, _openid: openid }];
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
  var total = 0, active = 0, urgent = 0, completed = 0;
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    // total: 全部计数，不过滤 completed
    total++;
    // completed: 已完成计数
    if (item.completed) completed++;
    // active: 进行中（startDate <= today <= endDate），不过滤 completed
    if (item.startDate && item.endDate) {
      var sd = new Date(extractDateStr(item.startDate) + 'T00:00:00');
      var ed = new Date(extractDateStr(item.endDate) + 'T00:00:00');
      if (todayDate >= sd && todayDate <= ed) active++;
    }
    // urgent: 急需处理（有状态 且 startDate 在 3天内），排除已完成
    if (item.completed) continue;
    // urgent: 急需处理（有状态 且 startDate 在 3天内）
    if (item.status && item.startDate) {
      var sd2 = new Date(extractDateStr(item.startDate) + 'T00:00:00');
      var days2 = Math.round((sd2.getTime() - todayDate.getTime()) / 86400000);
      if (days2 >= 0 && days2 <= 3) urgent++;
    }
  }
  console.log('[conferenceStats] keyword=' + keyword + ' total=' + total + ' active=' + active + ' urgent=' + urgent + ' completed=' + completed);
  return { success: true, total: total, active: active, urgent: urgent, completed: completed };
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

// ==================== 增强版统计（返回按状态/类型细分） ====================

// 投稿统计详情：按 status 分组 + 完成/未完成/临期/紧急
async function submissionStatsDetail(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var now = new Date();
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');
  var todayDate = new Date(todayStr + 'T00:00:00');

  var res = await db.collection('submissions').where({ deleteTime: null, _openid: openid }).limit(1000).get();
  var list = res.data || [];

  // ---- 提取年份/期刊列表（供前端筛选器使用）----
  var yearSet = {};
  var journalSet = {};
  var titleSet = {};

  // ---- 统计计数器 ----
  var total = 0, completed = 0, incomplete = 0, near = 0, urgent = 0;
  var accepted = 0, rejected = 0;
  var statusMap = {};
  var totalProcessingDays = 0;
  var processingCount = 0;

  // ---- 趋势数据 ----
  var trendMap = {};     // { '2025-01': { submitted: n, completed: n } }
  // ---- 期刊统计 ----
  var journalMap = {};   // { 'Nature||2025': { submitted: n, completed: n, pending: n } }

  for (var i = 0; i < list.length; i++) {
    var item = list[i];

    // -- 提取年份/月份 --
    var itemYear = '';
    var itemMonth = '';
    var rawDate = item.createTime || item.deadline || '';
    if (rawDate) {
      var ds = extractDateStr(rawDate);
      if (ds.length >= 10) {
        itemYear = ds.substring(0, 4);
        itemMonth = ds.substring(0, 7);
      }
    }

    // -- 提取期刊 --
    var j = (item.journal || '').trim();
    if (j) journalSet[j] = true;
    if (itemYear) yearSet[itemYear] = true;
    // -- 记录不重复标题 --
    var t = (item.title || '').trim();
    if (t) titleSet[t] = true;

    // -- 年份筛选 --
    if (event.year && event.year !== 'all' && event.year !== itemYear) continue;
    // -- 月份筛选 --
    if (event.month && event.month !== 'all') {
      if (itemMonth !== event.month) continue;
    }
    // -- 期刊筛选 --
    if (event.journal && event.journal !== 'all' && event.journal !== j) continue;

    total++;

    // 判断完成状态：completed 字段 或 status 为终态
    var isEndStatus = item.status === 'accepted' || item.status === 'rejected' ||
                      item.status === 'withdrawn' || item.status === 'published';
    var isComp = item.completed || isEndStatus;

    // 状态统计
    var displayStatus = isComp ? item.status : (item.status || 'unknown');
    statusMap[displayStatus] = (statusMap[displayStatus] || 0) + 1;

    if (isComp) {
      completed++;
      if (item.status === 'accepted' || item.status === 'published') accepted++;
      if (item.status === 'rejected') rejected++;

      // 平均处理天数：createTime → deadline（终态视为 deadline 当日完成）
      if (item.createTime && item.deadline) {
        var cTime = new Date(item.createTime).getTime();
        var dTime = new Date(item.deadline).getTime();
        if (cTime > 0 && dTime > 0 && dTime >= cTime) {
          totalProcessingDays += Math.round((dTime - cTime) / 86400000);
          processingCount++;
        }
      }
    } else {
      incomplete++;
      if (item.deadline) {
        var dlDateStr = extractDateStr(item.deadline);
        var dlDate = new Date(dlDateStr + 'T00:00:00');
        var days = Math.round((dlDate.getTime() - todayDate.getTime()) / 86400000);
        if (days >= 2 && days <= 3) near++;
        if (days >= 0 && days <= 1) urgent++;
      }

      // 进行中的条目也算处理天数（截止前已过天数）
      if (item.createTime) {
        var ct2 = new Date(item.createTime).getTime();
        if (ct2 > 0) {
          totalProcessingDays += Math.round((todayDate.getTime() - ct2) / 86400000);
          processingCount++;
        }
      }
    }

    // -- 趋势数据 (按月分组) --
    if (itemMonth) {
      if (!trendMap[itemMonth]) trendMap[itemMonth] = { submitted: 0, completed: 0 };
      trendMap[itemMonth].submitted++;
      if (isComp) trendMap[itemMonth].completed++;
    }

    // -- 期刊分年统计 --
    if (j && itemYear) {
      var jKey = j + '||' + itemYear;
      if (!journalMap[jKey]) journalMap[jKey] = { journal: j, year: itemYear, submitted: 0, completed: 0, pending: 0 };
      journalMap[jKey].submitted++;
      if (isComp) journalMap[jKey].completed++;
      else journalMap[jKey].pending++;
    }
  }

  // -- 趋势数据排序 --
  var trendMonths = Object.keys(trendMap).sort();
  var trendData = [];
  for (var ti = 0; ti < trendMonths.length; ti++) {
    var m = trendMonths[ti];
    trendData.push({ month: m, submitted: trendMap[m].submitted, completed: trendMap[m].completed });
  }

  // -- 期刊统计排序 --
  var journalList = [];
  var jKeys = Object.keys(journalMap);
  for (var ji = 0; ji < jKeys.length; ji++) {
    journalList.push(journalMap[jKeys[ji]]);
  }
  journalList.sort(function(a, b) {
    if (a.year !== b.year) return b.year - a.year;
    if (a.journal !== b.journal) return a.journal < b.journal ? -1 : 1;
    return 0;
  });

  // -- 年份/期刊选项（去重+排序）--
  var years = Object.keys(yearSet).sort(function(a, b) { return b - a; });
  var journals = Object.keys(journalSet).sort();
  var uniquePapers = Object.keys(titleSet).length;

  var avgDays = processingCount > 0 ? Math.round(totalProcessingDays / processingCount) : 0;
  var acceptRate = total > 0 ? Math.round(accepted / total * 100) : 0;

  return {
    success: true,
    total: total,
    uniquePapers: uniquePapers,
    completed: completed,
    incomplete: incomplete,
    near: near,
    urgent: urgent,
    avgDays: avgDays,
    accepted: accepted,
    rejected: rejected,
    acceptRate: acceptRate,
    statusBreakdown: statusMap,
    trendData: trendData,
    journalStats: journalList,
    years: years,
    journals: journals
  };
}

// 审稿统计详情：多维统计，支持筛选 year/month/journal
async function reviewStatsDetail(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var now = new Date();
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');
  var todayDate = new Date(todayStr + 'T00:00:00');

  var res = await db.collection('reviews').where({ deleteTime: null, _openid: openid }).limit(1000).get();
  var list = res.data || [];

  // ---- 提取年份/期刊列表（供前端筛选器使用） ----
  var yearSet = {};
  var journalSet = {};

  // ---- 统计计数器 ----
  var total = 0, completed = 0, incomplete = 0, near = 0, urgent = 0;
  var statusMap = {};
  var decisionMap = {};      // { accept: n, reject: n, major: n, ... }
  var totalProcessingDays = 0;
  var processingCount = 0;
  var suggestedAccept = 0;
  var suggestedReject = 0;

  // ---- 趋势数据 ----
  var trendMap = {};         // { '2025-01': { invited: n, completed: n } }
  // ---- 期刊统计 ----
  var journalMap = {};       // { 'Nature||2025': { invited: n, completed: n, pending: n } }

  for (var i = 0; i < list.length; i++) {
    var item = list[i];

    // -- 提取年份/月份 --
    var itemYear = '';
    var itemMonth = '';
    var rawDate = item.invitedDate || item.deadline || '';
    if (rawDate) {
      var ds = extractDateStr(rawDate);
      if (ds.length >= 10) {
        itemYear = ds.substring(0, 4);
        itemMonth = ds.substring(0, 7);
      }
    }

    // -- 提取期刊 --
    var j = (item.journal || '').trim();
    if (j) {
      journalSet[j] = true;
    }
    if (itemYear) {
      yearSet[itemYear] = true;
    }

    // -- 年份筛选 --
    if (event.year && event.year !== 'all' && event.year !== itemYear) continue;
    // -- 月份筛选 --
    if (event.month && event.month !== 'all') {
      if (itemMonth !== event.month) continue;
    }
    // -- 期刊筛选 --
    if (event.journal && event.journal !== 'all' && event.journal !== j) continue;

    total++;

    var isComp = item.completed || item.status === 'completed';
    // 状态统计统一用实际完成状态，确保和 KPI 一致
    var displayStatus = isComp ? 'completed' : (item.status || 'unknown');
    statusMap[displayStatus] = (statusMap[displayStatus] || 0) + 1;

    if (isComp) {
      completed++;
    } else {
      incomplete++;
      if (item.deadline) {
        var dlDateStr = extractDateStr(item.deadline);
        var dlDate = new Date(dlDateStr + 'T00:00:00');
        var days = Math.round((dlDate.getTime() - todayDate.getTime()) / 86400000);
        if (days >= 2 && days <= 3) near++;
        if (days >= 0 && days <= 1) urgent++;
      }
    }

    // -- 审稿决定统计 --
    var dec = item.decision || '';
    if (dec) {
      decisionMap[dec] = (decisionMap[dec] || 0) + 1;
      if (dec === 'accept' || dec === 'minor') suggestedAccept++;
      if (dec === 'reject' || dec === 'major') suggestedReject++;
    }

    // -- 平均处理天数 (invitedDate → deadline) --
    if (item.invitedDate && item.deadline) {
      var idate = new Date(item.invitedDate).getTime();
      var ddate = new Date(item.deadline).getTime();
      if (idate > 0 && ddate > 0 && ddate >= idate) {
        totalProcessingDays += Math.round((ddate - idate) / 86400000);
        processingCount++;
      }
    }

    // -- 趋势数据 (按月分组) --
    if (itemMonth) {
      if (!trendMap[itemMonth]) trendMap[itemMonth] = { invited: 0, completed: 0 };
      trendMap[itemMonth].invited++;
      if (isComp) trendMap[itemMonth].completed++;
    }

    // -- 期刊分年统计 --
    if (j && itemYear) {
      var jKey = j + '||' + itemYear;
      if (!journalMap[jKey]) journalMap[jKey] = { journal: j, year: itemYear, invited: 0, completed: 0, pending: 0 };
      journalMap[jKey].invited++;
      if (isComp) journalMap[jKey].completed++;
      else journalMap[jKey].pending++;
    }
  }

  // -- 趋势数据排序 --
  var trendMonths = Object.keys(trendMap).sort();
  var trendData = [];
  for (var ti = 0; ti < trendMonths.length; ti++) {
    var m = trendMonths[ti];
    trendData.push({ month: m, invited: trendMap[m].invited, completed: trendMap[m].completed });
  }

  // -- 期刊统计排序 --
  var journalList = [];
  var jKeys = Object.keys(journalMap);
  for (var ji = 0; ji < jKeys.length; ji++) {
    journalList.push(journalMap[jKeys[ji]]);
  }
  journalList.sort(function(a, b) {
    if (a.year !== b.year) return b.year - a.year;
    if (a.journal !== b.journal) return a.journal < b.journal ? -1 : 1;
    return 0;
  });

  // -- 年份/期刊选项（去重+排序） --
  var years = Object.keys(yearSet).sort(function(a, b) { return b - a; });
  var journals = Object.keys(journalSet).sort();

  var avgDays = processingCount > 0 ? Math.round(totalProcessingDays / processingCount) : 0;

  return {
    success: true,
    total: total,
    completed: completed,
    incomplete: incomplete,
    near: near,
    urgent: urgent,
    avgDays: avgDays,
    suggestedAccept: suggestedAccept,
    suggestedReject: suggestedReject,
    statusBreakdown: statusMap,
    decisionBreakdown: decisionMap,
    trendData: trendData,
    journalStats: journalList,
    years: years,
    journals: journals
  };
}

// 会议统计详情：按会议类型/等级/参会状态分组
async function conferenceStatsDetail(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var now = new Date();
  var beijingTime = new Date(now.getTime() + 8 * 3600000);
  var todayStr = beijingTime.getFullYear() + '-' + String(beijingTime.getMonth()+1).padStart(2,'0') + '-' + String(beijingTime.getDate()).padStart(2,'0');
  var todayDate = new Date(todayStr + 'T00:00:00');

  var res = await db.collection('conferences').where({ deleteTime: null, _openid: openid }).limit(1000).get();
  var list = res.data || [];

  var total = 0, active = 0, urgent = 0, completed = 0, past = 0;
  var typeMap = {}, rankMap = {}, statusMap = {};

  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    total++;

    // 会议类型
    var ct = item.conferenceType || 'unknown';
    typeMap[ct] = (typeMap[ct] || 0) + 1;

    // 会议等级
    var rank = item.rank || '未评级';
    rankMap[rank] = (rankMap[rank] || 0) + 1;

    // 参会状态
    var st = item.status || 'unknown';
    statusMap[st] = (statusMap[st] || 0) + 1;

    // active: 进行中
    if (item.startDate && item.endDate) {
      var sd = new Date(extractDateStr(item.startDate) + 'T00:00:00');
      var ed = new Date(extractDateStr(item.endDate) + 'T00:00:00');
      if (todayDate >= sd && todayDate <= ed) active++;
    }

    // completed
    if (item.completed) completed++;

    // past: 已结束
    if (item.endDate) {
      var ed2 = new Date(extractDateStr(item.endDate) + 'T00:00:00');
      if (todayDate > ed2) past++;
    }

    // urgent
    if (!item.completed && item.status && item.startDate) {
      var sd2 = new Date(extractDateStr(item.startDate) + 'T00:00:00');
      var days2 = Math.round((sd2.getTime() - todayDate.getTime()) / 86400000);
      if (days2 >= 0 && days2 <= 3) urgent++;
    }
  }
  return {
    success: true, total: total, active: active, urgent: urgent,
    completed: completed, past: past,
    typeBreakdown: typeMap, rankBreakdown: rankMap, statusBreakdown: statusMap
  };
}

// 资料归档统计详情：按分类/文件类型分组，累计大小
async function archiveStatsDetail(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  // 并行查询
  var [catRes, archRes] = await Promise.all([
    db.collection('archive_categories').where({ deleteTime: null }).orderBy('order', 'asc').get().catch(function() { return { data: [] }; }),
    db.collection('archives').where({ deleteTime: null, _openid: openid }).limit(1000).get().catch(function() { return { data: [] }; })
  ]);

  var cats = catRes.data || [];
  var catMap = {};
  for (var c = 0; c < cats.length; c++) catMap[cats[c]._id] = cats[c].name;

  var archives = archRes.data || [];
  var total = archives.length;
  var totalSize = 0;
  var categoryMap = {}, extMap = {};

  for (var i = 0; i < archives.length; i++) {
    var item = archives[i];
    totalSize += (item.size || 0);

    var catId = item.category || 'other';
    var catName = catMap[catId] || '其他';
    categoryMap[catName] = (categoryMap[catName] || 0) + 1;

    var ext = (item.ext || 'other').toLowerCase();
    extMap[ext] = (extMap[ext] || 0) + 1;
  }

  return {
    success: true, total: total, totalSize: totalSize,
    categoryBreakdown: categoryMap, typeBreakdown: extMap
  };
}

// AI 审稿功能已迁移至小程序端 aiRecognizer.js

// ==================== 学术动态 ====================

// 批量查询用户资料（返回 openid -> profile 映射）
async function getUserProfiles(openids) {
  var profileMap = {};
  if (!openids || openids.length === 0) return profileMap;

  var _ = db.command;
  var profileRes = await db.collection('user_config')
    .where({ _openid: _.in(openids) })
    .field({ _openid: true, 'profile.nickname': true, 'profile.avatar': true })
    .get();

  // 先收集所有 cloud:// 头像URL，批量转换成临时链接
  var cloudAvatarIds = [];
  profileRes.data.forEach(function (config) {
    var profile = config.profile || {};
    var avatar = profile.avatar || '';
    if (avatar && avatar.indexOf('cloud://') === 0 && cloudAvatarIds.indexOf(avatar) === -1) {
      cloudAvatarIds.push(avatar);
    }
  });

  var avatarUrlMap = {};
  if (cloudAvatarIds.length > 0) {
    try {
      var tempRes = await cloud.getTempFileURL({ fileList: cloudAvatarIds });
      tempRes.fileList.forEach(function (item) {
        if (item.tempFileURL) {
          avatarUrlMap[item.fileID] = item.tempFileURL;
        }
      });
    } catch (e) {
      console.error('[getUserProfiles] 转换头像临时链接失败', e);
    }
  }

  profileRes.data.forEach(function (config) {
    var profile = config.profile || {};
    var avatar = profile.avatar || '';
    // 如果 cloud:// 头像已转换成功，使用 https 临时链接
    if (avatar && avatarUrlMap[avatar]) {
      avatar = avatarUrlMap[avatar];
    }
    profileMap[config._openid] = {
      nickname: profile.nickname || '',
      avatar: avatar,
      isUrlAvatar: !!(avatar && avatar.indexOf('http') === 0)
    };
  });

  return profileMap;
}

// 从 user_config 实时查询并填充动态作者、应助者昵称和头像
async function fillPostAuthorInfo(posts) {
  if (!posts || posts.length === 0) return posts;

  var openids = [];
  posts.forEach(function (post) {
    if (post._openid && openids.indexOf(post._openid) === -1) {
      openids.push(post._openid);
    }
    if (post.helperOpenid && openids.indexOf(post.helperOpenid) === -1) {
      openids.push(post.helperOpenid);
    }
  });

  var profileMap = await getUserProfiles(openids);

  posts.forEach(function (post) {
    var profile = profileMap[post._openid] || {};
    post.nickName = profile.nickname || '';
    post.avatarUrl = profile.avatar || '';
    post.isUrlAvatar = profile.isUrlAvatar || false;

    if (post.helperOpenid) {
      var helperProfile = profileMap[post.helperOpenid] || {};
      post.helperNickName = helperProfile.nickname || '';
      post.helperAvatarUrl = helperProfile.avatar || '';
      post.helperIsUrlAvatar = helperProfile.isUrlAvatar || false;
    }
  });

  return posts;
}

// 获取动态列表（分页、筛选、排序）
async function squareGetPosts(event) {
  var page = event.page || 1;
  var pageSize = event.pageSize || 20;
  var sortBy = event.sortBy || 'recommend';
  var type = event.type || '';

  var where = { deleteTime: null };
  if (type) where.type = type;

  var orderField = 'createTime';
  var orderDir = 'desc';

  if (sortBy === 'hot') {
    orderField = 'likeCount';
    orderDir = 'desc';
  } else if (sortBy === 'latest') {
    orderField = 'createTime';
    orderDir = 'desc';
  } else {
    // recommend: 按最新发布时间排序
    orderField = 'createTime';
    orderDir = 'desc';
  }

  var skip = (page - 1) * pageSize;
  var res = await db.collection('square_posts')
    .where(where)
    .orderBy(orderField, orderDir)
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  var posts = await fillPostAuthorInfo(res.data || []);
  return { success: true, posts: posts, page: page };
}

// 获取动态详情
async function squareGetPostDetail(event) {
  var postId = event.postId;
  if (!postId) return { success: false, error: '缺少 postId' };

  var res = await db.collection('square_posts').doc(postId).get();
  var post = res.data;

  if (!post || post.deleteTime) {
    return { success: false, error: '动态不存在' };
  }

  var posts = await fillPostAuthorInfo([post]);
  return { success: true, post: posts[0] };
}

// 创建动态
async function squareCreatePost(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var type = event.type || 'discussion';
  var title = (event.title || '').trim();
  var content = (event.content || '').trim();
  var images = event.images || [];
  var tags = event.tags || [];
  var callType = event.callType || '';  // 征集类型（仅征稿通知）

  if (type !== 'literature_help' && !content) {
    return { success: false, error: '内容不能为空' };
  }

  // 频率限制：检查用户最近1分钟内发布数量
  var oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  var recentCount = await db.collection('square_posts')
    .where({
      _openid: openid,
      deleteTime: null,
      createTime: db.command.gt(formatTime(oneMinuteAgo))
    })
    .count();

  if (recentCount.total >= 3) {
    return { success: false, error: '发布过于频繁，请稍后再试' };
  }

  var now = formatTime();
  var data = {
    _openid: openid,
    type: type,
    title: title,
    content: content,
    images: images,
    tags: tags,
    callType: callType,  // 征集类型
    likeCount: 0,
    commentCount: 0,
    createTime: now,
    updateTime: now,
    deleteTime: null
  };

  // 文献互助类型：添加相关字段并冻结积分
  if (type === 'literature_help') {
    var rewardPoints = event.rewardPoints || 0;
    if (rewardPoints <= 0) {
      return { success: false, error: '悬赏积分必须大于0' };
    }

    // 检查用户积分余额
    var creditsRes = await cloud.callFunction({
      name: 'creditsAPI',
      data: { action: 'getCreditsInfo', _openid: openid }
    });
    var availablePoints = (creditsRes.result && creditsRes.result.credits) || 0;

    if (availablePoints < rewardPoints) {
      return { success: false, error: '积分余额不足' };
    }

    // 冻结积分
    var freezeRes = await cloud.callFunction({
      name: 'creditsAPI',
      data: {
        action: 'freezeCredits',
        _openid: openid,
        points: rewardPoints,
        relatedId: '',  // 暂时为空，创建动态后再更新
        description: '文献互助悬赏冻结'
      }
    });
    if (!freezeRes.result || !freezeRes.result.success) {
      return { success: false, error: freezeRes.result && freezeRes.result.error ? freezeRes.result.error : '积分冻结失败' };
    }

    data.docType = event.docType || '';
    data.docUrl = event.docUrl || '';
    data.docDoi = event.docDoi || '';
    data.docNotes = event.docNotes || '';
    data.rewardPoints = rewardPoints;
    data.helpDeadline = event.helpDeadline || '';
    data.helpStatus = event.helpStatus || '求助中';
    data.helperOpenid = '';
    data.helpSolveTime = '';
    data.docFileId = '';
  }

  var addRes = await db.collection('square_posts').add({ data: data });
  console.log('[square] 创建动态成功', addRes._id);

  // 更新冻结记录的 relatedId
  if (type === 'literature_help') {
    await db.collection('credits').where({
      _openid: openid,
      type: 'frozen',
      relatedId: ''
    }).update({
      data: { relatedId: addRes._id }
    });
  }

  return { success: true, postId: addRes._id };
}

// 更新动态
async function squareUpdatePost(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var postId = event.postId;

  if (!postId) return { success: false, error: '缺少 postId' };

  // 验证所有权
  var post = await db.collection('square_posts').doc(postId).get();
  if (!post.data || post.data._openid !== openid) {
    return { success: false, error: '无权修改他人动态' };
  }

  var updateData = { updateTime: formatTime() };
  if (event.title !== undefined) updateData.title = (event.title || '').trim();
  if (event.content !== undefined) updateData.content = (event.content || '').trim();
  if (event.images !== undefined) updateData.images = event.images;
  if (event.tags !== undefined) updateData.tags = event.tags;

  await db.collection('square_posts').doc(postId).update({ data: updateData });
  return { success: true };
}

// 删除动态（软删除）
async function squareDeletePost(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var postId = event.postId;

  if (!postId) return { success: false, error: '缺少 postId' };

  // 验证所有权
  var post = await db.collection('square_posts').doc(postId).get();
  if (!post.data || post.data._openid !== openid) {
    return { success: false, error: '无权删除他人动态' };
  }

  await db.collection('square_posts').doc(postId).update({
    data: { deleteTime: formatTime() }
  });
  return { success: true };
}

// 获取评论列表
async function squareGetComments(event) {
  var postId = event.postId;
  var page = event.page || 1;
  var pageSize = event.pageSize || 20;

  if (!postId) return { success: false, error: '缺少 postId' };

  var skip = (page - 1) * pageSize;
  var res = await db.collection('square_comments')
    .where({ postId: postId, deleteTime: null })
    .orderBy('createTime', 'asc')
    .skip(skip)
    .limit(pageSize)
    .get();

  var comments = res.data || [];

  // 收集需要查询的用户 openid（评论作者 + 父评论作者）
  var openids = [];
  var parentIds = [];
  comments.forEach(function (c) {
    if (c._openid && openids.indexOf(c._openid) === -1) {
      openids.push(c._openid);
    }
    if (c.parentId && parentIds.indexOf(c.parentId) === -1) {
      parentIds.push(c.parentId);
    }
  });

  // 查询父评论，获取父评论作者 openid
  var parentCommentMap = {};
  if (parentIds.length > 0) {
    for (var i = 0; i < parentIds.length; i++) {
      try {
        var parentRes = await db.collection('square_comments').doc(parentIds[i]).get();
        if (parentRes.data) {
          parentCommentMap[parentIds[i]] = parentRes.data;
          var parentOpenid = parentRes.data._openid;
          if (parentOpenid && openids.indexOf(parentOpenid) === -1) {
            openids.push(parentOpenid);
          }
        }
      } catch (e) {
        // 父评论可能已被删除
      }
    }
  }

  // 从 user_config 实时查询用户资料
  var profileMap = await getUserProfiles(openids);

  comments.forEach(function (c) {
    var profile = profileMap[c._openid] || {};
    c.nickName = profile.nickname || '';
    c.avatarUrl = profile.avatar || '';
    c.isUrlAvatar = profile.isUrlAvatar || false;

    // 实时填充回复目标昵称
    if (c.parentId && parentCommentMap[c.parentId]) {
      var parentOpenid = parentCommentMap[c.parentId]._openid;
      var parentProfile = profileMap[parentOpenid] || {};
      c.replyToNickName = parentProfile.nickname || '';
    } else {
      c.replyToNickName = '';
    }
  });

  return { success: true, comments: comments, page: page };
}

// 发表评论
async function squareCreateComment(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var postId = event.postId;
  var content = (event.content || '').trim();
  var imageUrl = event.imageUrl || '';
  var parentId = event.parentId || null;

  if (!postId) return { success: false, error: '缺少 postId' };
  if (!content && !imageUrl) return { success: false, error: '评论内容不能为空' };
  if (content.length > 500) return { success: false, error: '评论内容不能超过500字' };

  var now = formatTime();
  var data = {
    _openid: openid,
    postId: postId,
    content: content,
    imageUrl: imageUrl,
    parentId: parentId,
    likeCount: 0,
    createTime: now,
    deleteTime: null
  };

  var addRes = await db.collection('square_comments').add({ data: data });

  // 更新动态的评论计数
  await db.collection('square_posts').doc(postId).update({
    data: {
      commentCount: db.command.inc(1),
      updateTime: now
    }
  });

  console.log('[square] 创建评论成功', addRes._id);
  return { success: true, commentId: addRes._id };
}

// 删除评论
async function squareDeleteComment(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var commentId = event.commentId;

  if (!commentId) return { success: false, error: '缺少 commentId' };

  // 验证所有权
  var comment = await db.collection('square_comments').doc(commentId).get();
  if (!comment.data || comment.data._openid !== openid) {
    return { success: false, error: '无权删除他人评论' };
  }

  await db.collection('square_comments').doc(commentId).update({
    data: { deleteTime: formatTime() }
  });

  // 更新动态的评论计数
  if (comment.data && comment.data.postId) {
    await db.collection('square_posts').doc(comment.data.postId).update({
      data: { commentCount: db.command.inc(-1) }
    });
  }

  return { success: true };
}

// 点赞/取消点赞
async function squareToggleLike(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var postId = event.postId;
  var commentId = event.commentId;
  var isLiked = event.isLiked !== undefined ? event.isLiked : true;

  var targetTable = postId ? 'square_posts' : (commentId ? 'square_comments' : null);
  var targetId = postId || commentId;
  var likeField = postId ? 'postId' : 'commentId';

  if (!targetTable || !targetId) {
    return { success: false, error: '缺少 targetId' };
  }

  if (isLiked) {
    // 点赞：先检查是否已经点赞（幂等）
    var existing = await db.collection('square_likes')
      .where({ _openid: openid, [likeField]: targetId })
      .limit(1)
      .get();

    if (existing.data.length === 0) {
      await db.collection('square_likes').add({
        data: {
          _openid: openid,
          [likeField]: targetId,
          createTime: formatTime()
        }
      });

      // 更新计数
      await db.collection(targetTable).doc(targetId).update({
        data: { likeCount: db.command.inc(1) }
      });
    }
  } else {
    // 取消点赞
    var likeRes = await db.collection('square_likes')
      .where({ _openid: openid, [likeField]: targetId })
      .limit(1)
      .get();

    if (likeRes.data.length > 0) {
      await db.collection('square_likes').doc(likeRes.data[0]._id).remove();

      await db.collection(targetTable).doc(targetId).update({
        data: { likeCount: db.command.inc(-1) }
      });
    }
  }

  return { success: true };
}

// 批量获取点赞状态
async function squareGetLikeStatus(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var postIds = event.postIds || [];
  var commentIds = event.commentIds || [];

  var likeMap = {};

  // 查询动态点赞状态
  if (postIds.length > 0) {
    var res = await db.collection('square_likes')
      .where({
        _openid: openid,
        postId: db.command.in(postIds)
      })
      .get();

    for (var i = 0; i < (res.data || []).length; i++) {
      likeMap[res.data[i].postId] = true;
    }
  }

  // 查询评论点赞状态
  if (commentIds.length > 0) {
    var commentRes = await db.collection('square_likes')
      .where({
        _openid: openid,
        commentId: db.command.in(commentIds)
      })
      .get();

    for (var j = 0; j < (commentRes.data || []).length; j++) {
      likeMap[commentRes.data[j].commentId] = true;
    }
  }

  return { success: true, likeMap: likeMap };
}

// ==================== 收藏功能 ====================

// 收藏/取消收藏
async function squareToggleFavorite(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var postId = event.postId;
  var isFavorite = event.isFavorite !== undefined ? event.isFavorite : true;

  if (!postId) return { success: false, error: '缺少 postId' };

  if (isFavorite) {
    // 收藏：先检查是否已收藏（幂等）
    var existing = await db.collection('square_favorites')
      .where({ _openid: openid, postId: postId })
      .limit(1)
      .get();

    if (existing.data.length === 0) {
      await db.collection('square_favorites').add({
        data: {
          _openid: openid,
          postId: postId,
          createTime: formatTime()
        }
      });
    }
  } else {
    // 取消收藏
    var favRes = await db.collection('square_favorites')
      .where({ _openid: openid, postId: postId })
      .limit(1)
      .get();

    if (favRes.data.length > 0) {
      await db.collection('square_favorites').doc(favRes.data[0]._id).remove();
    }
  }

  return { success: true };
}

// 批量获取收藏状态
async function squareGetFavoriteStatus(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var postIds = event.postIds || [];

  var favMap = {};

  if (postIds.length > 0) {
    var res = await db.collection('square_favorites')
      .where({
        _openid: openid,
        postId: db.command.in(postIds)
      })
      .get();

    for (var i = 0; i < (res.data || []).length; i++) {
      favMap[res.data[i].postId] = true;
    }
  }

  return { success: true, favMap: favMap };
}

// 获取用户收藏列表（分页）
async function squareGetFavorites(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var page = event.page || 1;
  var pageSize = event.pageSize || 20;

  var skip = (page - 1) * pageSize;
  var favRes = await db.collection('square_favorites')
    .where({ _openid: openid })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  var favorites = favRes.data || [];
  var postIds = favorites.map(function(f) { return f.postId; });

  // 查询对应的动态
  var posts = [];
  if (postIds.length > 0) {
    for (var i = 0; i < postIds.length; i++) {
      try {
        var postRes = await db.collection('square_posts').doc(postIds[i]).get();
        if (postRes.data && !postRes.data.deleteTime) {
          posts.push(postRes.data);
        }
      } catch (e) {
        // 动态可能已被删除
      }
    }
  }

  posts = await fillPostAuthorInfo(posts);
  return { success: true, posts: posts, page: page };
}

// 获取用户点赞的帖子列表
async function squareGetMyLiked(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var page = event.page || 1;
  var pageSize = event.pageSize || 20;

  var skip = (page - 1) * pageSize;
  var likeRes = await db.collection('square_likes')
    .where({ _openid: openid, postId: db.command.exists(true) })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  var likes = likeRes.data || [];
  var postIds = likes.map(function(l) { return l.postId; });

  var posts = [];
  if (postIds.length > 0) {
    for (var i = 0; i < postIds.length; i++) {
      try {
        var postRes = await db.collection('square_posts').doc(postIds[i]).get();
        if (postRes.data && !postRes.data.deleteTime) {
          posts.push(postRes.data);
        }
      } catch (e) {}
    }
  }

  posts = await fillPostAuthorInfo(posts);
  return { success: true, posts: posts, page: page };
}

// 获取用户参与评论的帖子列表
async function squareGetMyCommented(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var page = event.page || 1;
  var pageSize = event.pageSize || 20;

  var skip = (page - 1) * pageSize;
  var commentRes = await db.collection('square_comments')
    .where({ _openid: openid })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  var comments = commentRes.data || [];

  // 按 postId 去重
  var postIdSet = {};
  var dedupedPostIds = [];
  for (var i = 0; i < comments.length; i++) {
    var pid = comments[i].postId;
    if (pid && !postIdSet[pid]) {
      postIdSet[pid] = true;
      dedupedPostIds.push(pid);
    }
  }

  var posts = [];
  if (dedupedPostIds.length > 0) {
    for (var i = 0; i < dedupedPostIds.length; i++) {
      try {
        var postRes = await db.collection('square_posts').doc(dedupedPostIds[i]).get();
        if (postRes.data && !postRes.data.deleteTime) {
          posts.push(postRes.data);
        }
      } catch (e) {}
    }
  }

  posts = await fillPostAuthorInfo(posts);
  return { success: true, posts: posts, page: page };
}

// 获取用户发布的帖子列表
async function squareGetMyPosts(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var page = event.page || 1;
  var pageSize = event.pageSize || 20;

  var skip = (page - 1) * pageSize;
  var postRes = await db.collection('square_posts')
    .where({ _openid: openid, deleteTime: null })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  var posts = await fillPostAuthorInfo(postRes.data || []);
  return { success: true, posts: posts, page: page };
}

// ==================== 文献互助相关函数 ====================

// 应助文献求助
async function squareHelpRespond(event) {
  var wxContext = cloud.getWXContext();
  var helperOpenid = wxContext.OPENID;
  var postId = event.postId;
  var fileID = event.fileID;
  var fileName = event.fileName || '';

  if (!postId || !fileID) {
    return { success: false, error: '参数不完整' };
  }

  // 获取动态详情
  var postRes = await db.collection('square_posts').doc(postId).get();
  var post = postRes.data;

  if (!post) {
    return { success: false, error: '动态不存在' };
  }

  if (post.type !== 'literature_help') {
    return { success: false, error: '该动态不是文献互助类型' };
  }

  if (post.helpStatus !== '求助中') {
    return { success: false, error: '该求助不在求助中状态' };
  }

  if (post._openid === helperOpenid) {
    return { success: false, error: '不能应助自己的求助' };
  }

  var now = formatTime();

  // 更新动态状态
  await db.collection('square_posts').doc(postId).update({
    data: {
      helpStatus: '已解决',
      helperOpenid: helperOpenid,
      helpSolveTime: now,
      docFileId: fileID,
      docFileName: fileName,
      updateTime: now
    }
  });

  // 转移积分给应助者
  var transferResult = null;
  try {
    transferResult = await cloud.callFunction({
      name: 'creditsAPI',
      data: {
        action: 'transferCredits',
        fromOpenid: post._openid,
        toOpenid: helperOpenid,
        points: post.rewardPoints,
        relatedId: postId,
        description: '文献互助应助奖励'
      }
    });
    console.log('[squareHelpRespond] 积分转移结果:', JSON.stringify(transferResult.result));
    if (!transferResult.result || !transferResult.result.success) {
      console.error('[squareHelpRespond] 积分转移返回失败:', transferResult.result);
    }
  } catch (err) {
    console.error('[squareHelpRespond] 积分转移调用异常:', err.message || err, 'postId:', postId);
    // 积分转移失败，记录日志，但不影响应助完成
  }

  return { success: true, transferResult: transferResult && transferResult.result };
}

// 修复已完成的文献互助积分转移（幂等安全，可重复调用）
async function fixCreditTransfer(event) {
  var postId = event.postId;

  if (!postId) {
    return { success: false, error: '缺少 postId' };
  }

  // 获取动态详情
  var postRes = await db.collection('square_posts').doc(postId).get();
  var post = postRes.data;

  if (!post) {
    return { success: false, error: '动态不存在' };
  }

  if (post.type !== 'literature_help') {
    return { success: false, error: '该动态不是文献互助类型' };
  }

  if (post.helpStatus !== '已解决') {
    return { success: false, error: '该求助尚未解决，无法修复积分转移' };
  }

  if (!post.helperOpenid) {
    return { success: false, error: '未找到应助者信息' };
  }

  // 调用 transferCredits（已有幂等保护：不会重复扣减或重复奖励）
  var transferRes = await cloud.callFunction({
    name: 'creditsAPI',
    data: {
      action: 'transferCredits',
      fromOpenid: post._openid,
      toOpenid: post.helperOpenid,
      points: post.rewardPoints,
      relatedId: postId,
      description: '文献互助应助奖励'
    }
  });

  return {
    success: true,
    transferResult: transferRes.result,
    message: '积分转移修复完成'
  };
}

// 批量修复所有已解决但缺少 spend 记录的文献互助积分
async function repairAllHelpCredits() {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  // 查找该用户所有 type=literature_help 且 helpStatus=已解决 的帖子
  var postRes = await db.collection('square_posts')
    .where({
      _openid: openid,
      type: 'literature_help',
      helpStatus: '已解决',
      deleteTime: null
    })
    .field({ _id: true, helperOpenid: true, rewardPoints: true })
    .get();

  var posts = postRes.data || [];
  var fixed = 0;
  var skipped = 0;

  for (var i = 0; i < posts.length; i++) {
    var post = posts[i];
    if (!post.helperOpenid) continue;

    // 检查是否已有 spend 记录
    var spendRes = await db.collection('credits')
      .where({
        _openid: openid,
        type: 'spend',
        action: 'help_reward',
        relatedId: post._id
      })
      .limit(1)
      .get();

    if (spendRes.data && spendRes.data.length > 0) {
      skipped++;
      continue;
    }

    // 没有 spend 记录，调用 transferCredits 修复
    try {
      await cloud.callFunction({
        name: 'creditsAPI',
        data: {
          action: 'transferCredits',
          fromOpenid: openid,
          toOpenid: post.helperOpenid,
          points: post.rewardPoints,
          relatedId: post._id,
          description: '文献互助应助奖励'
        }
      });
      fixed++;
    } catch (err) {
      console.error('[repairAllHelpCredits] 修复失败', post._id, err);
    }
  }

  return {
    success: true,
    fixed: fixed,
    skipped: skipped,
    total: posts.length,
    message: '修复完成：' + fixed + '条，跳过' + skipped + '条'
  };
}

// 延长求助时限
async function squareExtendDeadline(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var postId = event.postId;
  var extendDays = event.extendDays || 1;

  if (!postId) {
    return { success: false, error: '缺少 postId' };
  }

  // 获取动态详情
  var postRes = await db.collection('square_posts').doc(postId).get();
  var post = postRes.data;

  if (!post) {
    return { success: false, error: '动态不存在' };
  }

  if (post._openid !== openid) {
    return { success: false, error: '无权操作他人求助' };
  }

  if (post.type !== 'literature_help') {
    return { success: false, error: '该动态不是文献互助类型' };
  }

  if (post.helpStatus !== '已过期') {
    return { success: false, error: '只能延长已过期求助的时限' };
  }

  // 计算新的截止时间
  var currentDeadline = new Date(post.helpDeadline.replace(/-/g, '/'));
  var newDeadline = new Date(currentDeadline.getTime() + extendDays * 24 * 60 * 60 * 1000);
  var newDeadlineStr = formatTime(newDeadline).split(' ')[0];  // 只取日期部分

  // 更新动态状态
  await db.collection('square_posts').doc(postId).update({
    data: {
      helpStatus: '求助中',
      helpDeadline: newDeadlineStr,
      updateTime: formatTime()
    }
  });

  return { success: true, newDeadline: newDeadlineStr };
}

// 检查并标记过期的求助（定时触发器调用）
async function squareCheckHelpExpiry() {
  var now = formatTime();
  var nowDate = now.split(' ')[0];  // 当前日期 YYYY-MM-DD

  // 查询所有求助中且截止日期小于今天的动态
  var postRes = await db.collection('square_posts')
    .where({
      type: 'literature_help',
      helpStatus: '求助中',
      deleteTime: null
    })
    .get();

  var expiredPosts = [];
  for (var i = 0; i < postRes.data.length; i++) {
    var post = postRes.data[i];
    var deadline = (post.helpDeadline || '').split(' ')[0];

    if (deadline && deadline < nowDate) {
      expiredPosts.push(post);
    }
  }

  // 批量更新过期状态并退还积分
  var updated = 0;
  for (var j = 0; j < expiredPosts.length; j++) {
    var expiredPost = expiredPosts[j];

    try {
      // 更新状态为已过期
      await db.collection('square_posts').doc(expiredPost._id).update({
        data: {
          helpStatus: '已过期',
          updateTime: formatTime()
        }
      });

      // 退还冻结积分
      await cloud.callFunction({
        name: 'creditsAPI',
        data: {
          action: 'refundFrozenCredits',
          relatedId: expiredPost._id,
          description: '文献互助过期退还'
        }
      });

      updated++;
    } catch (err) {
      console.error('[square] 处理过期求助失败', expiredPost._id, err);
    }
  }

  return { success: true, checked: expiredPosts.length, updated: updated };
}

// ==================== 工具函数 ====================

// ==================== 入口 ====================



exports.main = async (event) => {
  try {
    // 检测是否为定时触发器调用
    var isTimerTrigger = event && (event.Type === 'timer' || event.triggeredBy === 'timer');

    // 如果是定时触发器，执行过期检查
    if (isTimerTrigger) {
      return await squareCheckHelpExpiry();
    }

    switch (event.action) {
      case 'getAllTools':       return await getAllTools();
      case 'migrateTools':      return await migrateTools();
      case 'cleanUserTools':    return await cleanUserTools();
      case 'getUserId':         return await getUserId();
      case 'getUserConfig':   return await getUserConfig();
      case 'saveUserConfig':  return await saveUserConfig(event);
      case 'getUserTools':    return await getUserTools();
      case 'toggleUserTool':  return await toggleUserTool(event);
      case 'saveUserTools':   return await saveUserTools(event);
      case 'submissionStats':       return await submissionStats(event);
      case 'reviewStats':           return await reviewStats(event);
      case 'conferenceStats':       return await conferenceStats(event);
      case 'submissionStatsDetail': return await submissionStatsDetail(event);
      case 'reviewStatsDetail':     return await reviewStatsDetail(event);
      case 'conferenceStatsDetail': return await conferenceStatsDetail(event);
      case 'archiveStatsDetail':    return await archiveStatsDetail(event);
      case 'fixCompleted':         return await fixCompleted();
      // 学术动态
      case 'squareGetPosts':       return await squareGetPosts(event);
      case 'squareGetPostDetail':  return await squareGetPostDetail(event);
      case 'squareCreatePost':     return await squareCreatePost(event);
      case 'squareUpdatePost':     return await squareUpdatePost(event);
      case 'squareDeletePost':     return await squareDeletePost(event);
      case 'squareGetComments':    return await squareGetComments(event);
      case 'squareCreateComment':  return await squareCreateComment(event);
      case 'squareDeleteComment':  return await squareDeleteComment(event);
      case 'squareToggleLike':     return await squareToggleLike(event);
      case 'squareGetLikeStatus':  return await squareGetLikeStatus(event);
      // 收藏
      case 'squareToggleFavorite':      return await squareToggleFavorite(event);
      case 'squareGetFavoriteStatus':   return await squareGetFavoriteStatus(event);
      case 'squareGetFavorites':        return await squareGetFavorites(event);
      case 'squareGetMyLiked':          return await squareGetMyLiked(event);
      case 'squareGetMyCommented':      return await squareGetMyCommented(event);
      case 'squareGetMyPosts':          return await squareGetMyPosts(event);
      // 文献互助
      case 'squareHelpRespond':         return await squareHelpRespond(event);
      case 'squareExtendDeadline':     return await squareExtendDeadline(event);
      case 'squareCheckHelpExpiry':    return await squareCheckHelpExpiry();
      case 'fixCreditTransfer':         return await fixCreditTransfer(event);
      case 'repairAllHelpCredits':      return await repairAllHelpCredits();
      default:                return { error: '未知操作: ' + (event.action || 'empty') };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
};
