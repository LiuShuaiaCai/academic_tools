// cloudfunctions/submitFeedback/index.js
// 职责：接收用户反馈数据并写入云数据库

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { type, content, contact, images, createTime } = event;

  if (!content || content.trim().length === 0) {
    return { success: false, message: '反馈内容不能为空' };
  }

  try {
    const res = await db.collection('feedbacks').add({
      data: {
        _openid: openid,
        type: type || 'other',
        content: content.trim(),
        contact: contact ? contact.trim() : '',
        images: images || [],
        status: 'pending', // pending / processing / resolved
        createTime: new Date(createTime || Date.now()),
        updateTime: new Date()
      }
    });

    return { success: true, _id: res._id };
  } catch (err) {
    console.error('提交反馈失败', err);
    return { success: false, message: err.message || '提交失败' };
  }
};
