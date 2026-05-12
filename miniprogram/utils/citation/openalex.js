// utils/citation/openalex.js
// 调用 OpenAlex API 获取文献元数据

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
    wx.request({
      url: 'https://api.openalex.org/works/doi:' + encodeURIComponent(doi),
      method: 'GET',
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.id) {
          var countsByYear = [];
          if (res.data.counts_by_year && res.data.counts_by_year.length > 0) {
            countsByYear = res.data.counts_by_year.map(function(item) {
              return { year: item.year, count: item.cited_by_count };
            }).sort(function(a, b) { return a.year - b.year; });
          }
          resolve({
            openAlexId: res.data.id.replace('https://openalex.org/', ''),
            citedByCount: res.data.cited_by_count || 0,
            countsByYear: countsByYear
          });
        } else {
          resolve({ openAlexId: '', citedByCount: 0, countsByYear: [] });
        }
      },
      fail: function() {
        resolve({ openAlexId: '', citedByCount: 0, countsByYear: [] });
      }
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
    wx.request({
      url: 'https://api.openalex.org/works/doi:' + encodeURIComponent(doi),
      method: 'GET',
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.title) {
          resolve(res.data.title);
        } else {
          resolve('');
        }
      },
      fail: function() {
        resolve('');
      }
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
    wx.request({
      url: 'https://api.openalex.org/works',
      method: 'GET',
      data: {
        filter: 'cites:' + openAlexId,
        'per-page': 200,
        'group_by': groupBy
      },
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.group_by) {
          var groups = res.data.group_by;
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
      },
      fail: function() { resolve([]); }
    });
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
    var requestData = {
      filter: 'cites:' + openAlexId,
      'per-page': rows,
      page: page
    };
    wx.request({
      url: 'https://api.openalex.org/works',
      method: 'GET',
      data: requestData,
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.results) {
          var items = res.data.results;
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
          var meta = res.data.meta || {};
          var total = meta.count || 0;
          var currentPage = page;
          var totalPages = Math.ceil(total / rows);
          // 是否有下一页
          var nextPage = currentPage < totalPages ? currentPage + 1 : null;
          resolve({ list: results, nextPage: nextPage, total: total });
        } else {
          resolve({ list: [], nextPage: null, total: 0 });
        }
      },
      fail: function() { resolve({ list: [], nextPage: null, total: 0 }); }
    });
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
