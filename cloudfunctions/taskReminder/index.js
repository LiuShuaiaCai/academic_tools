// 云函数: taskReminder - 任务订阅提醒
// 支持两种定时模式：
// 1. hourlyTaskReminder：每天8-23点每小时执行，汇总今日自定义任务，每个用户发一条
// 2. dailySummaryReminder：每天7点执行，汇总今日所有待办（任务/投稿/审稿/会议），每个用户发一条

const cloud = require('wx-server-sdk');
const https = require('https');
const url = require('url');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 小程序配置 — 从 cloudbaserc.json 环境变量注入
const WX_APPID = process.env.WX_APPID;
const WX_APP_SECRET = process.env.WX_APP_SECRET;

// 订阅消息模板ID（待办事项通知）
// 字段映射：thing2-待办事项(20字) | time3-截止时间 | thing4-温馨提醒(20字) | character_string5-事项编号(32字)
const WX_TEMPLATE_ID = process.env.WX_TEMPLATE_ID;

// ============ HTTP 工具函数 ============

function httpsGet(getUrl) {
  return new Promise((resolve, reject) => {
    const req = https.get(getUrl, { timeout: 10000 }, (res) => {
      console.log(`[taskReminder] GET 响应状态: ${res.statusCode}`);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[taskReminder] GET 响应长度: ${data.length}`);
        resolve(data);
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTPS GET 超时')); });
    req.on('error', (err) => { console.error('[taskReminder] GET 错误:', err.message); reject(err); });
  });
}

function httpsPost(postUrl, body) {
  return new Promise((resolve, reject) => {
    const u = url.parse(postUrl);
    const postData = JSON.stringify(body);

    console.log(`[taskReminder] POST ${u.hostname}${u.path} body:${postData.substring(0, 80)}...`);

    const req = https.request({
      hostname: u.hostname,
      path: u.path,
      method: 'POST',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      console.log(`[taskReminder] 响应状态: ${res.statusCode}`);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[taskReminder] 响应体长度: ${data.length}`);
        resolve(data);
      });
    });

    req.on('timeout', () => {
      console.error('[taskReminder] HTTPS POST 超时');
      req.destroy();
      reject(new Error('HTTPS请求超时'));
    });

    req.on('error', (err) => {
      console.error(`[taskReminder] HTTPS POST 错误:`, err.message);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

// ============ Access Token 管理 ============

let _cachedToken = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
  // 同一次云函数调用内复用 token
  if (_cachedToken && _tokenExpiresAt > Date.now() + 60000) {
    return _cachedToken;
  }

  if (!WX_APP_SECRET) throw new Error('【配置缺失】请在 cloudbaserc.json 的 taskReminder 函数中设置 envVariables.WX_APP_SECRET');

  const resp = await httpsGet(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_APP_SECRET}`
  );
  console.log(`[taskReminder] 获取 access_token 响应: ${resp ? resp.substring(0, 100) : '(空)'}`);

  if (!resp || resp.trim() === '') {
    throw new Error('获取 access_token 返回空响应，请检查 WX_APP_SECRET 是否正确');
  }

  let data;
  try {
    data = JSON.parse(resp);
  } catch (e) {
    throw new Error(`获取 access_token 返回非JSON: ${resp.substring(0, 200)}`);
  }

  if (data.access_token) {
    _cachedToken = data.access_token;
    _tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return _cachedToken;
  }

  throw new Error(`获取 access_token 失败: ${resp}`);
}

// ============ 通用工具函数 ============

// 云函数默认 UTC 时区，转北京时间(UTC+8)
function getBeijingTime() {
  return new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
}

function getTodayStr() {
  const now = getBeijingTime();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeStr() {
  const now = getBeijingTime();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getBeijingHour() {
  return (new Date().getUTCHours() + 8) % 24;
}

// 明天 00:00:00（北京时间）
function getTomorrowStartStr() {
  var now = getBeijingTime();
  now.setUTCDate(now.getUTCDate() + 1);
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return now.getUTCFullYear() + '-' + pad(now.getUTCMonth() + 1) + '-' + pad(now.getUTCDate()) + ' 00:00:00';
}

// 当前时间 + N 小时（北京时间）
function getTimePlusHoursStr(hours) {
  var now = getBeijingTime();
  now.setUTCHours(now.getUTCHours() + hours);
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return now.getUTCFullYear() + '-' + pad(now.getUTCMonth() + 1) + '-' + pad(now.getUTCDate()) + ' ' + pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()) + ':' + pad(now.getUTCSeconds());
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
      var current = usRes.data[0].reminderQuota || 0;
      if (current > 0) {
        await db.collection('user_settings').doc(usRes.data[0]._id).update({
          data: { reminderQuota: _.inc(-1) }
        });
      }
    }
  } catch (e) {
    console.error('减少额度失败', openid, e);
  }
}

// 发送单条订阅消息（HTTP 直调微信 API，支持定时触发器场景）
async function sendReminder(openid, page, thing2, time3, thing4, character_string5) {
  const accessToken = await getAccessToken();
  const resp = await httpsPost(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
    {
      touser: openid,
      template_id: WX_TEMPLATE_ID,
      page: page || '',
      data: {
        thing2: { value: thing2 },
        time3: { value: time3 },
        thing4: { value: thing4 },
        character_string5: { value: character_string5 }
      }
    }
  );

  // 响应为空时，打印原始内容便于排查
  if (!resp || resp.trim() === '') {
    console.error(`[taskReminder] 微信API返回空响应 openid:${openid}`);
    throw new Error('微信API返回空响应，请检查 access_token 是否有效');
  }

  let result;
  try {
    result = JSON.parse(resp);
  } catch (e) {
    console.error(`[taskReminder] 微信API返回非JSON: ${resp.substring(0, 500)}`);
    throw new Error(`微信API返回异常: ${resp.substring(0, 200)}`);
  }

  if (result.errcode === 0) return result;

  // 用户拒收 / 授权过期，优雅跳过
  if (result.errcode === 43101 || result.errcode === 41028 || result.errcode === 41029) {
    console.warn(`[taskReminder] 用户 ${openid} 订阅消息被拒或失效: ${result.errcode} ${result.errmsg}`);
    const err = new Error(result.errmsg);
    err._skipQuota = true;
    err.errCode = result.errcode;
    throw err;
  }

  // access_token 过期，清除缓存后重试一次
  if (result.errcode === 40001 || result.errcode === 42001) {
    console.warn(`[taskReminder] access_token 过期，重新获取后重试`);
    _cachedToken = null;
    _tokenExpiresAt = 0;
    return sendReminder(openid, page, thing2, time3, thing4, character_string5);
  }

  throw new Error(`模板消息发送失败: ${result.errcode} ${result.errmsg}`);
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
  let skippedCount = 0;

  for (const [openid, items] of Object.entries(userMap)) {
    try {
      const summary = buildSummaryFn(items);
      await sendReminder(openid, summary.page, summary.thing2, summary.time3, summary.thing4, summary.character_string5);
      results.push({ openid, count: items.length, status: 'sent' });
      sentCount++;
      await decreaseQuota(openid).catch(e => console.error('扣额度失败', e));
    } catch (err) {
      if (err && err._skipQuota) {
        results.push({ openid, count: items.length, status: 'skipped', reason: '用户未授权或授权已过期' });
        skippedCount++;
      } else {
        console.error(`汇总消息发送失败 [openid:${openid}]`, err);
        results.push({ openid, count: items.length, status: 'failed', error: err.message || err.errMsg || '未知错误' });
      }
    }
  }

  return { sentCount, skippedCount, results };
}

// ============ 模式一：每小时自定义任务汇总 ============
async function runHourlyTasks(todayStr, disabledOpenids) {
  const currentHourNum = getBeijingHour();

  // 直接用 reminderHour 精确查询（前端保存时已计算好）
  const whereObj = {
    deleteTime: null,
    completed: false,
    date: todayStr,
    reminderHour: currentHourNum
  };
  if (disabledOpenids.length > 0) {
    whereObj._openid = _.nin(disabledOpenids);
  }

  console.log(`[taskReminder] 查询条件:`, JSON.stringify(whereObj));

  const res = await db.collection('tasks').where(whereObj).get();
  const items = res.data || [];

  console.log(`[taskReminder] 查到 ${items.length} 条任务`);
  items.forEach((item, i) => {
    console.log(`[taskReminder] 任务${i}: _id=${item._id}, title=${item.title}, reminderHour=${item.reminderHour}, reminderSent=${item.reminderSent}`);
  });

  if (items.length === 0) return { count: 0, sent: 0, results: [] };

  const userMap = groupByOpenid(items);
  const deadlineTime = getTimePlusHoursStr(3);

  const { sentCount, results } = await sendSummary(userMap, function(userItems) {
    return {
      page: '/pages/calendar/daily-tasks/daily-tasks',
      thing2: `您近3小时有${userItems.length}项工作待处理`,
      time3: deadlineTime,
      thing4: '请及时处理',
      character_string5: String(Math.floor(Math.random() * 9000000000) + 1000000000)
    };
  });

  // 发送成功后标记 reminderSent，避免重复提醒
  for (const item of items) {
    await db.collection('tasks').doc(item._id).update({
      data: { reminderSent: true }
    }).catch(e => console.error(`[taskReminder] 标记 reminderSent 失败 ${item._id}`, e));
  }

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
    completed: false,
    // status: 'registered',
    startDate: _.gte(todayStr + ' 00:00:00').and(_.lte(todayStr + ' 23:59:59'))
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

  const tomorrowStart = getTomorrowStartStr();

  const { sentCount, results } = await sendSummary(userMap, function(userItems) {
    // 统计各类别数量，组装 thing4
    const typeCount = {};
    for (const item of userItems) {
      typeCount[item._type] = (typeCount[item._type] || 0) + 1;
    }

    const parts = [];
    if (typeCount.task) parts.push(`工作${typeCount.task}项`);
    if (typeCount.submission) parts.push(`投稿${typeCount.submission}项`);
    if (typeCount.review) parts.push(`审稿${typeCount.review}项`);
    if (typeCount.conference) parts.push(`会议${typeCount.conference}项`);

    let thing4 = parts.join('，');
    // thing4 限制 20 字，超限则简化为总数
    if (thing4.length > 20) {
      thing4 = `共${userItems.length}项待处理`;
    }

    return {
      page: '/pages/calendar/daily-tasks/daily-tasks',
      thing2: `您今日有${userItems.length}项工作待处理`,
      time3: tomorrowStart,
      thing4: thing4 || '暂无待办',
      character_string5: String(Math.floor(Math.random() * 9000000000) + 1000000000)
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
    console.log(`[taskReminder] event:`, JSON.stringify(event));

    // hourlyTaskReminder 或手动测试（空 triggerName）
    if (triggerName === 'hourlyTaskReminder' || triggerName === '') {
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
