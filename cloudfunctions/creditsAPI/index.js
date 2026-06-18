// cloudfunctions/creditsAPI/index.js
// 职责：积分系统（获取、消耗、签到、统计、过期清理）
// 每个方法独立，通过 action 参数调用

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 格式化时间 YYYY-MM-DD HH:mm:ss（北京时间）
function formatTime(date) {
  var d = date ? new Date(date) : new Date();
  var beijing = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return beijing.getUTCFullYear() + '-' + pad(beijing.getUTCMonth() + 1) + '-' + pad(beijing.getUTCDate()) + ' ' + pad(beijing.getUTCHours()) + ':' + pad(beijing.getUTCMinutes()) + ':' + pad(beijing.getUTCSeconds());
}

// 计算过期时间（当前时间 + 1年，北京时间）
function getExpireTime() {
  var now = new Date();
  var beijing = new Date(now.getTime() + 8 * 3600000);
  var expireDate = new Date(beijing.getFullYear() + 1, beijing.getMonth(), beijing.getDate());
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return expireDate.getFullYear() + '-' + pad(expireDate.getMonth() + 1) + '-' + pad(expireDate.getDate()) + ' 23:59:59';
}

// 获取北京时间日期字符串 YYYY-MM-DD
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

// ==================== 积分规则常量 ====================

var CREDITS_RULES = {
  register_bonus: 100,
  daily_signin: 10,
  continuous_signin_days: 7,
  continuous_bonus: 50,
  invite_reward: 20,
  friend_first_use: 0,
  ai_review: 20,
  new_submission: 0,
  new_review: 0,
  new_conference: 0,
  complete_profile: 50,
  special_issue: 30
};

// 学术相关emoji头像
var AVATAR_EMOJIS = ['🎓', '📚', '🔬', '🧪', '📖', '💡', '🧬', '📊', '🎯', '🏆', '📝', '🧠'];

// 随机学术名称
var ACADEMIC_NAMES = [
  '学术探索者', '科研小将', 'Dr. 学研者', '论文写手', '学术新星',
  '知识追求者', '研究追梦人', '学术小达人', '创新思考者', '学术追光者',
  '知识探险家', '学术筑梦人', '科研小能手', '学术小精灵', '研究小行家'
];

// 随机获取
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 积分动作描述映射
var ACTION_LABELS = {
  register_bonus: '注册赠送',
  daily_signin: '每日签到',
  continuous_bonus: '连续签到奖励',
  invite_reward: '邀请好友',
  friend_first_use: '好友首次使用',
  ai_review: 'AI审稿',
  new_submission: '新增投稿',
  new_review: '新增审稿',
  new_conference: '新增会议',
  complete_profile: '完善资料',
  special_issue: '特刊策划'
};

// 获取今日日期字符串 YYYY-MM-DD（北京时间）
function getTodayStr() {
  return getBeijingDateStr();
}

// ==================== 核心方法 ====================

// 初始化新用户积分（赠送100积分，仅首次调用）
async function initCredits(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  // 检查是否已初始化
  var config = await findRecord('user_config', { _openid: openid });
  if (config && config.credits !== undefined) {
    return { success: true, initialized: false, credits: config.credits, profile: config.profile || null };
  }

  var points = CREDITS_RULES.register_bonus;
  var now = formatTime();

  // 生成默认头像和名称
  var defaultAvatar = getRandomItem(AVATAR_EMOJIS);
  var defaultNickname = getRandomItem(ACADEMIC_NAMES);

  // 更新 user_config
  var configData = {
    credits: points,
    signinDays: 0,
    continuousDays: 0,
    lastSigninDate: '',
    inviteCount: 0,
    profile: {
      avatar: defaultAvatar,
      nickname: defaultNickname,
      email: '',
      orcid: '',
      hIndex: '',
      hIndexUrl: '',
      homepage: '',
      title: '',
      researchField: '',
      institution: '',
      country: '',
      province: '',
      city: '',
      profileCompleted: false
    }
  };

  if (config) {
    await db.collection('user_config').doc(config._id).update({ data: configData });
  } else {
    configData.createTime = now;
    configData.deleteTime = null;
    await db.collection('user_config').add({ data: Object.assign({ _openid: openid }, configData) });
  }

  // 写入积分流水（注册赠送永久有效，不设置过期时间）
  await db.collection('credits').add({
    data: {
      _openid: openid,
      type: 'earn',
      action: 'register_bonus',
      points: points,
      remainPoints: points,  // 初始剩余积分 = 原始积分
      balance: points,
      description: '注册赠送 +' + points + '（永久有效）',
      createTime: now,
      updateTime: now,
      expireTime: null,
      deleteTime: null
    }
  });

  return { 
    success: true, 
    initialized: true, 
    credits: points,
    defaultAvatar: defaultAvatar,
    defaultNickname: defaultNickname
  };
}

// 获取积分信息（余额 + 签到状态）
async function getCreditsInfo(event) {
  var wxContext = cloud.getWXContext();
  var openid = (event && event._openid) || wxContext.OPENID;

  var config = await findRecord('user_config', { _openid: openid });
  var todayStr = getTodayStr();

  // 计算有效积分（排除已过期和已删除的积分）
  var validCredits = await calculateValidCredits(openid);

  var continuousDays = (config && config.continuousDays) || 0;
  var lastDate = config && config.lastSigninDate;

  // 实时判断连续签到是否已断：只有昨天或今天签过才算连续
  if (lastDate) {
    var last = new Date(lastDate + 'T00:00:00');
    var yesterday = new Date(todayStr + 'T00:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    var isYesterday = last.getTime() === yesterday.getTime();
    var isToday = lastDate === todayStr;
    if (!isYesterday && !isToday) {
      continuousDays = 0;
    }
  } else {
    continuousDays = 0;
  }

  // 如果 config.credits 与实时计算不一致，自动修正
  if (config && config.credits !== validCredits) {
    console.log('[getCreditsInfo] 积分不一致，自动修正: config.credits=' + config.credits + ' → validCredits=' + validCredits);
    await db.collection('user_config').doc(config._id).update({
      data: { credits: validCredits, updateTime: formatTime() }
    });
  }

  var result = {
    success: true,
    credits: validCredits,
    signinDays: (config && config.signinDays) || 0,
    continuousDays: continuousDays,
    signedToday: (config && config.lastSigninDate) === todayStr
  };
  console.log('[getCreditsInfo] 返回数据:', JSON.stringify(result));
  return result;
}

// 计算有效积分
// remainPoints 已反映消费扣减和过期清零，直接累加即可，无需再减 spend/expire
async function calculateValidCredits(openid) {
  var nowWithTime = getBeijingDateStr() + ' 23:59:59';

  // 查询所有收入积分（未删除且 type=earn）
  var earnRes = await db.collection('credits')
    .where({
      _openid: openid,
      deleteTime: null,
      type: 'earn'
    })
    .field({
      points: true,
      remainPoints: true,
      expireTime: true
    })
    .get();

  // 计算有效积分：Σ(remainPoints)，排除已过期的
  // remainPoints 在 spendCredits 扣减时已减少，在 cleanExpiredCredits 清零时已归零
  console.log('[calculateValidCredits] openid:', openid, '符合条件的记录数:', earnRes.data.length);
  var totalEarn = 0;
  for (var i = 0; i < earnRes.data.length; i++) {
    var item = earnRes.data[i];
    console.log('[calculateValidCredits] 记录' + i + ': points=' + item.points + ', remainPoints=' + item.remainPoints + ', expireTime=' + item.expireTime);
    if (!item.expireTime || item.expireTime >= nowWithTime) {
      var remain = item.remainPoints !== undefined ? item.remainPoints : (item.points || 0);
      console.log('[calculateValidCredits] 记录' + i + ': 有效, remain=' + remain + ', 累加后 totalEarn=' + (totalEarn + remain));
      totalEarn += remain;
    } else {
      console.log('[calculateValidCredits] 记录' + i + ': 已过期, 跳过');
    }
  }
  console.log('[calculateValidCredits] 最终有效积分:', totalEarn);

  return Math.max(0, totalEarn);
}

// 执行签到
async function doSignin() {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var todayStr = getTodayStr();
  var now = formatTime();
  var expireTime = getExpireTime();

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
      continuousDays = 1;
    }
  } else {
    continuousDays = 1;
  }
  signinDays++;

  // 计算积分
  var basePoints = CREDITS_RULES.daily_signin;
  var bonusPoints = 0;
  var bonusDescription = '';

  // 连续签到7天额外奖励50积分，周期循环
  if (continuousDays >= CREDITS_RULES.continuous_signin_days) {
    var remainder = continuousDays % CREDITS_RULES.continuous_signin_days;
    if (remainder === 0) {
      // 刚好第7天（或14、21...）：发奖励，显示7
      bonusPoints = CREDITS_RULES.continuous_bonus;
      bonusDescription = '连续签到7天 +' + bonusPoints;
      continuousDays = CREDITS_RULES.continuous_signin_days;
    } else {
      // 超过7天（如第8天）：重置为余数，显示1
      continuousDays = remainder;
    }
  }

  var totalPoints = basePoints + bonusPoints;
  var currentValidCredits = await calculateValidCredits(openid);
  var newBalance = currentValidCredits + totalPoints;

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

  // 写入基础签到流水（一年有效期）
  await db.collection('credits').add({
    data: {
      _openid: openid,
      type: 'earn',
      action: 'daily_signin',
      points: basePoints,
      remainPoints: basePoints,  // 初始剩余积分 = 原始积分
      balance: newBalance,
      description: '每日签到 +' + basePoints,
      createTime: now,
      updateTime: now,
      expireTime: expireTime,
      deleteTime: null
    }
  });

  // 写入连续签到奖励流水（一年有效期）
  if (bonusPoints > 0) {
    await db.collection('credits').add({
      data: {
        _openid: openid,
        type: 'earn',
        action: 'continuous_bonus',
        points: bonusPoints,
        remainPoints: bonusPoints,  // 初始剩余积分 = 原始积分
        balance: newBalance,
        description: bonusDescription,
        createTime: now,
        updateTime: now,
        expireTime: expireTime,
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
    bonusPoints: bonusPoints,
    gotContinuousBonus: bonusPoints > 0
  };
}

// 完善资料（首次完善奖励50积分）
async function completeProfile(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var now = formatTime();
  var expireTime = getExpireTime();

  var profileData = event.profile || {};
  var config = await findRecord('user_config', { _openid: openid });
  if (!config) {
    return { success: false, error: '用户未初始化' };
  }

  var currentProfile = config.profile || {};
  var alreadyCompleted = currentProfile.profileCompleted || false;

  // 合并资料
  var newProfile = Object.assign({}, currentProfile, {
    avatar: profileData.avatar || currentProfile.avatar || '',
    nickname: profileData.nickname || currentProfile.nickname || '',
    email: profileData.email || '',
    orcid: profileData.orcid || '',
    hIndex: profileData.hIndex || '',
    hIndexUrl: profileData.hIndexUrl || '',
    homepage: profileData.homepage || '',
    title: profileData.title || '',
    researchField: profileData.researchField || '',
    institution: profileData.institution || '',
    country: profileData.country || '',
    province: profileData.province || '',
    city: profileData.city || '',
    profileCompleted: true,
    profileUpdatedTime: now
  });

  var result = { success: true, profile: newProfile };

  // 首次完善资料，奖励50积分
  if (!alreadyCompleted) {
    var bonusPoints = CREDITS_RULES.complete_profile;
    var currentValidCredits = await calculateValidCredits(openid);
    var newBalance = currentValidCredits + bonusPoints;

    await db.collection('user_config').doc(config._id).update({
      data: {
        profile: newProfile,
        credits: newBalance,
        updateTime: now
      }
    });

    // 写入积分流水（一年有效期）
    await db.collection('credits').add({
      data: {
        _openid: openid,
        type: 'earn',
        action: 'complete_profile',
        points: bonusPoints,
        remainPoints: bonusPoints,  // 初始剩余积分 = 原始积分
        balance: newBalance,
        description: '完善资料 +' + bonusPoints + '（有效期至' + expireTime.split(' ')[0] + '）',
        createTime: now,
        updateTime: now,
        expireTime: expireTime,
        deleteTime: null
      }
    });

    result.earnedPoints = bonusPoints;
    result.credits = newBalance;
    result.firstTime = true;
  } else {
    // 非首次，只更新资料
    await db.collection('user_config').doc(config._id).update({
      data: {
        profile: newProfile,
        updateTime: now
      }
    });
    result.credits = config.credits;
    result.firstTime = false;
  }

  return result;
}

// 获取用户资料
async function getUserProfile() {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  var config = await findRecord('user_config', { _openid: openid });
  if (!config) {
    return { success: false, error: '用户未初始化' };
  }

  return {
    success: true,
    profile: config.profile || null,
    credits: config.credits || 0
  };
}

// 部分更新用户资料（不触发积分奖励，不覆盖未传字段）
async function updateProfile(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var now = formatTime();

  var profileData = event.profile || {};
  var config = await findRecord('user_config', { _openid: openid });
  if (!config) {
    return { success: false, error: '用户未初始化' };
  }

  // 只更新传入的字段，避免覆盖已有资料
  var updateData = { updateTime: now };
  for (var key in profileData) {
    if (profileData.hasOwnProperty(key)) {
      updateData['profile.' + key] = profileData[key];
    }
  }

  await db.collection('user_config').doc(config._id).update({
    data: updateData
  });

  return { success: true };
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
      expireTime: item.expireTime ? item.expireTime.split(' ')[0] : '',
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

// 获取月度积分统计
async function getCreditsStats(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  // 获取当前北京时间年月
  var now = new Date();
  var beijing = new Date(now.getTime() + 8 * 3600000);
  var year = beijing.getFullYear();
  var month = beijing.getMonth() + 1;
  var monthStr = String(month).padStart(2, '0');

  // 本月起始和结束时间
  var monthStart = year + '-' + monthStr + '-01 00:00:00';
  var nextMonth = month === 12 ? 1 : month + 1;
  var nextYear = month === 12 ? year + 1 : year;
  var monthEnd = nextYear + '-' + String(nextMonth).padStart(2, '0') + '-01 00:00:00';

  var _ = db.command;

  // 查询本月收入
  var earnRes = await db.collection('credits')
    .where({
      _openid: openid,
      deleteTime: null,
      type: 'earn',
      createTime: _.and(_.gte(monthStart), _.lt(monthEnd))
    })
    .get();

  // 查询本月支出
  var spendRes = await db.collection('credits')
    .where({
      _openid: openid,
      deleteTime: null,
      type: 'spend',
      createTime: _.and(_.gte(monthStart), _.lt(monthEnd))
    })
    .get();

  // 计算收入和支出
  var monthEarn = 0, monthSpend = 0;
  for (var i = 0; i < earnRes.data.length; i++) {
    monthEarn += earnRes.data[i].points || 0;
  }
  for (var j = 0; j < spendRes.data.length; j++) {
    monthSpend += spendRes.data[j].points || 0;
  }

  // 获取近6个月的趋势数据
  var trendData = [];
  for (var t = 5; t >= 0; t--) {
    var targetMonth = new Date(beijing.getFullYear(), beijing.getMonth() - t, 1);
    var tYear = targetMonth.getFullYear();
    var tMonth = targetMonth.getMonth() + 1;
    var tMonthStr = String(tMonth).padStart(2, '0');
    var tStart = tYear + '-' + tMonthStr + '-01 00:00:00';
    var tNextMonth = tMonth === 12 ? 1 : tMonth + 1;
    var tNextYear = tMonth === 12 ? tYear + 1 : tYear;
    var tEnd = tNextYear + '-' + String(tNextMonth).padStart(2, '0') + '-01 00:00:00';

    var tEarnRes = await db.collection('credits')
      .where({
        _openid: openid,
        deleteTime: null,
        type: 'earn',
        createTime: _.and(_.gte(tStart), _.lt(tEnd))
      })
      .get();

    var tSpendRes = await db.collection('credits')
      .where({
        _openid: openid,
        deleteTime: null,
        type: 'spend',
        createTime: _.and(_.gte(tStart), _.lt(tEnd))
      })
      .get();

    var tEarn = 0, tSpend = 0;
    for (var ei = 0; ei < tEarnRes.data.length; ei++) { tEarn += tEarnRes.data[ei].points || 0; }
    for (var si = 0; si < tSpendRes.data.length; si++) { tSpend += tSpendRes.data[si].points || 0; }

    trendData.push({
      month: tMonthStr,
      year: tYear,
      earn: tEarn,
      spend: tSpend,
      label: tMonth + '月'
    });
  }

  // 获取当前余额
  var config = await findRecord('user_config', { _openid: openid });
  var currentBalance = (config && config.credits) || 0;

  return {
    success: true,
    currentBalance: currentBalance,
    monthEarn: monthEarn,
    monthSpend: monthSpend,
    monthNet: monthEarn - monthSpend,
    year: year,
    month: month,
    trendData: trendData
  };
}

// 清理过期积分（每天执行）
// 核心逻辑：过期积分中，只有 remainPoints > 0 的部分才会影响余额
async function cleanExpiredCredits(event) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;
  var isScheduled = event && event.Type === 'timer';  // 定时任务触发标识

  var now = getBeijingDateStr();
  var nowWithTime = now + ' 23:59:59';

  var _ = db.command;

  // 定时任务模式：清理所有用户的过期积分
  if (isScheduled || !openid) {
    return await cleanAllExpiredCredits();
  }

  // 普通模式：只清理当前用户的过期积分
  var expiredRes = await db.collection('credits')
    .where({
      _openid: openid,
      deleteTime: null,
      type: 'earn',
      expireTime: _.exists(true)
    })
    .field({
      _id: true,
      points: true,
      remainPoints: true,
      expireTime: true
    })
    .get();

  // 内存中过滤已过期的记录
  // 只处理 remainPoints > 0 的记录
  var expiredItems = [];
  for (var i = 0; i < expiredRes.data.length; i++) {
    var item = expiredRes.data[i];
    if (item.expireTime && item.expireTime < nowWithTime) {
      var remain = item.remainPoints !== undefined ? item.remainPoints : (item.points || 0);
      if (remain > 0) {
        expiredItems.push({
          _id: item._id,
          points: item.points || 0,
          remainPoints: remain
        });
      }
    }
  }

  if (expiredItems.length === 0) {
    return { success: true, cleaned: 0, message: '无过期积分需要清理' };
  }

  // 计算过期积分总额（只累计 remainPoints）
  var totalExpired = 0;
  for (var i = 0; i < expiredItems.length; i++) {
    totalExpired += expiredItems[i].remainPoints;
  }

  // 将过期积分的 remainPoints 设为 0
  for (var j = 0; j < expiredItems.length; j++) {
    await db.collection('credits').doc(expiredItems[j]._id).update({
      data: { remainPoints: 0 }
    });
  }

  // 重新计算有效积分
  var validCredits = await calculateValidCredits(openid);

  // 更新用户积分余额
  var config = await findRecord('user_config', { _openid: openid });
  if (config) {
    await db.collection('user_config').doc(config._id).update({
      data: {
        credits: validCredits,
        updateTime: formatTime()
      }
    });
  }

  // 写入过期流水记录
  await db.collection('credits').add({
    data: {
      _openid: openid,
      type: 'expire',
      action: 'daily_expire',
      points: totalExpired,
      balance: validCredits,
      description: '积分过期清除 -' + totalExpired + '（有效期已过）',
      createTime: formatTime(),
      updateTime: formatTime(),
      deleteTime: null
    }
  });

  return {
    success: true,
    cleaned: expiredItems.length,
    expiredAmount: totalExpired,
    validCredits: validCredits,
    message: '已清除' + expiredItems.length + '条过期积分，共' + totalExpired + '分'
  };
}

// 全量清理所有用户的过期积分（定时任务用）
// 核心逻辑：过期积分中，只有 remainPoints > 0 的部分才会影响余额
async function cleanAllExpiredCredits() {
  var now = getBeijingDateStr();
  var nowWithTime = now + ' 23:59:59';

  var _ = db.command;
  var totalCleaned = 0;
  var totalExpiredAmount = 0;
  var usersProcessed = 0;

  // 查询所有已过期的积分记录
  var expiredRes = await db.collection('credits')
    .where({
      deleteTime: null,
      type: 'earn',
      expireTime: _.exists(true)
    })
    .field({
      _id: true,
      _openid: true,
      points: true,
      remainPoints: true,
      expireTime: true
    })
    .limit(1000)
    .get();

  // 过滤出已过期的记录（内存中过滤）
  // 只处理 remainPoints > 0 的记录（已用完的不影响余额）
  var expiredItems = [];
  for (var i = 0; i < expiredRes.data.length; i++) {
    var item = expiredRes.data[i];
    if (item.expireTime && item.expireTime < nowWithTime) {
      // remainPoints > 0 才需要处理
      var remain = item.remainPoints !== undefined ? item.remainPoints : (item.points || 0);
      if (remain > 0) {
        expiredItems.push({
          _id: item._id,
          _openid: item._openid,
          points: item.points || 0,
          remainPoints: remain
        });
      }
    }
  }

  if (expiredItems.length === 0) {
    console.log('[cleanAllExpiredCredits] 无过期积分需要清理');
    return { success: true, cleaned: 0, message: '无过期积分需要清理' };
  }

  // 按用户分组
  var userExpired = {};

  for (var i = 0; i < expiredItems.length; i++) {
    var item = expiredItems[i];
    var uid = item._openid;
    if (!userExpired[uid]) {
      userExpired[uid] = { total: 0, ids: [] };
    }
    userExpired[uid].total += item.remainPoints;  // 只累计 remainPoints
    userExpired[uid].ids.push(item._id);
    totalExpiredAmount += item.remainPoints;
  }

  // 将所有过期积分的 remainPoints 设为 0
  for (var j = 0; j < expiredItems.length; j++) {
    await db.collection('credits').doc(expiredItems[j]._id).update({
      data: { remainPoints: 0 }
    });
  }

  // 更新每个用户的积分余额
  for (var uid in userExpired) {
    var expiredData = userExpired[uid];
    var validCredits = await calculateValidCredits(uid);
    var config = await findRecord('user_config', { _openid: uid });

    if (config) {
      await db.collection('user_config').doc(config._id).update({
        data: {
          credits: validCredits,
          updateTime: formatTime()
        }
      });
    }

    // 写入过期流水记录
    await db.collection('credits').add({
      data: {
        _openid: uid,
        type: 'expire',
        action: 'daily_expire',
        points: expiredData.total,
        balance: validCredits,
        description: '积分过期清除 -' + expiredData.total + '（有效期已过）',
        createTime: formatTime(),
        updateTime: formatTime(),
        deleteTime: null
      }
    });

    usersProcessed++;
    totalCleaned += expiredData.ids.length;
  }

  console.log('[cleanAllExpiredCredits] 清理完成: 用户' + usersProcessed + '个, 记录' + totalCleaned + '条, 过期积分' + totalExpiredAmount + '分');

  return {
    success: true,
    cleaned: totalCleaned,
    expiredAmount: totalExpiredAmount,
    usersProcessed: usersProcessed,
    message: '定时清理完成：' + usersProcessed + '个用户, ' + totalCleaned + '条记录, ' + totalExpiredAmount + '分'
  };
}

// 消耗积分（优先扣减快过期的积分）
async function spendCredits(event) {
  var wxContext = cloud.getWXContext();
  var openid = event._openid || wxContext.OPENID;
  var action = event.actionType || event.spendAction || '';
  var points = event.points;
  var description = event.description;
  var relatedId = event.relatedId || '';

  if (!action || !points) {
    return { success: false, error: '参数不完整' };
  }

  var costPoints = CREDITS_RULES[action];
  if (costPoints === undefined) {
    return { success: false, error: '未知消耗类型: ' + action };
  }

  var actualCost = points || costPoints;
  var desc = description || (ACTION_LABELS[action] || action) + ' -' + actualCost;

  // 获取当前有效余额
  var config = await findRecord('user_config', { _openid: openid });
  if (!config) {
    return { success: false, insufficient: true, balance: 0, required: actualCost };
  }

  var currentBalance = await calculateValidCredits(openid);

  // 余额不足
  if (currentBalance < actualCost) {
    return {
      success: false,
      insufficient: true,
      balance: currentBalance,
      required: actualCost
    };
  }

  var now = formatTime();
  var nowWithTime = getBeijingDateStr() + ' 23:59:59';

  // 获取所有可用积分记录，按过期时间排序（先过期的排前面）
  var earnRes = await db.collection('credits')
    .where({
      _openid: openid,
      deleteTime: null,
      type: 'earn'
    })
    .field({
      _id: true,
      points: true,
      remainPoints: true,
      expireTime: true
    })
    .get();

  // 过滤出未过期且 remainPoints > 0 的记录，并按过期时间排序
  var availableItems = [];
  for (var i = 0; i < earnRes.data.length; i++) {
    var item = earnRes.data[i];
    var remain = item.remainPoints !== undefined ? item.remainPoints : (item.points || 0);
    // 永久有效或未过期，且有剩余积分
    if (remain > 0 && (!item.expireTime || item.expireTime >= nowWithTime)) {
      availableItems.push({
        _id: item._id,
        points: item.points || 0,
        remainPoints: remain,
        expireTime: item.expireTime || '9999-12-31 23:59:59'  // 永久的排最后
      });
    }
  }

  // 按过期时间排序（先过期的在前）
  availableItems.sort(function(a, b) {
    return a.expireTime.localeCompare(b.expireTime);
  });

  // 计算新的余额并扣减各笔积分
  var newBalance = currentBalance;
  var deductedRecords = [];  // 记录被扣减的积分记录

  for (var j = 0; j < availableItems.length && actualCost > 0; j++) {
    var earnItem = availableItems[j];
    var deduct = Math.min(earnItem.remainPoints, actualCost);

    if (deduct > 0) {
      var newRemain = earnItem.remainPoints - deduct;
      await db.collection('credits').doc(earnItem._id).update({
        data: { remainPoints: newRemain }
      });

      deductedRecords.push({
        id: earnItem._id,
        deducted: deduct,
        remain: newRemain
      });

      actualCost -= deduct;
      newBalance -= deduct;
    }
  }

  // 更新用户积分余额
  await db.collection('user_config').doc(config._id).update({
    data: { credits: newBalance, updateTime: now }
  });

  // 写入流水
  var flowData = {
    data: {
      _openid: openid,
      type: 'spend',
      action: action,
      points: currentBalance - newBalance,
      balance: newBalance,
      description: desc,
      createTime: now,
      updateTime: now,
      deleteTime: null,
      deductedFrom: deductedRecords  // 记录从哪些积分记录扣减
    }
  };
  if (relatedId) {
    flowData.data.relatedId = relatedId;
  }
  await db.collection('credits').add(flowData);

  return {
    success: true,
    balance: newBalance,
    cost: currentBalance - newBalance
  };
}

// ==================== 入口 ====================

exports.main = async (event, context) => {
  try {
    // 检测是否为微信定时触发器调用（定时触发器不传递参数）
    var wxContext = cloud.getWXContext();
    var isTimerTrigger = !event || !event.action || event.action === 'cleanExpiredCredits';
    var isScheduled = event && (event.Type === 'timer' || event.triggeredBy === 'timer');

    // 如果没有 action 参数或者是定时触发器，直接执行清理
    if (isTimerTrigger || isScheduled) {
      return await cleanAllExpiredCredits();
    }

    switch (event.action) {
      // 积分核心
      case 'initCredits':    return await initCredits(event);
      case 'getCreditsInfo': return await getCreditsInfo(event);
      case 'doSignin':       return await doSignin();
      case 'getCreditsList': return await getCreditsList(event);
      case 'spendCredits':   return await spendCredits(event);
      case 'getCreditsStats': return await getCreditsStats(event);
      case 'cleanExpiredCredits': return await cleanExpiredCredits();
      case 'checkCreditsExpire': return await cleanExpiredCredits();  // 兼容旧接口
      // 资料管理
      case 'completeProfile': return await completeProfile(event);
      case 'getUserProfile': return await getUserProfile();
      case 'updateProfile': return await updateProfile(event);
      // 工具函数
      case 'getCreditsRules': return {
        success: true,
        rules: CREDITS_RULES,
        labels: ACTION_LABELS
      };
      default: return { error: '未知操作: ' + (event.action || 'empty') };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
};
