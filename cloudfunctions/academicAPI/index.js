// cloudfunctions/academicAPI/index.js
// 职责：业务接口（用户配置、工具开关等）
// 每个方法独立，通过 action 参数调用

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 把数据库字段（字符串或 Date 对象）安全提取为 YYYY-MM-DD（北京时间）
function extractDateStr(val) {
  if (!val) return '';
  var d = val instanceof Date ? new Date(val.getTime() + 8 * 60 * 60 * 1000) : new Date(val);
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
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

// AI 审稿功能已迁移至小程序端 aiRecognizer.js

// ==================== 学术动态 ====================

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

  return { success: true, posts: res.data || [], page: page };
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

  return { success: true, post: post };
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
  var avatarUrl = event.avatarUrl || '';
  var nickName = event.nickName || '';

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
    avatarUrl: avatarUrl,
    nickName: nickName,
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
    data.helperAvatarUrl = '';
    data.helperNickName = '';
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

  return { success: true, comments: res.data || [], page: page };
}

// 发表评论
async function squareCreateComment(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var postId = event.postId;
  var content = (event.content || '').trim();
  var parentId = event.parentId || null;
  var avatarUrl = event.avatarUrl || '';
  var nickName = event.nickName || '';

  if (!postId) return { success: false, error: '缺少 postId' };
  if (!content) return { success: false, error: '评论内容不能为空' };
  if (content.length > 500) return { success: false, error: '评论内容不能超过500字' };

  // 获取父评论信息（回复时）
  var replyToNickName = '';
  if (parentId) {
    var parentRes = await db.collection('square_comments').doc(parentId).get();
    if (parentRes.data) {
      replyToNickName = parentRes.data.nickName || '';
    }
  }

  var now = formatTime();
  var data = {
    _openid: openid,
    postId: postId,
    content: content,
    parentId: parentId,
    avatarUrl: avatarUrl,
    nickName: nickName,
    replyToNickName: replyToNickName,
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

  var posts = postRes.data || [];
  return { success: true, posts: posts, page: page };
}

// ==================== 文献互助相关函数 ====================

// 应助文献求助
async function squareHelpRespond(event) {
  var wxContext = cloud.getWXContext();
  var helperOpenid = wxContext.OPENID;
  var postId = event.postId;
  var fileID = event.fileID;

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
      updateTime: now
    }
  });

  // 获取应助者信息
  var helperInfo = await db.collection('user_config').where({ _openid: helperOpenid }).limit(1).get();
  var helperAvatarUrl = '';
  var helperNickName = '';

  if (helperInfo.data && helperInfo.data.length > 0) {
    // 从用户的朋友圈或其他地方获取头像昵称
    // 这里简化处理，使用默认值
  }

  // 转移积分给应助者
  try {
    await cloud.callFunction({
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
  } catch (err) {
    console.error('[square] 积分转移失败', err);
    // 积分转移失败，记录日志，但不影响应助完成
  }

  // 更新应助者信息到动态
  await db.collection('square_posts').doc(postId).update({
    data: {
      helperAvatarUrl: helperAvatarUrl,
      helperNickName: helperNickName
    }
  });

  return { success: true };
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
      case 'submissionStats': return await submissionStats(event);
      case 'reviewStats':     return await reviewStats(event);
      case 'conferenceStats': return await conferenceStats(event);
      case 'fixCompleted':   return await fixCompleted();
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
      default:                return { error: '未知操作: ' + (event.action || 'empty') };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
};
