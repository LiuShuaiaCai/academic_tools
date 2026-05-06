// pages/filePreview/filePreview.js
Page({
  data: {
    fileId: '',
    fileType: '',
    isHtml: false,
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
        var filePath = res.tempFilePath;
        
        if (fileType === 'html' || fileType === 'htm') {
          // HTML 文件：读取内容并显示
          that.renderHtml(filePath);
        } else if (fileType === 'md') {
          // MD 文件：读取内容并渲染
          that.renderMarkdown(filePath);
        } else if (fileType === 'xml') {
          // XML 文件：作为代码显示
          that.renderCodeFile(filePath, 'xml');
        } else {
          wx.showToast({ title: '不支持的预览格式', icon: 'none' });
          setTimeout(function() { wx.navigateBack(); }, 1500);
        }
      },
      fail: function(err) {
        wx.hideLoading();
        wx.showToast({ title: '文件下载失败', icon: 'none' });
        console.error(err);
        setTimeout(function() { wx.navigateBack(); }, 1500);
      }
    });
  },

  renderHtml: function(filePath) {
    var that = this;
    var fs = wx.getFileSystemManager();
    
    fs.readFile({
      filePath: filePath,
      encoding: 'utf-8',
      success: function(res) {
        that.setData({
          isHtml: true,
          renderedContent: res.data
        });
      },
      fail: function(err) {
        wx.showToast({ title: '文件读取失败', icon: 'none' });
        console.error(err);
      }
    });
  },

  renderMarkdown: function(filePath) {
    var that = this;
    var fs = wx.getFileSystemManager();
    
    fs.readFile({
      filePath: filePath,
      encoding: 'utf-8',
      success: function(res) {
        var mdContent = res.data;
        var htmlContent = that.mdToHtml(mdContent);
        that.setData({
          showWebView: false,
          renderedContent: htmlContent
        });
      },
      fail: function(err) {
        wx.showToast({ title: '文件读取失败', icon: 'none' });
        console.error(err);
      }
    });
  },

  renderCodeFile: function(filePath, language) {
    var that = this;
    var fs = wx.getFileSystemManager();
    
    fs.readFile({
      filePath: filePath,
      encoding: 'utf-8',
      success: function(res) {
        var content = res.data;
        // 转义 HTML 特殊字符
        var escaped = content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
          .replace(/\n/g, '<br/>')
          .replace(/ /g, '&nbsp;');
        
        var html = '<pre><code class="' + language + '">' + escaped + '</code></pre>';
        that.setData({
          showWebView: false,
          renderedContent: html
        });
      },
      fail: function(err) {
        wx.showToast({ title: '文件读取失败', icon: 'none' });
        console.error(err);
      }
    });
  },

  // 简单的 Markdown 转 HTML
  mdToHtml: function(md) {
    var html = md;
    
    // 代码块（必须在行内代码之前处理）
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
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // 粗体和斜体
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // 图片
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1"/>');
    
    // 引用块
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    
    // 水平线
    html = html.replace(/^---$/gim, '<hr/>');
    html = html.replace(/^\*\*\*$/gim, '<hr/>');
    
    // 无序列表
    html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
    html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');
    
    // 段落（处理连续两个换行）
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    // 清理多余的 <p> 标签（标题、列表、代码块等元素不应该被 <p> 包裹）
    html = html.replace(/<p><(h[1-6]|ul|ol|pre|blockquote|hr)/g, '<$1');
    html = html.replace(/<\/(h[1-6]|ul|ol|pre|blockquote|hr)><\/p>/g, '</$1>');
    
    return html;
  }
});
