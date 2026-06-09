// utils/citation/openalex.js
// 通过云函数代理调用 OpenAlex API 获取文献元数据

/**
 * 通过云函数代理调用 OpenAlex API
 */
function callOpenAlexProxy(action, params) {
  return new Promise(function(resolve, reject) {
    wx.cloud.callFunction({
      name: 'openAlexProxy',
      data: {
        api: 'openalex',
        action: action,
        params: params
      }
    }).then(function(res) {
      if (res.result && res.result.success) {
        resolve(res.result.data);
      } else {
        reject(new Error((res.result && res.result.error) || '云函数调用失败'));
      }
    }).catch(function(err) {
      reject(err);
    });
  });
}

/**
 * 通过 DOI 从 OpenAlex 获取文献元数据（包含被引次数和按年份统计）
 * @param {string} doi - 文献 DOI
 * @returns {Promise<object>} { openAlexId, citedByCount, countsByYear }
 */
function fetchWorkMetaFromOpenAlex(doi) {
  return new Promise(function(resolve) {
    if (!doi) {
      resolve({ openAlexId: '', citedByCount: 0, countsByYear: [] });
      return;
    }
    callOpenAlexProxy('fetchByDOI', { doi: doi }).then(function(data) {
      if (data && data.id) {
        var countsByYear = [];
        if (data.counts_by_year && data.counts_by_year.length > 0) {
          countsByYear = data.counts_by_year.map(function(item) {
            return { year: item.year, count: item.cited_by_count };
          }).sort(function(a, b) { return a.year - b.year; });
        }
        resolve({
          openAlexId: data.id.replace('https://openalex.org/', ''),
          citedByCount: data.cited_by_count || 0,
          countsByYear: countsByYear
        });
      } else {
        resolve({ openAlexId: '', citedByCount: 0, countsByYear: [] });
      }
    }).catch(function() {
      resolve({ openAlexId: '', citedByCount: 0, countsByYear: [] });
    });
  });
}

/**
 * 通过 DOI 从 OpenAlex 获取文献标题
 * @param {string} doi - 文献 DOI
 * @returns {Promise<string>} 文献标题，失败时返回空字符串
 */
function fetchTitleFromOpenAlex(doi) {
  return new Promise(function(resolve) {
    if (!doi) {
      resolve('');
      return;
    }
    callOpenAlexProxy('fetchByDOI', { doi: doi }).then(function(data) {
      if (data && data.title) {
        resolve(data.title);
      } else {
        resolve('');
      }
    }).catch(function() {
      resolve('');
    });
  });
}

/**
 * 通用 group_by 查询
 * @param {string} openAlexId - OpenAlex ID
 * @param {string} groupBy - group_by 字段名
 * @returns {Promise<Array>} [{name, count}]
 */
function fetchCitingGroupBy(openAlexId, groupBy) {
  return new Promise(function(resolve) {
    if (!openAlexId) {
      resolve([]);
      return;
    }
    callOpenAlexProxy('fetchCiting', { openAlexId: openAlexId, groupBy: groupBy }).then(function(data) {
      if (data && data.group_by) {
        var groups = data.group_by;
        var result = [];
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          var name = g.key_display_name || g.key;
          if (typeof name === 'object' && name !== null) {
            name = name.display_name || (name.name || JSON.stringify(name));
          }
          if (name && g.count) {
            result.push({ name: name, count: g.count });
          }
        }
        result.sort(function(a, b) { return b.count - a.count; });
        resolve(result);
      } else {
        resolve([]);
      }
    }).catch(function() { resolve([]); });
  });
}

/**
 * 获取被引主题分布
 * @param {string} openAlexId - OpenAlex ID
 */
function fetchCitingTopics(openAlexId) {
  return fetchCitingGroupBy(openAlexId, 'primary_topic.id');
}

/**
 * 获取被引机构分布
 * @param {string} openAlexId - OpenAlex ID
 */
function fetchCitingInstitutions(openAlexId) {
  return fetchCitingGroupBy(openAlexId, 'authorships.institutions.id');
}

/**
 * 获取被引类型分布
 * @param {string} openAlexId - OpenAlex ID
 */
function fetchCitingTypes(openAlexId) {
  return fetchCitingGroupBy(openAlexId, 'type');
}

/**
 * 获取被引文献列表
 * @param {string} openAlexId - OpenAlex ID
 * @param {number} rows - 每页数量，默认20
 * @param {number} page - 页码，默认1（首次加载）或后续页码
 * @returns {Promise<object>} { list: Array, nextPage: number|null, total: number }
 */
function fetchCitingWorks(openAlexId, rows, page) {
  rows = rows || 20;
  page = page || 1;
  return new Promise(function(resolve) {
    if (!openAlexId) {
      resolve({ list: [], nextPage: null, total: 0 });
      return;
    }
    callOpenAlexProxy('fetchCiting', { openAlexId: openAlexId, perPage: rows, page: page }).then(function(data) {
      if (data && data.results) {
        var items = data.results;
        var results = [];
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var authors = [];
          if (item.authorships && item.authorships.length > 0) {
            for (var j = 0; j < Math.min(item.authorships.length, 5); j++) {
              var a = item.authorships[j];
              if (a.author && a.author.display_name) {
                authors.push(a.author.display_name);
              }
            }
          }
          results.push({
            title: item.display_name || '未知标题',
            authorsStr: authors.join(', '),
            year: item.publication_year || '',
            doi: item.doi ? item.doi.replace('https://doi.org/', '') : '',
            containerTitle: (item.primary_location && item.primary_location.source && item.primary_location.source.display_name) || ''
          });
        }
        // 获取分页信息
        var meta = data.meta || {};
        var total = meta.count || 0;
        var currentPage = page;
        var totalPages = Math.ceil(total / rows);
        // 是否有下一页
        var nextPage = currentPage < totalPages ? currentPage + 1 : null;
        resolve({ list: results, nextPage: nextPage, total: total });
      } else {
        resolve({ list: [], nextPage: null, total: 0 });
      }
    }).catch(function() { resolve({ list: [], nextPage: null, total: 0 }); });
  });
}

module.exports = {
  fetchWorkMetaFromOpenAlex: fetchWorkMetaFromOpenAlex,
  fetchTitleFromOpenAlex: fetchTitleFromOpenAlex,
  fetchCitingGroupBy: fetchCitingGroupBy,
  fetchCitingTopics: fetchCitingTopics,
  fetchCitingInstitutions: fetchCitingInstitutions,
  fetchCitingTypes: fetchCitingTypes,
  fetchCitingWorks: fetchCitingWorks
};
