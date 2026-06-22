// miniprogram/utils/square-helper.js
// 学术动态模块公共工具函数（广场页 + 详情页共用）

// ==================== 常量 ====================

var EMOJI_LIST = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😝','😜','🤪','🤔','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👍','👎','👏','🙌','👐','🤝','🤗','🤭','🤫','🌹','❤️','💔','💖','💙','💚','💛','💜','🖤','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','🗨️','🗯️','💭','💤'];

var TYPE_LABEL_MAP = {
  'achievement': '成果分享',
  'discussion': '学术讨论',
  'resource': '资源分享',
  'call_for_papers': '征稿通知',
  'review': '学术审稿',
  'journal': '学术会议',
  'literature_help': '文献互助'
};

var TYPE_COLOR_MAP = {
  'achievement': '#2563eb',
  'discussion': '#7C3AED',
  'resource': '#059669',
  'call_for_papers': '#F97316',
  'review': '#10B981',
  'journal': '#06B6D4',
  'literature_help': '#F43F5E'
};

var HELP_STATUS_LABEL_MAP = {
  '求助中': '求助中',
  '已解决': '已解决',
  '已过期': '已过期'
};

var HELP_STATUS_COLOR_MAP = {
  '求助中': '#EF4444',
  '已解决': '#3b82f6',
  '已过期': '#9ca3af'
};

// ==================== 工具函数 ====================

/**
 * 格式化显示时间（相对时间）
 */
function formatDisplayTime(timeStr) {
  if (!timeStr) return '';
  var now = new Date();
  var postTime = new Date(timeStr.replace(/-/g, '/'));
  var diff = now.getTime() - postTime.getTime();
  var minutes = Math.floor(diff / 60000);
  var hours = Math.floor(diff / 3600000);
  var days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return minutes + '分钟前';
  if (hours < 24) return hours + '小时前';
  if (days < 7) return days + '天前';
  if (days < 365) {
    return (postTime.getMonth() + 1) + '月' + postTime.getDate() + '日';
  }
  return postTime.getFullYear() + '年';
}

/**
 * 获取类型显示文本
 */
function getTypeLabel(type) {
  return TYPE_LABEL_MAP[type] || '动态';
}

/**
 * 获取类型颜色
 */
function getTypeColor(type) {
  return TYPE_COLOR_MAP[type] || '#6B7280';
}

/**
 * 获取求助状态显示文本
 */
function getHelpStatusLabel(status) {
  return HELP_STATUS_LABEL_MAP[status] || '求助中';
}

/**
 * 获取求助状态颜色
 */
function getHelpStatusColor(status) {
  return HELP_STATUS_COLOR_MAP[status] || '#EF4444';
}

/**
 * 格式化剩余时间
 */
function formatRemainingTime(deadline) {
  if (!deadline) return '';
  var now = new Date();
  var deadlineTime = new Date(deadline.replace(/-/g, '/'));
  var diff = deadlineTime.getTime() - now.getTime();

  if (diff <= 0) return '已过期';

  var days = Math.floor(diff / 86400000);
  var hours = Math.floor((diff % 86400000) / 3600000);
  var minutes = Math.floor((diff % 3600000) / 60000);

  if (days > 0) return days + '天' + hours + '小时后截止';
  if (hours > 0) return hours + '小时' + minutes + '分钟后截止';
  return minutes + '分钟后截止';
}

/**
 * 将扁平评论列表构建为树形结构
 */
function buildCommentTree(flatComments) {
  var replyMap = {};
  flatComments.forEach(function (c) {
    if (c.parentId) {
      if (!replyMap[c.parentId]) replyMap[c.parentId] = [];
      var exists = replyMap[c.parentId].some(function (r) { return r._id === c._id; });
      if (!exists) replyMap[c.parentId].push(c);
    }
  });

  var tops = [];
  flatComments.forEach(function (c) {
    if (!c.parentId) {
      var copy = Object.assign({}, c);
      copy._replies = replyMap[c._id] || [];
      copy._showReplies = false;
      tops.push(copy);
    }
  });
  return tops;
}

/**
 * 批量转换 cloud:// URL 为临时 URL（通用版）
 * @param {Array} items - 数据项数组
 * @param {Array} urlFields - 需要转换的字段名列表，如 ['avatarUrl', 'imageUrl']
 * @returns {Promise<Array>} 转换后的数组
 */
function convertCloudUrls(items, urlFields) {
  if (!items || items.length === 0) return Promise.resolve(items);
  urlFields = urlFields || ['avatarUrl'];

  var cloudFileIDs = [];
  items.forEach(function (item) {
    urlFields.forEach(function (field) {
      var url = item[field];
      if (url && url.indexOf('cloud://') === 0 && cloudFileIDs.indexOf(url) === -1) {
        cloudFileIDs.push(url);
      }
    });
  });

  if (cloudFileIDs.length === 0) return Promise.resolve(items);

  return wx.cloud.getTempFileURL({
    fileList: cloudFileIDs
  }).then(function (res) {
    var urlMap = {};
    (res.fileList || []).forEach(function (item) {
      if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
    });
    return items.map(function (item) {
      var copy = Object.assign({}, item);
      urlFields.forEach(function (field) {
        if (copy[field] && urlMap[copy[field]]) {
          copy[field] = urlMap[copy[field]];
        }
      });
      return copy;
    });
  }).catch(function (err) {
    console.error('[square-helper] 转换URL失败，使用原始数据', err);
    return items;
  });
}

/**
 * 格式化帖子列表中的各项显示字段
 */
function formatPostDisplay(post, currentOpenid) {
  post.displayTime = formatDisplayTime(post.createTime);
  post.typeLabel = getTypeLabel(post.type);
  post.typeColor = getTypeColor(post.type);

  if (post.type === 'literature_help') {
    post.helpStatusLabel = getHelpStatusLabel(post.helpStatus);
    post.helpStatusColor = getHelpStatusColor(post.helpStatus);
    post.remainingTime = formatRemainingTime(post.helpDeadline);
    post.hasResponded = (post.responses || []).some(function (r) {
      return r.responderOpenid === currentOpenid;
    });
    post.canRespond = post.helpStatus === '求助中' && post._openid !== currentOpenid && !post.hasResponded;
  }
  return post;
}

module.exports = {
  EMOJI_LIST: EMOJI_LIST,
  TYPE_LABEL_MAP: TYPE_LABEL_MAP,
  TYPE_COLOR_MAP: TYPE_COLOR_MAP,
  formatDisplayTime: formatDisplayTime,
  getTypeLabel: getTypeLabel,
  getTypeColor: getTypeColor,
  getHelpStatusLabel: getHelpStatusLabel,
  getHelpStatusColor: getHelpStatusColor,
  formatRemainingTime: formatRemainingTime,
  buildCommentTree: buildCommentTree,
  convertCloudUrls: convertCloudUrls,
  formatPostDisplay: formatPostDisplay
};
