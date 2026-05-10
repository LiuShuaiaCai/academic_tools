// 云函数: taskReminder - 任务订阅提醒
// 用于定时发送任务提醒通知

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 消息模板ID，需要在微信公众平台配置
const TEMPLATE_ID = 'YOUR_TEMPLATE_ID'; // 替换为实际的订阅消息模板ID

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const now = new Date();
    
    // 查询需要提醒的任务（提前1天提醒）
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const tasks = await db.collection('tasks').where({
      deleteTime: null,
      completed: false,
      reminderEnabled: true,
      date: tomorrowStr
    }).get();

    const results = [];

    for (const task of tasks.data) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: openid,
          templateId: TEMPLATE_ID,
          page: `/pages/calendar/daily-tasks/daily-tasks?date=${task.date}`,
          data: {
            thing1: { value: task.title },
            time2: { value: `${task.date} ${task.time || '全天'}` },
            phrase3: { value: '明天' },
          }
        });
        results.push({ taskId: task._id, title: task.title, status: 'sent' });
      } catch (err) {
        console.error('发送订阅消息失败', err);
        results.push({ taskId: task._id, title: task.title, status: 'failed', error: err.message });
      }
    }

    return {
      success: true,
      openid,
      results
    };
  } catch (e) {
    console.error('任务提醒云函数错误', e);
    return {
      success: false,
      error: e.message
    };
  }
};
