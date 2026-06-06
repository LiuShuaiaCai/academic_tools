// pages/reviews/form/form.js
var dbInit = require('../../../utils/dbInit');
var formatTime = dbInit.formatTime;
var parseDate = dbInit.parseDate;
var config = require('../../../utils/reviews-config');
var formatUtil = require('../../../utils/reviews-format');
var templateData = require('../../../utils/review-templates-data');
var aiReviewUtil = require('../../../utils/review-ai');
var creditsUtil = require('../../../utils/credits');
var reminderCheck = require('../../../utils/reminder-check');

Component({
  properties: {
    show: { type: Boolean, value: false },
    isEdit: { type: Boolean, value: false },
    editId: { type: String, value: '' }
  },

  data: {
    form: {
      paperTitle: '', journal: '', reviewId: '', deadline: '', invitedDate: '',
      status: 'pending', decision: '', round: 0,
      systemUrl: '', systemAccount: '', systemPassword: '', editorEmail: '',
      note: '',
      relatedReviewId: '', relatedReviewTitle: '', relatedReviewIdx: 0,
      tlNewDate: '', tlNewEventIdx: -1, tlNewRemark: '',
      timelineList: [],
      decisionIdx: -1,
      roundIdx: 0,
      manuscript: { fileID: '', fileName: '', fileSize: 0, fileSizeText: '', fileType: '', uploadTime: '' }
    },
    statusOptions: config.STATUS_OPTIONS_FOR_FORM,
    decisionOptions: config.DECISION_OPTIONS,
    roundOptions: config.ROUND_OPTIONS,
    tlEventOptions: config.TL_EVENT_OPTIONS,
    relatedReviewOptions: [],
    // 审稿决定弹窗
    showDecisionModal: false,
    decisionId: '',
    decisionPaper: '',
    decisionJournal: '',
    decision: '',

    // ======== 审稿模板相关 ========
    showTemplateModal: false,
    templatePublishers: templateData.PUBLISHERS,
    publisherMap: {},
    templateList: [],
    filteredTemplates: [],
    selectedPublisher: '',
    selectedTemplate: null,
    templateSelections: [],   // 数组，索引对应模板 items 索引

    // ======== 稿件上传相关 ========
    manuscriptUploading: false,
    manuscriptUploadPercent: 0,
    aiReviewLoading: false,
    showQuotaTip: false,
    showNotePreview: false,
    notePreviewText: ''
  },

  lifetimes: {
    attached: function() {
      if (this.data.isEdit && this.data.editId) {
        this.loadEditData(this.data.editId);
      }
      this.loadRelatedReviews(this.data.editId || null);
      this.initTemplates();
    }
  },

  observers: {
    'show': function(show) {
      if (show && !this.data.isEdit) {
        this.resetForm();
      }
    },
    'isEdit, editId': function(isEdit, editId) {
      if (isEdit && editId) {
        this.loadEditData(editId);
      } else if (!isEdit) {
        this.resetForm();
      }
    }
  },

  methods: {
    initTemplates: function() {
      var templates = templateData.TEMPLATES.map(function(t, idx) {
        return Object.assign({}, t, { _index: idx });
      });
      // 建立出版商 id→{name,color} 映射
      var pubMap = {};
      templateData.PUBLISHERS.forEach(function(p) { pubMap[p.id] = { name: p.name, color: p.color }; });
      this.setData({
        templateList: templates,
        filteredTemplates: templates,
        publisherMap: pubMap
      });
    },

    resetForm: function() {
      this.setData({
        form: {
          paperTitle: '', journal: '', reviewId: '', deadline: '', invitedDate: '',
          status: 'pending', decision: '', round: 0,
          systemUrl: '', systemAccount: '', systemPassword: '', editorEmail: '',
          note: '',
          relatedReviewId: '', relatedReviewTitle: '', relatedReviewIdx: 0,
          tlNewDate: '', tlNewEventIdx: -1, tlNewRemark: '',
          timelineList: [],
          decisionIdx: -1,
          roundIdx: 0,
          manuscript: { fileID: '', fileName: '', fileSize: 0, fileSizeText: '', fileType: '', uploadTime: '' }
        },
        selectedTemplate: null,
        templateSelections: [],
        manuscriptUploading: false,
        manuscriptUploadPercent: 0,
        aiReviewLoading: false
      });
      this.loadRelatedReviews(null);
    },

    loadEditData: function(id) {
      var that = this;
      this.loadRelatedReviews(id);
      wx.cloud.database().collection('reviews').doc(id).get().then(function(res) {
        var item = res.data;
        if (!item) return;

        // 时间线
        var tlList = (item.timeline || []).map(function(t) {
          return { date: t.date || '', event: t.event || '', remark: t.remark || '', dotColor: t.dotColor || '' };
        });
        var colorMap = {};
        config.TL_EVENT_OPTIONS.forEach(function(opt) { colorMap[opt.label] = opt.color; });
        tlList.forEach(function(tl) {
          if (!tl.dotColor && colorMap[tl.event]) {
            tl.dotColor = colorMap[tl.event];
          }
        });
        tlList.sort(function(a, b) { return b.date.localeCompare(a.date); });

        // 查找 decision 和 round 的索引
        var dIdx = -1;
        var decisionVal = item.decision || '';
        for (var di = 0; di < config.DECISION_OPTIONS.length; di++) {
          if (config.DECISION_OPTIONS[di].value === decisionVal) { dIdx = di; break; }
        }
        var rIdx = 0;
        var roundVal = item.round || 0;
        for (var ri = 0; ri < config.ROUND_OPTIONS.length; ri++) {
          if (config.ROUND_OPTIONS[ri].value === roundVal) { rIdx = ri; break; }
        }

        // manuscript 文件大小格式化
        var ms = item.manuscript || {};
        var msFileSizeText = '';
        if (ms.fileSize) {
          msFileSizeText = ms.fileSize > 1048576 ? (ms.fileSize / 1048576).toFixed(1) + ' MB' : (ms.fileSize / 1024).toFixed(0) + ' KB';
        }

        that.setData({
          form: {
            paperTitle: item.paperTitle || '',
            journal: item.journal || '',
            reviewId: item.reviewId || '',
            deadline: formatUtil.formatDeadlineToDate(item.deadline),
            invitedDate: formatUtil.formatDeadlineToDate(item.invitedDate),
            status: item.status || 'pending',
            decision: item.decision || '',
            decisionIdx: dIdx,
            round: item.round || 0,
            roundIdx: rIdx,
            systemUrl: item.systemUrl || '',
            systemAccount: item.systemAccount || '',
            systemPassword: item.systemPassword || '',
            editorEmail: item.editorEmail || '',
            note: item.note || '',
            relatedReviewId: item.relatedReviewId || '',
            relatedReviewTitle: '',
            relatedReviewIdx: 0,
            tlNewDate: '', tlNewEventIdx: -1, tlNewRemark: '',
            timelineList: tlList,
            manuscript: {
              fileID: ms.fileID || '',
              fileName: ms.fileName || '',
              fileSize: ms.fileSize || 0,
              fileSizeText: msFileSizeText,
              fileType: ms.fileType || '',
              uploadTime: ms.uploadTime || ''
            }
          }
        });

        // 延迟匹配关联审稿标题和索引
        var rid = item.relatedReviewId;
        if (rid) {
          setTimeout(function() {
            var opts = that.data.relatedReviewOptions;
            for (var i = 0; i < opts.length; i++) {
              if (opts[i]._id === rid) {
                that.setData({
                  'form.relatedReviewTitle': opts[i].title,
                  'form.relatedReviewIdx': i
                });
                break;
              }
            }
          }, 800);
        }
      }).catch(function() {
        wx.showToast({ title: '加载失败', icon: 'error' });
      });
    },

    // 加载关联审稿列表（同一稿件多轮审稿）
    loadRelatedReviews: function(excludeId) {
      var that = this;
      wx.cloud.database().collection('reviews').where({ deleteTime: null })
        .orderBy('updateTime', 'desc').limit(50).get()
        .then(function(res) {
          var opts = [{ _id: '', title: '不关联' }];
          (res.data || []).forEach(function(item) {
            if (item._id !== excludeId) {
              opts.push({ _id: item._id, title: item.paperTitle || '(无标题)' });
            }
          });
          that.setData({ relatedReviewOptions: opts });
        });
    },

    onFormInput: function(e) {
      var field = e.currentTarget.dataset.field;
      var val = e.detail.value;
      var data = {};
      data['form.' + field] = val;
      this.setData(data);
    },

    onDeadlineChange: function(e) {
      this.setData({ 'form.deadline': e.detail.value });
    },

    onInvitedDateChange: function(e) {
      this.setData({ 'form.invitedDate': e.detail.value });
    },

    onSelectStatus: function(e) {
      this.setData({ 'form.status': e.currentTarget.dataset.status });
    },

    onDecisionChange: function(e) {
      var idx = parseInt(e.detail.value);
      var val = this.data.decisionOptions[idx].value;
      this.setData({ 'form.decision': val, 'form.decisionIdx': idx });
    },

    onRoundChange: function(e) {
      var idx = parseInt(e.detail.value);
      var val = this.data.roundOptions[idx].value;
      this.setData({ 'form.round': val, 'form.roundIdx': idx });
    },

    onRelatedReviewChange: function(e) {
      var idx = parseInt(e.detail.value);
      var opts = this.data.relatedReviewOptions;
      var sel = opts[idx];
      this.setData({
        'form.relatedReviewId': sel ? sel._id : '',
        'form.relatedReviewTitle': sel ? sel.title : '不关联',
        'form.relatedReviewIdx': idx
      });
    },

    // ======== 时间线 ========
    addTimelineItem: function() {
      var f = this.data.form;
      if (!f.tlNewDate || f.tlNewEventIdx < 0) {
        wx.showToast({ title: '请选择日期和事件', icon: 'none' });
        return;
      }
      var ev = this.data.tlEventOptions[f.tlNewEventIdx];
      var tl = (this.data.form.timelineList || []).slice();
      var remark = (f.tlNewRemark || '').trim();
      var newItem = { date: f.tlNewDate, event: ev.label, dotColor: ev.color, remark: remark };
      tl.push(newItem);
      tl.sort(function(a, b) { return b.date.localeCompare(a.date); });
      this.setData({
        'form.timelineList': tl,
        'form.tlNewDate': '',
        'form.tlNewEventIdx': -1,
        'form.tlNewRemark': ''
      });
      wx.showToast({ title: '已添加：' + ev.label, icon: 'success' });
    },

    removeTimelineItem: function(e) {
      var idx = e.currentTarget.dataset.i;
      var tl = this.data.form.timelineList.slice();
      tl.splice(idx, 1);
      this.setData({ 'form.timelineList': tl });
    },

    // 清空审稿笔记
    clearNote: function() {
      if (!this.data.form.note) return;
      var that = this;
      wx.showModal({
        title: '确认清空',
        content: '确定要清空审稿笔记吗？',
        confirmColor: '#EF4444',
        success: function(res) {
          if (res.confirm) {
            that.setData({ 'form.note': '' });
          }
        }
      });
    },

    // ======== 审稿模板弹窗 ========
    showTemplateModal: function() {
      this.setData({
        showTemplateModal: true,
        selectedPublisher: '',
        selectedTemplate: null,
        templateSelections: [],
        filteredTemplates: this.data.templateList
      });
    },

    closeTemplateModal: function() {
      this.setData({ showTemplateModal: false });
    },

    // 按出版商筛选
    filterByPublisher: function(e) {
      var pubId = e.currentTarget.dataset.publisher;
      var filtered;
      if (!pubId || pubId === '') {
        filtered = this.data.templateList;
      } else {
        filtered = this.data.templateList.filter(function(t) { return t.publisher === pubId; });
      }
      this.setData({
        selectedPublisher: pubId || '',
        filteredTemplates: filtered,
        selectedTemplate: null,
        templateSelections: []
      });
    },

    // 返回模板列表
    backToTemplateList: function() {
      this.setData({ selectedTemplate: null, templateSelections: [] });
    },

    // 选择模板
    selectTemplate: function(e) {
      var idx = e.currentTarget.dataset.idx;
      var tmpl = this.data.filteredTemplates[idx];
      var selections = [];
      // 初始化选择
      if (tmpl && tmpl.items) {
        tmpl.items.forEach(function(item, i) {
          if (item.type === 'radio') {
            selections.push(0); // 默认第一个
          } else if (item.type === 'checkbox') {
            selections.push([]); // 空数组
          } else if (item.type === 'text') {
            selections.push('');
          }
        });
      }
      this.setData({
        selectedTemplate: tmpl,
        templateSelections: selections
      });
    },

    // 模板内单选变化
    onTemplateRadioChange: function(e) {
      var itemIdx = e.currentTarget.dataset.idx;
      var val = parseInt(e.detail.value);
      var selections = this.data.templateSelections.slice();
      selections[itemIdx] = val;
      this.setData({ templateSelections: selections });
    },

    // 模板内复选框变化
    onTemplateCheckboxChange: function(e) {
      var itemIdx = e.currentTarget.dataset.idx;
      var vals = e.detail.value.map(function(v) { return parseInt(v); });
      var selections = this.data.templateSelections.slice();
      selections[itemIdx] = vals;
      this.setData({ templateSelections: selections });
    },

    // 模板内文本输入
    onTemplateTextInput: function(e) {
      var itemIdx = e.currentTarget.dataset.idx;
      var val = e.detail.value;
      var selections = this.data.templateSelections.slice();
      selections[itemIdx] = val;
      this.setData({ templateSelections: selections });
    },

    // 使用模板（生成文本并填入笔记）
    useTemplate: function() {
      var tmpl = this.data.selectedTemplate;
      var selections = this.data.templateSelections;
      if (!tmpl) {
        wx.showToast({ title: '请先选择模板', icon: 'none' });
        return;
      }

      var lines = [];
      lines.push('【' + tmpl.name + '】');
      lines.push('');

      tmpl.items.forEach(function(item, i) {
        var sel = selections[i];

        if (item.type === 'radio') {
          var selectedOption = (sel !== undefined && sel !== null) ? item.options[sel] : item.options[0];
          lines.push('• ' + item.label + '：' + (selectedOption || ''));
        } else if (item.type === 'checkbox') {
          var checked = [];
          if (sel && sel.length) {
            sel.forEach(function(idx) {
              if (item.options[idx]) checked.push(item.options[idx]);
            });
          }
          lines.push('• ' + item.label + '：' + (checked.length > 0 ? checked.join('、') : '未选择'));
        } else if (item.type === 'text') {
          var textVal = (sel && sel.trim) ? sel.trim() : '';
          if (textVal) {
            lines.push('• ' + item.label + '：');
            lines.push(textVal);
          } else {
            lines.push('• ' + item.label + '：（未填写）');
          }
        }
      });

      var generatedText = lines.join('\n');
      var currentNote = this.data.form.note || '';
      var newNote = currentNote ? currentNote + '\n\n' + generatedText : generatedText;

      this.setData({
        'form.note': newNote,
        showTemplateModal: false
      });
      wx.showToast({ title: '模板已插入', icon: 'success' });
    },

    // ======== 稿件上传 ========

    // 全屏编辑审稿意见
    showNotePreview: function() {
      this.setData({
        showNotePreview: true,
        notePreviewText: this.data.form.note || ''
      });
    },
    closeNotePreview: function() {
      this.setData({ showNotePreview: false });
    },

    // 编辑中的输入
    onNotePreviewInput: function(e) {
      this.setData({ notePreviewText: e.detail.value });
    },

    // 保存并关闭弹窗
    saveNotePreview: function() {
      var note = this.data.notePreviewText || '';
      this.setData({
        'form.note': note,
        showNotePreview: false
      });
    },

    // 复制弹窗内全文
    copyNotePreview: function() {
      var note = this.data.notePreviewText || '';
      if (!note) { wx.showToast({ title: '暂无内容', icon: 'none' }); return; }
      wx.setClipboardData({
        data: note,
        success: function() {
          wx.showToast({ title: '已复制', icon: 'success' });
        }
      });
    },

    chooseManuscript: function() {
      var that = this;
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['pdf', 'doc', 'docx'],
        success: function(res) {
          var file = res.tempFiles[0];
          if (file.size > 50 * 1024 * 1024) {
            wx.showToast({ title: '文件不能超过50MB', icon: 'none' });
            return;
          }
          that.uploadManuscript(file.path, file.name, file.size);
        }
      });
    },

    // 上传文件到云存储
    uploadManuscript: function(filePath, fileName, fileSize) {
      var that = this;
      var ext = fileName.split('.').pop().toLowerCase();
      var cloudPath = 'manuscripts/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.' + ext;

      that.setData({ manuscriptUploading: true, manuscriptUploadPercent: 0 });

      var uploadTask = wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: function(res) {
          var fileSizeText = fileSize > 1048576 ? (fileSize / 1048576).toFixed(1) + ' MB' : (fileSize / 1024).toFixed(0) + ' KB';
          that.setData({
            'form.manuscript': {
              fileID: res.fileID,
              fileName: fileName,
              fileSize: fileSize,
              fileSizeText: fileSizeText,
              fileType: ext === 'pdf' ? 'pdf' : 'doc',
              uploadTime: formatTime()
            },
            manuscriptUploading: false,
            manuscriptUploadPercent: 100
          });
          wx.showToast({ title: '上传成功', icon: 'success' });
        },
        fail: function() {
          that.setData({ manuscriptUploading: false, manuscriptUploadPercent: 0 });
          wx.showToast({ title: '上传失败', icon: 'error' });
        }
      });

      uploadTask.onProgressUpdate(function(res) {
        that.setData({ manuscriptUploadPercent: res.progress });
      });
    },

    // 删除稿件
    removeManuscript: function() {
      var that = this;
      wx.showModal({
        title: '确认删除',
        content: '确定要删除已上传的稿件吗？',
        confirmColor: '#EF4444',
        success: function(res) {
          if (res.confirm) {
            // 可选：删除云存储文件
            var fileID = that.data.form.manuscript.fileID;
            if (fileID) {
              wx.cloud.deleteFile({ fileList: [fileID] });
            }
            that.setData({
              'form.manuscript': { fileID: '', fileName: '', fileSize: 0, fileSizeText: '', fileType: '', uploadTime: '' }
            });
          }
        }
      });
    },

    // 预览稿件 —— 直接用云存储下载，避免 getTempFileURL 失败问题
    previewManuscript: function() {
      var fileID = this.data.form.manuscript.fileID;
      var fileType = this.data.form.manuscript.fileType;
      if (!fileID) return;
      wx.showLoading({ title: '打开文件中...' });
      wx.cloud.downloadFile({
        fileID: fileID,
        success: function(dlRes) {
          wx.hideLoading();
          wx.openDocument({
            filePath: dlRes.tempFilePath,
            fileType: fileType || 'pdf',
            showMenu: true,
            fail: function() {
              wx.showToast({ title: '无法打开文件，请检查文件格式', icon: 'none' });
            }
          });
        },
        fail: function(err) {
          wx.hideLoading();
          console.error('云文件下载失败', err);
          wx.showToast({ title: '文件下载失败，请重试', icon: 'none' });
        }
      });
    },

    // ======== AI 审稿（调用 utils/ai-review.js）=======

    startAiReview: function() {
      var that = this;
      var ms = this.data.form.manuscript;
      if (!ms || !ms.fileID) {
        wx.showToast({ title: '请先上传稿件', icon: 'none' });
        return;
      }

      wx.showModal({
        title: 'AI 审稿',
        content: '将使用AI分析稿件并生成审稿意见（消耗20积分），确认开始？',
        confirmColor: '#2563EB',
        success: function(res) {
          if (res.confirm) {
            // 先检查余额
            creditsUtil.getCreditsInfo().then(function(info) {
              if (!info.success) {
                wx.showToast({ title: '获取积分信息失败', icon: 'none' });
                return;
              }
              if (info.credits < 20) {
                wx.showModal({
                  title: '积分不足',
                  content: '您的积分不足20，无法使用AI审稿',
                  showCancel: false
                });
                return;
              }
              // 余额充足，开始AI审稿
              that.doAiReview(ms.fileID);
            });
          }
        }
      });
    },

    // Step1: 调云函数提取文本，Step 2: 小程序端调 AI
    doAiReview: function(fileID) {
      var that = this;
      that.setData({ aiReviewLoading: true });

      // Step 1: 云函数提取文本
      wx.cloud.callFunction({
        name: 'aiService',
        data: { action: 'extractText', fileID: fileID },
        success: function(res) {
          var result = res.result;
          if (!result || !result.success) {
            that.setData({ aiReviewLoading: false });
            wx.showToast({ title: (result && result.error) || '提取文本失败', icon: 'none' });
            return;
          }
          // Step 2: 小程序端调用 AI
          aiReviewUtil.callAIWithText(result.text, result.originalLength).then(function(aiResult) {
            // AI调用成功，扣减积分
            creditsUtil.spendCredits('ai_review', 20).then(function(spendResult) {
              that.setData({ aiReviewLoading: false });

              var currentNote = that.data.form.note || '';
              var prefix = '【AI 审稿意见（' + aiResult.modelName + '）】\n';
              if (aiResult.originalLength && aiResult.originalLength > aiResult.truncatedLength) {
                prefix += '（原文 ' + aiResult.originalLength + ' 字，已截断至 ' + aiResult.truncatedLength + ' 字）\n';
              } else if (aiResult.originalLength) {
                prefix += '（原文 ' + aiResult.originalLength + ' 字）\n';
              }
              prefix += '\n';
              var newNote = currentNote ? currentNote + '\n\n' + prefix + aiResult.text : prefix + aiResult.text;
              that.setData({ 'form.note': newNote });
              wx.showToast({ title: 'AI审稿完成', icon: 'success' });
            }).catch(function(err) {
              // 扣积分失败，但AI已成功，告知用户
              that.setData({ aiReviewLoading: false });
              var currentNote = that.data.form.note || '';
              var prefix = '【AI 审稿意见（' + aiResult.modelName + '）】\n';
              if (aiResult.originalLength && aiResult.originalLength > aiResult.truncatedLength) {
                prefix += '（原文 ' + aiResult.originalLength + ' 字，已截断至 ' + aiResult.truncatedLength + ' 字）\n';
              } else if (aiResult.originalLength) {
                prefix += '（原文 ' + aiResult.originalLength + ' 字）\n';
              }
              prefix += '\n';
              var newNote = currentNote ? currentNote + '\n\n' + prefix + aiResult.text : prefix + aiResult.text;
              that.setData({ 'form.note': newNote });
              wx.showToast({ title: 'AI审稿完成（积分扣除失败，请联系管理员）', icon: 'none', duration: 3000 });
            });
          }).catch(function(err) {
            that.setData({ aiReviewLoading: false });
            wx.showToast({ title: 'AI审稿失败: ' + (err.message || '未知错误'), icon: 'none' });
            console.error('[AI Review] 调用失败:', err);
          });
        },
        fail: function() {
          that.setData({ aiReviewLoading: false });
          wx.showToast({ title: '提取文本失败', icon: 'none' });
        }
      });
    },

    // ======== 保存 ========
    saveForm: function() {
      var that = this;
      var f = this.data.form;
      if (!f.paperTitle) { wx.showToast({ title: '请填写论文标题', icon: 'none' }); return; }
      if (!f.journal) { wx.showToast({ title: '请填写期刊/会议', icon: 'none' }); return; }
      if (!f.invitedDate) { wx.showToast({ title: '请选择邀请时间', icon: 'none' }); return; }
      if (!f.deadline) { wx.showToast({ title: '请选择截止时间', icon: 'none' }); return; }


      // 时间线数据清理
      var tlSave = (f.timelineList || []).filter(function(item) {
        return (item.date || '') && (item.event || '');
      }).map(function(item) {
        return { date: item.date, event: item.event, remark: item.remark || '', dotColor: item.dotColor || '' };
      });

      // 判断是否完成：时间线中是否有「审稿完成」事件
      var completed = tlSave.some(function(t){ return t.event === '审稿完成'; });

      var data = {
        paperTitle: f.paperTitle,
        journal: f.journal,
        reviewId: f.reviewId || '',
        deadline: f.deadline ? formatTime(f.deadline + ' 00:00:00') : null,
        invitedDate: f.invitedDate ? formatTime(f.invitedDate + ' 00:00:00') : null,
        status: f.status,
        decision: f.decision,
        round: f.round || 0,
        systemUrl: f.systemUrl,
        systemAccount: f.systemAccount,
        systemPassword: f.systemPassword,
        editorEmail: f.editorEmail || '',
        note: f.note,
        relatedReviewId: f.relatedReviewId || '',
        manuscript: f.manuscript && f.manuscript.fileID ? {
          fileID: f.manuscript.fileID,
          fileName: f.manuscript.fileName,
          fileSize: f.manuscript.fileSize,
          fileType: f.manuscript.fileType,
          uploadTime: f.manuscript.uploadTime
        } : null,
        timeline: tlSave,
        completed: completed,
        updateTime: formatTime()
      };

      var db = wx.cloud.database();
      wx.showLoading({ title: '保存中...' });
      var promise;
      if (this.data.isEdit) {
        promise = db.collection('reviews').doc(this.data.editId).update({ data: data });
      } else {
        // 新增审稿：先保存，成功后再扣积分
        data.createTime = formatTime();
        data.deleteTime = null;
        promise = db.collection('reviews').add({ data: data }).then(function(addRes) {
          return creditsUtil.spendCredits('new_review', 5).then(function(spendResult) {
            if (!spendResult.success) {
              return Promise.reject('insufficient');
            }
            return addRes;
          });
        });
      }
      promise.then(function() {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        reminderCheck.checkAndShowTip(that).catch(function(err){
          console.error('[review] 额度检查失败', err);
        });
        that.triggerEvent('save');
      }).catch(function(e) {
        wx.hideLoading();
        if (e === 'insufficient') {
          wx.showToast({ title: '积分不足', icon: 'error' });
        } else {
          wx.showToast({ title: '保存失败', icon: 'error' });
          console.error(e);
        }
      });
    },

    closeForm: function() {
      this.triggerEvent('cancel');
    },

    onQuotaTipCancel: function() {
      this.setData({ showQuotaTip: false });
    },
    onQuotaTipConfirm: function() {
      this.setData({ showQuotaTip: false });
      wx.navigateTo({ url: '/pages/settings/settings' });
    },

    /* ======== 审稿决定弹窗 ======== */
    openDecision: function(e) {
      var that = this;
      var ds = e.currentTarget.dataset;
      var id = ds.id || '';
      // 先设置弹窗可见 + 基本信息
      this.setData({
        showDecisionModal: true,
        decisionId: id,
        decisionPaper: ds.papertitle || '',
        decisionJournal: ds.journal || '',
        decision: ds.decision || ''
      });
      // 从数据库查询 note 和 manuscript，回显到 form
      if (id) {
        wx.cloud.database().collection('reviews').doc(id).field({ note: true, manuscript: true }).get().then(function(res) {
          if (res.data) {
            var updates = {};
            if (res.data.note !== undefined) updates['form.note'] = res.data.note || '';
            if (res.data.manuscript !== undefined) updates['form.manuscript'] = res.data.manuscript || { fileID: '', fileName: '', fileSize: 0, fileSizeText: '', fileType: '', uploadTime: '' };
            that.setData(updates);
          }
        });
      }
    },

    closeDecision: function() {
      this.setData({ showDecisionModal: false, decisionId: '', decision: '' });
    },

    setDecision: function(e) {
      this.setData({ decision: e.currentTarget.dataset.decision });
    },

    submitDecision: function() {
      var that = this;
      var decisionId = this.data.decisionId;
      var decision = this.data.decision;
      var note = this.data.form.note || '';
      var manuscript = this.data.form.manuscript || null;
      if (!decision) { wx.showToast({ title: '请选择审稿决定', icon: 'none' }); return; }
      var updateData = {
        decision: decision,
        note: note,
        decisionTime: formatTime(),
        updateTime: formatTime()
      };
      if (manuscript && manuscript.fileID) {
        updateData.manuscript = manuscript;
      }
      wx.showLoading({ title: '提交中...' });
      wx.cloud.database().collection('reviews').doc(decisionId).update({ data: updateData })
        .then(function() {
          wx.hideLoading();
          wx.showToast({ title: '决定已提交', icon: 'success' });
          that.setData({ showDecisionModal: false });
          that.triggerEvent('decisionsubmit');
        }).catch(function(e) {
          wx.hideLoading();
          wx.showToast({ title: '提交失败', icon: 'error' });
          console.error(e);
        });
    },

    doNothing: function() {}
  }
});
