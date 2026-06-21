// pages/filePreview/filePreview.js
Page({
  data: {
    fileId: '',
    fileType: '',
    renderedContent: ''
  },

  onLoad: function(options) {
    var fileId = options.fileId || '';
    var fileType = (options.fileType || '').toLowerCase();
    this.setData({ fileId: fileId, fileType: fileType });
    this.loadAndPreview(fileId, fileType);
  },

  loadAndPreview: function(fileId, fileType) {
    var that = this;
    wx.showLoading({ title: '正在加载...' });

    wx.cloud.downloadFile({
      fileID: fileId,
      success: function(res) {
        wx.hideLoading();
        var fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: res.tempFilePath,
          encoding: 'utf-8',
          success: function(readRes) {
            var content = readRes.data;
            if (fileType === 'html' || fileType === 'htm') {
              that.renderHtml(content);
            } else if (fileType === 'md') {
              that.renderMarkdown(content);
            } else if (fileType === 'xml') {
              that.renderXml(content);
            } else {
              wx.showToast({ title: '不支持的预览格式', icon: 'none' });
              setTimeout(function() { wx.navigateBack(); }, 1500);
            }
          },
          fail: function(err) {
            wx.showToast({ title: '文件读取失败', icon: 'none' });
            console.error(err);
          }
        });
      },
      fail: function(err) {
        wx.hideLoading();
        wx.showToast({ title: '文件下载失败', icon: 'none' });
        console.error(err);
        setTimeout(function() { wx.navigateBack(); }, 1500);
      }
    });
  },

  /** HTML 渲染：提取 body 内容，清除 script/style 等无效标签 */
  renderHtml: function(rawHtml) {
    var body = rawHtml;

    // 提取 <body> 内容
    var bodyMatch = body.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      body = bodyMatch[1];
    }

    // 删除 script 标签
    body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
    // 删除 style 标签（rich-text 不支持 style 标签，内容会变成文本显示）
    body = body.replace(/<style[\s\S]*?<\/style>/gi, '');
    // 删除 HTML 注释
    body = body.replace(/<!--[\s\S]*?-->/g, '');
    // 删除 <link> 标签
    body = body.replace(/<link[^>]*>/gi, '');
    // 删除 <meta> 标签
    body = body.replace(/<meta[^>]*>/gi, '');
    // 删除多余的空白
    body = body.replace(/\n{3,}/g, '\n\n');

    this.setData({ renderedContent: body });
  },

  /** XML 渲染：转义后显示为代码 */
  renderXml: function(content) {
    var escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br/>')
      .replace(/  /g, '&nbsp;&nbsp;');

    var html = '<pre><code>' + escaped + '</code></pre>';
    this.setData({ renderedContent: html });
  },

  /** Markdown → HTML */
  renderMarkdown: function(md) {
    var html = md;

    // 代码块（在行内代码前面处理）
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
      var escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      return '<pre><code class="' + (lang || '') + '">' + escaped + '</code></pre>';
    });

    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 标题
    html = html.replace(/^### (.+)$/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gim, '<h1>$1</h1>');

    // 粗体 + 斜体
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 图片
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1"/>');

    // 引用块
    html = html.replace(/^> (.+)$/gim, '<blockquote>$1</blockquote>');

    // 水平线
    html = html.replace(/^(---|\*\*\*)$/gim, '<hr/>');

    // 无序列表
    var lines = html.split('\n');
    var inUl = false, inOl = false;
    var result = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var ulMatch = line.match(/^[\-\*] (.+)$/);
      var olMatch = line.match(/^\d+\. (.+)$/);

      if (ulMatch) {
        if (!inUl) { inUl = true; result.push('<ul>'); }
        if (inOl) { inOl = false; result.push('</ol>'); }
        result.push('<li>' + ulMatch[1] + '</li>');
      } else if (olMatch) {
        if (!inOl) { inOl = true; result.push('<ol>'); }
        if (inUl) { inUl = false; result.push('</ul>'); }
        result.push('<li>' + olMatch[1] + '</li>');
      } else {
        if (inUl) { inUl = false; result.push('</ul>'); }
        if (inOl) { inOl = false; result.push('</ol>'); }
        result.push(line);
      }
    }
    if (inUl) result.push('</ul>');
    if (inOl) result.push('</ol>');
    html = result.join('\n');

    // 段落
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // 清理包裹
    html = html.replace(/<p><(h[1-6]|ul|ol|pre|blockquote|hr)/g, '<$1');
    html = html.replace(/<\/(h[1-6]|ul|ol|pre|blockquote|hr)><\/p>/g, '</$1>');
    html = html.replace(/<p><\/p>/g, '');

    this.setData({ renderedContent: html });
  }
});
