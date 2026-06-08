// utils/dbInit.js - 数据库公共模块

// 兼容 iOS 的日期解析（iOS 不支持 "YYYY-MM-DD HH:mm:ss" 格式）
function parseDate(str) {
  if (!str) return null;
  return new Date(str.replace(/-/g, '/'));
}

// 格式化时间为 YYYY-MM-DD HH:mm:ss
function formatTime(date) {
  var d = date ? parseDate(date) : new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date) {
  var d = date ? parseDate(date) : new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 获取当前时间字符串
function now() {
  return formatTime(); // 不传参，formatTime 内部创建 new Date()
}

// 构建新增数据的基础字段
function newRecord() {
  var t = now();
  return { createTime: t, updateTime: t, deleteTime: null };
}

// 构建更新数据的基础字段
function updateRecord() {
  return { updateTime: now() };
}

// 软删除条件：deleteTime 为 null
function notDeleted(db) {
  return db.command.eq(null);
}

// 软删除指定集合中的文档
function softDelete(collection, docId) {
  var db = wx.cloud.database();
  return db.collection(collection).doc(docId).update({
    data: { deleteTime: now(), updateTime: now() }
  });
}

// 获取带软删除过滤的查询引用
// extraWhere: 额外的过滤条件（如 { _openid: openid }）
function query(collection, extraWhere) {
  var db = wx.cloud.database();
  var where = { deleteTime: notDeleted(db) };
  if (extraWhere) {
    for (var key in extraWhere) {
      where[key] = extraWhere[key];
    }
  }
  return db.collection(collection).where(where);
}

module.exports = {
  formatTime: formatTime,
  formatDate: formatDate,
  parseDate: parseDate,
  now: now,
  newRecord: newRecord,
  updateRecord: updateRecord,
  notDeleted: notDeleted,
  softDelete: softDelete,
  query: query
};
