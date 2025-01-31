function updateProgressUI(progress, text) {
  const container = document.getElementById('progressContainer');
  const progressBarInner = document.getElementById('progressBarInner');
  const progressText = document.getElementById('progressText');
  
  container.style.display = 'block';
  // 更新进度条宽度
  progressBarInner.style.width = `${progress}%`;
  // 直接显示文本，不显示百分比
  progressText.textContent = text;
}

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.action === 'updateProgress') {
    updateProgressUI(request.progress, request.text);
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const collectButton = document.getElementById('collectButton');
  const stopButton = document.getElementById('stopButton');
  const exportButton = document.getElementById('exportButton');
  const progressContainer = document.getElementById('progressContainer');

  // 检查当前标签页
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // 添加显示庆祝动画的函数
  function showCelebration() {
    const celebration = document.getElementById('celebration');
    celebration.classList.add('show');
    
    // 播放动画后淡出
    setTimeout(() => {
      celebration.classList.add('fade-out');
      setTimeout(() => {
        celebration.classList.remove('show', 'fade-out');
      }, 1000);
    }, 1500);
  }

  // 开始采集
  collectButton.addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (!tab.url.includes('xiaohongshu.com')) {
      alert('请在小红书用户主页使用此功能');
      return;
    }

    // 显示进度条和停止按钮，隐藏采集按钮
    progressContainer.style.display = 'block';
    collectButton.style.display = 'none';
    stopButton.style.display = 'block';

    // 发送采集消息
    chrome.tabs.sendMessage(tab.id, { action: 'collect' }, response => {
      console.log('采集结果:', response);
      // 采集完成后显示庆祝动画
      showCelebration();
      // 采集完成后恢复按钮状态
      setTimeout(() => {
        progressContainer.style.display = 'none';
        stopButton.style.display = 'none';
        collectButton.style.display = 'block';
      }, 2000); // 等待动画播放完成后再隐藏进度条
    });
  });

  // 停止采集
  stopButton.addEventListener('click', async () => {
    const tab = await getCurrentTab();
    chrome.tabs.sendMessage(tab.id, { action: 'stopCollect' });
    
    // 恢复按钮状态
    progressContainer.style.display = 'none';
    stopButton.style.display = 'none';
    collectButton.style.display = 'block';
  });

  // 导出Excel
  exportButton.addEventListener('click', async () => {
    try {
      const result = await chrome.storage.local.get('xhsData');
      if (!result.xhsData) {
        alert('没有可导出的数据，请先采集数据');
        return;
      }

      const data = result.xhsData;
      const notes = data.notes;

      // 构建CSV内容
      const headers = ['标题', '链接', '点赞', '收藏', '评论', '分享', '话题'];
      const rows = [headers];

      notes.forEach(note => {
        // 确保所有字段都有默认值
        const safeNote = {
          title: note.title || '',
          url: note.url || '',
          likes: note.likes || '0',
          collects: note.collects || '0',
          comments: note.comments || '0',
          shares: note.shares || '0',
          topics: Array.isArray(note.topics) ? note.topics : []
        };

        // 处理可能包含逗号的字段
        rows.push([
          `"${safeNote.title.replace(/"/g, '""')}"`,
          `"${safeNote.url}"`,
          safeNote.likes,
          safeNote.collects,
          safeNote.comments,
          safeNote.shares,
          `"${safeNote.topics.join('|').replace(/"/g, '""')}"`
        ]);
      });

      // 转换为CSV字符串
      const csvContent = rows.map(row => row.join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      // 下载文件
      const a = document.createElement('a');
      a.href = url;
      a.download = `小红书数据_${data.authorName || '未知用户'}_${new Date().toLocaleDateString()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出过程出错：', error);
      alert('导出失败：' + error.message);
    }
  });
});

// 监听进度更新
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateProgress') {
    updateProgressUI(request.progress, request.text);
  }
}); 