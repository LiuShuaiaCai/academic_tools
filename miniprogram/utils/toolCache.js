// utils/toolCache.js - 工具数据缓存
// 每次进入从云函数重新加载，同一 session 内各页面共享内存缓存
// 避免每个页面重复调用 getAllTools 云函数

var _cache = null;

// 获取全部工具
// 每次 App 启动 _cache 为空 → 强制从云函数拉取最新数据
// 之后同一 session 内所有页面复用 _cache
function getAllTools() {
  if (_cache) return Promise.resolve(_cache);

  return wx.cloud.callFunction({
    name: 'academicAPI',
    data: { action: 'getAllTools' }
  }).then(function(res) {
    _cache = res.result || [];
    return _cache;
  }).catch(function(e) {
    console.error('[toolCache] 加载失败:', e);
    return [];
  });
}

// 根据 toolId 快速查颜色名（需缓存已初始化，否则返回 blue）
function getColorByToolId(toolId) {
  if (_cache) {
    var tool = _cache.find(function(t) { return t.id === toolId; });
    return (tool && tool.color) || 'blue';
  }
  return 'blue';
}

module.exports = {
  getAllTools: getAllTools,
  getColorByToolId: getColorByToolId
};
