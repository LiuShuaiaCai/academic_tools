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
  var total = 0, active = 0, urgent = 0;
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    // total: 全部计数，不过滤 completed
    total++;
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
  console.log('[conferenceStats] keyword=' + keyword + ' total=' + total + ' active=' + active + ' urgent=' + urgent);
  return { success: true, total: total, active: active, urgent: urgent };
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

// ==================== 工具函数 ====================

// ==================== 入口 ====================



exports.main = async (event) => {
  try {
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
      default:                return { error: '未知操作: ' + (event.action || 'empty') };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
};
