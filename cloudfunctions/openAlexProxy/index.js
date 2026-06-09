// 云函数 - 代理 OpenAlex 和 Crossref API
// 解决国内网络无法访问国外 API 的问题
const cloud = require('wx-server-sdk');
const https = require('https');
const http = require('http');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 通用 HTTP 请求函数（支持超时）
 */
function httpGet(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      
      if (res.statusCode !== 200) {
        resolve({ statusCode: res.statusCode, data: null });
        return;
      }
      
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: 200, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: 200, data: data });
        }
      });
    });
    
    req.on('error', (err) => {
      reject(new Error(`请求失败: ${err.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    
    req.setTimeout(timeout);
  });
}

/**
 * 代理 OpenAlex API
 */
async function proxyOpenAlex(action, params) {
  let url = 'https://api.openalex.org/works';
  
  if (action === 'fetchByDOI' && params.doi) {
    url = `https://api.openalex.org/works/doi:${params.doi}`;
  } else if (action === 'fetchCiting' && params.openAlexId) {
    url = 'https://api.openalex.org/works';
    const queryParams = new URLSearchParams({
      filter: `cites:${params.openAlexId}`,
      'per-page': params.perPage || 200
    });
    if (params.groupBy) {
      queryParams.append('group_by', params.groupBy);
    }
    if (params.page) {
      queryParams.append('page', params.page);
    }
    url += '?' + queryParams.toString();
  }
  
  try {
    const result = await httpGet(url);
    return { success: true, data: result.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 代理 Crossref API
 */
async function proxyCrossref(action, params) {
  let url = 'https://api.crossref.org/works';
  
  if (action === 'fetchByDOI' && params.doi) {
    url += `/${params.doi}`;
  } else if (action === 'searchByTitle' && params.title) {
    const queryParams = new URLSearchParams({
      query: params.title,
      rows: params.rows || 5,
      sort: 'relevance'
    });
    url += '?' + queryParams.toString();
  }
  
  try {
    const result = await httpGet(url);
    return { success: true, data: result.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

exports.main = async (event, context) => {
  const { action, api, params } = event;
  
  if (!action || !api) {
    return { success: false, error: '缺少必要参数: action 和 api' };
  }
  
  try {
    if (api === 'openalex') {
      return await proxyOpenAlex(action, params || {});
    } else if (api === 'crossref') {
      return await proxyCrossref(action, params || {});
    } else {
      return { success: false, error: `不支持的 API 类型: ${api}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};
