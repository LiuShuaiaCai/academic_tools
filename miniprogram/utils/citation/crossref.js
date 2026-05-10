// utils/citation/crossref.js
// 调用 Crossref API 获取文献元数据

const CROSSREF_API_BASE = 'https://api.crossref.org/works';

/**
 * 通过 DOI 获取文献信息
 * @param {string} doi - 文献 DOI
 * @returns {Promise<object>} 文献信息
 */
function fetchByDOI(doi) {
  return new Promise(function(resolve, reject) {
    wx.request({
      url: CROSSREF_API_BASE + '/' + encodeURIComponent(doi),
      method: 'GET',
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.message) {
          var msg = res.data.message;
          resolve(parseCrossrefWork(msg));
        } else {
          reject(new Error('未找到该 DOI 对应的文献'));
        }
      },
      fail: function(err) {
        reject(new Error('网络请求失败：' + (err.errMsg || '未知错误')));
      }
    });
  });
}

/**
 * 通过标题搜索文献
 * @param {string} title - 文献标题
 * @param {number} rows - 返回数量，默认5
 * @returns {Promise<Array>} 文献列表
 */
function searchByTitle(title, rows) {
  rows = rows || 5;
  return new Promise(function(resolve, reject) {
    wx.request({
      url: CROSSREF_API_BASE,
      method: 'GET',
      data: {
        query: title,
        rows: rows,
        sort: 'relevance'
      },
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.message) {
          var items = res.data.message.items || [];
          var results = [];
          for (var i = 0; i < items.length; i++) {
            results.push(parseCrossrefWork(items[i]));
          }
          resolve(results);
        } else {
          reject(new Error('搜索失败'));
        }
      },
      fail: function(err) {
        reject(new Error('网络请求失败：' + (err.errMsg || '未知错误')));
      }
    });
  });
}

/**
 * 解析 Crossref 返回的数据结构
 * @param {object} work - Crossref work 对象
 * @returns {object} 标准化的文献对象
 */
function parseCrossrefWork(work) {
  var authors = [];
  if (work.author && work.author.length > 0) {
    for (var i = 0; i < work.author.length; i++) {
      var a = work.author[i];
      authors.push({
        family: a.family || '',
        given: a.given || ''
      });
    }
  }

  var containerTitle = '';
  if (work['container-title'] && work['container-title'].length > 0) {
    containerTitle = work['container-title'][0];
  }

  var issuedDate = null;
  if (work.issued && work.issued['date-parts'] && work.issued['date-parts'][0]) {
    var parts = work.issued['date-parts'][0];
    issuedDate = parts[0] ? String(parts[0]) : '';
    if (parts[1]) issuedDate += '-' + String(parts[1]).padStart(2, '0');
    if (parts[2]) issuedDate += '-' + String(parts[2]).padStart(2, '0');
  }

  // 清理摘要中的 XML 标签
  var abstract = '';
  if (work.abstract) {
    abstract = work.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 关键词
  var subjects = [];
  if (work.subject && work.subject.length > 0) {
    subjects = work.subject;
  }

  // 引用文献列表（该文献引用了哪些文献）
  var references = [];
  if (work.reference && work.reference.length > 0) {
    for (var ri = 0; ri < work.reference.length; ri++) {
      var r = work.reference[ri];
      references.push({
        title: r['article-title'] || r['unstructured'] || '未知标题',
        authors: r.author || '',
        year: r.year || '',
        doi: r.DOI || ''
      });
    }
  }

  return {
    doi: work.DOI || '',
    title: work.title && work.title.length > 0 ? work.title[0] : '',
    authors: authors,
    containerTitle: containerTitle,
    volume: work.volume || '',
    issue: work.issue || '',
    page: work.page || '',
    publishedDate: issuedDate,
    year: issuedDate ? parseInt(issuedDate.substring(0, 4)) : null,
    publisher: work.publisher || '',
    type: mapCrossrefType(work.type),
    url: work.URL || (work.DOI ? 'https://doi.org/' + work.DOI : ''),
    abstract: abstract,
    subjects: subjects,
    referenceCount: work['reference-count'] || 0,
    citedByCount: work['is-referenced-by-count'] || 0,
    references: references
  };
}

/**
 * 获取每年被引次数统计
 * @param {string} doi - 文献 DOI
 * @returns {Promise<Array>} 按年份排序的被引次数数组 [{year, count}]
 */
function fetchCitationsByYear(doi) {
  return new Promise(function(resolve) {
    if (!doi) {
      resolve([]);
      return;
    }
    // 先通过 DOI 获取 OpenAlex ID
    wx.request({
      url: 'https://api.openalex.org/works/doi:' + encodeURIComponent(doi),
      method: 'GET',
      success: function(res1) {
        if (res1.statusCode !== 200 || !res1.data || !res1.data.id) {
          resolve([]);
          return;
        }
        var openAlexId = res1.data.id.replace('https://openalex.org/', '');
        // 使用 OpenAlex group_by 按年份统计被引次数
        wx.request({
          url: 'https://api.openalex.org/works',
          method: 'GET',
          data: {
            filter: 'cites:' + openAlexId,
            'per-page': 200,
            'group_by': 'publication_year'
          },
          success: function(res2) {
            if (res2.statusCode === 200 && res2.data && res2.data.group_by) {
              var groups = res2.data.group_by;
              var result = [];
              for (var i = 0; i < groups.length; i++) {
                var g = groups[i];
                if (g.key && g.count) {
                  result.push({ year: parseInt(g.key), count: g.count });
                }
              }
              result.sort(function(a, b) { return a.year - b.year; });
              resolve(result);
            } else {
              resolve([]);
            }
          },
          fail: function() { resolve([]); }
        });
      },
      fail: function() { resolve([]); }
    });
  });
}

/**
 * 映射 Crossref 类型到本地类型
 */
function mapCrossrefType(type) {
  var typeMap = {
    'journal-article': 'journal',
    'book': 'book',
    'book-chapter': 'book',
    'proceedings-article': 'conference',
    'dissertation': 'thesis',
    'report': 'book',
    'journal-issue': 'journal',
    'book-series': 'book',
    'edited-book': 'book',
    'monograph': 'book',
    'reference-entry': 'journal',
    'posted-content': 'journal'
  };
  return typeMap[type] || 'journal';
}

/**
 * 获取引用文献列表
 * @param {string} doi - 文献 DOI
 * @returns {Promise<Array>} 引用文献列表
 */
function fetchReferences(doi) {
  return new Promise(function(resolve) {
    if (!doi) {
      resolve([]);
      return;
    }
    wx.request({
      url: CROSSREF_API_BASE + '/' + encodeURIComponent(doi),
      method: 'GET',
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.message) {
          var refs = res.data.message.reference || [];
          var results = [];
          for (var i = 0; i < refs.length; i++) {
            var r = refs[i];
            results.push({
              title: r['article-title'] || r['unstructured'] || '未知标题',
              authors: r.author || '',
              year: r.year || '',
              doi: r.DOI || ''
            });
          }
          resolve(results);
        } else {
          resolve([]);
        }
      },
      fail: function() {
        resolve([]);
      }
    });
  });
}

/**
 * 获取被引文献列表
 * @param {string} doi - 文献 DOI
 * @param {number} rows - 返回数量，默认20
 * @returns {Promise<Array>} 被引文献列表
 */
function fetchCitingWorks(doi, rows) {
  rows = rows || 20;
  return new Promise(function(resolve) {
    if (!doi) {
      resolve([]);
      return;
    }
    // 先通过 DOI 获取 OpenAlex ID
    wx.request({
      url: 'https://api.openalex.org/works/doi:' + encodeURIComponent(doi),
      method: 'GET',
      success: function(res1) {
        if (res1.statusCode !== 200 || !res1.data || !res1.data.id) {
          resolve([]);
          return;
        }
        var openAlexId = res1.data.id.replace('https://openalex.org/', '');
        // 使用 OpenAlex 获取被引文献列表
        wx.request({
          url: 'https://api.openalex.org/works',
          method: 'GET',
          data: {
            filter: 'cites:' + openAlexId,
            'per-page': rows
          },
          success: function(res2) {
            if (res2.statusCode === 200 && res2.data && res2.data.results) {
              var items = res2.data.results;
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
              resolve(results);
            } else {
              resolve([]);
            }
          },
          fail: function() { resolve([]); }
        });
      },
      fail: function() { resolve([]); }
    });
  });
}

/**
 * 通用 group_by 查询（通过 OpenAlex）
 * @param {string} doi
 * @param {string} groupBy - OpenAlex group_by 字段
 * @returns {Promise<Array>} [{name, count}]
 */
function fetchCitingGroupBy(doi, groupBy) {
  return new Promise(function(resolve) {
    if (!doi) {
      resolve([]);
      return;
    }
    wx.request({
      url: 'https://api.openalex.org/works/doi:' + encodeURIComponent(doi),
      method: 'GET',
      success: function(res1) {
        if (res1.statusCode !== 200 || !res1.data || !res1.data.id) {
          resolve([]);
          return;
        }
        var openAlexId = res1.data.id.replace('https://openalex.org/', '');
        wx.request({
          url: 'https://api.openalex.org/works',
          method: 'GET',
          data: {
            filter: 'cites:' + openAlexId,
            'per-page': 200,
            'group_by': groupBy
          },
          success: function(res2) {
            if (res2.statusCode === 200 && res2.data && res2.data.group_by) {
              var groups = res2.data.group_by;
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
      },
      fail: function() { resolve([]); }
    });
  });
}

function fetchCitingTopics(doi) {
  return fetchCitingGroupBy(doi, 'primary_topic.id');
}

function fetchCitingInstitutions(doi) {
  return fetchCitingGroupBy(doi, 'authorships.institutions.id');
}

function fetchCitingTypes(doi) {
  return fetchCitingGroupBy(doi, 'type');
}

module.exports = {
  fetchByDOI: fetchByDOI,
  searchByTitle: searchByTitle,
  parseCrossrefWork: parseCrossrefWork,
  fetchCitationsByYear: fetchCitationsByYear,
  fetchReferences: fetchReferences,
  fetchCitingWorks: fetchCitingWorks,
  fetchCitingTopics: fetchCitingTopics,
  fetchCitingInstitutions: fetchCitingInstitutions,
  fetchCitingTypes: fetchCitingTypes
};
