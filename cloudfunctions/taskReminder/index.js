// 云函数: taskReminder - 任务订阅提醒
// 支持两种定时模式：
// 1. hourlyTaskReminder：每天8-23点每小时执行，汇总今日自定义任务，每个用户发一条
// 2. dailySummaryReminder：每天7点执行，汇总今日所有待办（任务/投稿/审稿/会议），每个用户发一条

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 订阅消息模板ID（待办事项通知）
// 字段映射：thing1-待办事项(20字) | time2-截止时间 | thing3-温馨提醒(20字) | character_string4-事项编号(32字)
const TEMPLATE_ID = 'QHjTeMKp-0TwGCtPiHvCHsW420pBuiSLHAqNqsV1x1Q';

// ============ 通用工具函数 ============

function getTodayStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 获取关闭了消息提醒的用户 openid 列表
async function getDisabledOpenids() {
  const res = await db.collection('user_settings').where({
    msgRemind: false
  }).get();
  return res.data.map(u => u._openid);
}

// 发送成功后减少额度
async function decreaseQuota(openid) {
  try {
    const usRes = await db.collection('user_settings').where({ _openid: openid }).get();
    if (usRes.data && usRes.data.length > 0) {
      await db.collection('user_settings').doc(usRes.data[0]._id).update({
        data: { reminderQuota: _.inc(-1) }
      });
    }
  } catch (e) {
    console.error('减少额度失败', openid, e);
  }
}

// 发送单条订阅消息
async function sendReminder(openid, page, thing1, time2, thing3, character_string4) {
  return cloud.openapi.subscribeMessage.send({
    touser: openid,
    templateId: TEMPLATE_ID,
    page: page,
    data: {
      thing1: { value: thing1 },
      time2: { value: time2 },
      thing3: { value: thing3 },
      character_string4: { value: character_string4 }
    }
  });
}

// 按 openid 对记录分组
function groupByOpenid(items, typeKey) {
  const map = {};
  for (const item of items) {
    if (!item._openid) continue;
    if (!map[item._openid]) map[item._openid] = [];
    if (typeKey) item._type = typeKey;
    map[item._openid].push(item);
  }
  return map;
}

// 发送汇总消息（每个用户一条）
async function sendSummary(userMap, buildSummaryFn) {
  const results = [];
  let sentCount = 0;

  for (const [openid, items] of Object.entries(userMap)) {
    try {
      const summary = buildSummaryFn(items);
      await sendReminder(openid, summary.page, summary.thing1, summary.time2, summary.thing3, summary.character_string4);
      results.push({ openid, count: items.length, status: 'sent' });
      sentCount++;
      await decreaseQuota(openid).catch(e => console.error('扣额度失败', e));
    } catch (err) {
      console.error(`汇总消息发送失败 [openid:${openid}]`, err);
      results.push({ openid, count: items.length, status: 'failed', error: err.message || err.errMsg || '未知错误' });
    }
  }

  return { sentCount, results };
}

// ============ 模式一：每小时自定义任务汇总 ============
async function runHourlyTasks(todayStr, disabledOpenids) {
  const whereObj = {
    deleteTime: null,
    completed: false,
    date: todayStr
  };
  if (disabledOpenids.length > 0) {
    whereObj._openid = _.nin(disabledOpenids);
  }

  const res = await db.collection('tasks').where(whereObj).get();
  const items = res.data || [];
  if (items.length === 0) return { count: 0, sent: 0, results: [] };

  const userMap = groupByOpenid(items);
  const currentHour = String(new Date().getHours()).padStart(2, '0');
  const currentTime = getCurrentTimeStr();

  const { sentCount, results } = await sendSummary(userMap, function(userItems) {
    return {
      page: '/pages/calendar/daily-tasks/daily-tasks',
      thing1: `您${currentHour}点有${userItems.length}项待办`,
      time2: currentTime,
      thing3: '请及时处理',
      character_string4: '点击查看详情'
    };
  });

  return { count: items.length, sent: sentCount, results };
}

// ============ 模式二：每日全量汇总 ============
async function runDailySummary(todayStr, disabledOpenids) {
  const taskWhere = {
    deleteTime: null,
    completed: false,
    date: todayStr
  };
  const subWhere = {
    deleteTime: null,
    completed: false,
    deadline: _.gte(todayStr + ' 00:00:00').and(_.lte(todayStr + ' 23:59:59'))
  };
  const revWhere = {
    deleteTime: null,
    completed: false,
    deadline: _.gte(todayStr + ' 00:00:00').and(_.lte(todayStr + ' 23:59:59'))
  };
  const confWhere = {
    deleteTime: null,
    deadline: _.gte(todayStr + ' 00:00:00').and(_.lte(todayStr + ' 23:59:59'))
  };

  if (disabledOpenids.length > 0) {
    const nin = _.nin(disabledOpenids);
    taskWhere._openid = nin;
    subWhere._openid = nin;
    revWhere._openid = nin;
    confWhere._openid = nin;
  }

  const [taskRes, subRes, revRes, confRes] = await Promise.all([
    db.collection('tasks').where(taskWhere).get(),
    db.collection('submissions').where(subWhere).get(),
    db.collection('reviews').where(revWhere).get(),
    db.collection('conferences').where(confWhere).get()
  ]);

  // 合并所有集合数据
  const userMap = {};
  const mergeItems = (items, type) => {
    for (const item of items) {
      if (!item._openid) continue;
      if (!userMap[item._openid]) userMap[item._openid] = [];
      userMap[item._openid].push({ ...item, _type: type });
    }
  };

  mergeItems(taskRes.data || [], 'task');
  mergeItems(subRes.data || [], 'submission');
  mergeItems(revRes.data || [], 'review');
  mergeItems(confRes.data || [], 'conference');

  const totalCount = Object.values(userMap).reduce((sum, arr) => sum + arr.length, 0);
  if (totalCount === 0) return { count: 0, sent: 0, results: [] };

  const currentTime = getCurrentTimeStr();

  const { sentCount, results } = await sendSummary(userMap, function(userItems) {
    // 统计各类别数量，组装 thing3
    const typeCount = {};
    for (const item of userItems) {
      typeCount[item._type] = (typeCount[item._type] || 0) + 1;
    }

    const parts = [];
    if (typeCount.task) parts.push(`任务${typeCount.task}项`);
    if (typeCount.submission) parts.push(`投稿${typeCount.submission}项`);
    if (typeCount.review) parts.push(`审稿${typeCount.review}项`);
    if (typeCount.conference) parts.push(`会议${typeCount.conference}项`);

    let thing3 = parts.join('，');
    // thing3 限制 20 字，超限则简化为总数
    if (thing3.length > 20) {
      thing3 = `共${userItems.length}项待处理`;
    }

    return {
      page: '/pages/calendar/daily-tasks/daily-tasks',
      thing1: `您今日有${userItems.length}项待办`,
      time2: currentTime,
      thing3: thing3 || '暂无待办',
      character_string4: '点击查看详情'
    };
  });

  return { count: totalCount, sent: sentCount, results };
}

// ============ 入口 ============
exports.main = async (event, context) => {
  try {
    const triggerName = event.TriggerName || '';
    const todayStr = getTodayStr();
    const disabledOpenids = await getDisabledOpenids();

    console.log(`[taskReminder] 触发器: ${triggerName}, 日期: ${todayStr}`);

    if (triggerName === 'hourlyTaskReminder') {
      const res = await runHourlyTasks(todayStr, disabledOpenids);
      return {
        success: true,
        mode: 'hourly',
        date: todayStr,
        summary: {
          tasks: { count: res.count, sent: res.sent }
        },
        details: res.results
      };
    }

    // 默认 daily（兼容旧触发器 taskReminderTimer 和 dailySummaryReminder）
    const res = await runDailySummary(todayStr, disabledOpenids);
    return {
      success: true,
      mode: 'daily',
      date: todayStr,
      summary: {
        totalCount: res.count,
        totalSent: res.sent
      },
      details: res.results
    };
  } catch (e) {
    console.error('taskReminder 云函数错误', e);
    return { success: false, error: e.message };
  }
};
