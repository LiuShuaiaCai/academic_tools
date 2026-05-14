// components/reminder-quota-tip/reminder-quota-tip.js
Component({
  properties: {
    show: { type: Boolean, value: false }
  },
  methods: {
    onMaskTap: function() {
      this.triggerEvent('cancel');
    },
    onBoxTap: function() {
      // 阻止冒泡，避免点击内容区关闭
    },
    onCancel: function() {
      this.triggerEvent('cancel');
    },
    onConfirm: function() {
      this.triggerEvent('confirm');
    }
  }
});
