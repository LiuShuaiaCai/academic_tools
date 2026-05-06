// cloudfunctions/academicTools/index.js
// 职责：数据库初始化（创建集合 + 写入默认工具定义）
// 每次小程序启动时调用，已有数据则跳过

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 工具定义数据（全局）
// isTaskType: true = 任务型工具（有 deadline，显示"X 任务待完成"），false = 存储型工具
const DEFAULT_TOOLS = [
  { id: 'submission', name: '投稿管理', desc: '跟踪稿件投稿进度', icon: 'paper-plane', iconEmoji: '📄', color: 'blue', category: 'core', order: 1, comingSoon: false, isPublished: true, pagePath: '/pages/submissions/submissions', isTaskType: true },
  { id: 'review',     name: '审稿任务', desc: '管理审稿deadline',   icon: 'glasses',       iconEmoji: '👓', color: 'red',    category: 'core', order: 2, comingSoon: false, isPublished: true, pagePath: '/pages/reviews/reviews', isTaskType: true },
  { id: 'conference', name: '学术会议', desc: '跟踪会议截稿日期',    icon: 'calendar-alt',  iconEmoji: '📅', color: 'green',  category: 'core', order: 3, comingSoon: false, isPublished: true, pagePath: '/pages/conferences/conferences', isTaskType: true },
  { id: 'archive',    name: '资料归档', desc: '统一管理附件文件',    icon: 'folder-open',   iconEmoji: '📁', color: 'orange', category: 'core', order: 4, comingSoon: false, isPublished: true, pagePath: '/pages/archive/archive', isTaskType: false },
  { id: 'citation',   name: '文献引用', desc: 'GB/T 7714、APA格式化', icon: 'quote-right',  iconEmoji: '📚', color: 'purple', category: 'ext',  order: 5, comingSoon: true,  isPublished: false, pagePath: '', isTaskType: false },
  { id: 'journal',    name: '期刊预警', desc: '预警期刊、假会议检测', icon: 'exclamation-triangle', iconEmoji: '⚠️', color: 'red', category: 'ext', order: 6, comingSoon: true,  isPublished: false, pagePath: '', isTaskType: false },
  { id: 'achievement',name: '成果汇总', desc: '自动汇总论文、导出CV', icon: 'trophy',        iconEmoji: '🏆', color: 'orange', category: 'ext', order: 7, comingSoon: true,  isPublished: false, pagePath: '', isTaskType: false },
  { id: 'note',       name: '学术笔记', desc: '文献阅读笔记管理',    icon: 'sticky-note',   iconEmoji: '📝', color: 'green',  category: 'ext', order: 8, comingSoon: false, isPublished: true, pagePath: '/pages/toolbox/toolbox', isTaskType: false }
];

// 所有集合
const COLLECTIONS = ['tools', 'user_tools', 'submissions', 'reviews', 'conferences', 'archives', 'archive_categories', 'user_config'];

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

// 创建所有集合
async function createCollections() {
  var results = [];
  for (var i = 0; i < COLLECTIONS.length; i++) {
    var col = COLLECTIONS[i];
    try {
      await db.createCollection(col);
      results.push(col + ' 创建成功');
    } catch (e) {
      if (e.errCode === -409) {
        results.push(col + ' 已存在');
      } else {
        results.push(col + ' 创建失败: ' + e.message);
      }
    }
  }
  return results;
}

// 初始化工具定义表（tools 表 id 唯一）
async function initTools() {
  var results = [];
  for (var i = 0; i < DEFAULT_TOOLS.length; i++) {
    var tool = DEFAULT_TOOLS[i];
    var res = await upsert('tools', { id: tool.id }, {
      id: tool.id,
      name: tool.name,
      desc: tool.desc,
      icon: tool.icon,
      iconEmoji: tool.iconEmoji,
      color: tool.color,
      category: tool.category,
      order: tool.order,
      comingSoon: tool.comingSoon,
      isPublished: tool.isPublished,
      pagePath: tool.pagePath,
      isTaskType: tool.isTaskType
    });
    results.push(tool.id + ' - ' + res.action);
  }
  return results;
}

// ==================== 入口 ====================

exports.main = async (event) => {
  switch (event.type) {
    case 'initDB': {
      var createResults = await createCollections();
      var toolResults = await initTools();
      return { success: true, message: '初始化完成', details: createResults.concat(toolResults) };
    }
    case 'resetDB': {
      var results = [];
      for (var i = 0; i < COLLECTIONS.length; i++) {
        var col = COLLECTIONS[i];
        try {
          var res = await db.collection(col).limit(100).get();
          if (res.data.length > 0) {
            var tasks = [];
            for (var j = 0; j < res.data.length; j++) {
              if (col === 'tools') {
                tasks.push(db.collection(col).doc(res.data[j]._id).remove());
              } else {
                tasks.push(db.collection(col).doc(res.data[j]._id).update({
                  data: { deleteTime: formatTime(), updateTime: formatTime() }
                }));
              }
            }
            await Promise.all(tasks);
            results.push('[' + col + '] 已清空 ' + res.data.length + ' 条');
          } else {
            results.push('[' + col + '] 集合为空');
          }
        } catch (e) {
          results.push('[' + col + '] 清空失败: ' + e.message);
        }
      }
      var toolResults = await initTools();
      results = results.concat(toolResults);
      return { success: true, message: '重置完成', details: results };
    }
    default:
      return { error: '未知操作，请使用 initDB 或 resetDB' };
  }
};
