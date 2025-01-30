function updateProgressUI(progress, text) {
  const container = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBarInner');
  const progressText = document.getElementById('progressText');
  const progressPercent = document.getElementById('progressPercent');
  
  container.style.display = 'block';
  progressBar.style.width = `${progress}%`;
  progressText.textContent = text;
  progressPercent.textContent = `${progress}%`;
}

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.action === 'updateProgress') {
    updateProgressUI(request.progress, request.text);
  }
});

document.getElementById('startCollect').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  document.getElementById('status').textContent = '';
  document.getElementById('progressContainer').style.display = 'block';
  updateProgressUI(0, '准备开始采集...');
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'collect' });
    document.getElementById('status').textContent = response || '采集完成';
  } catch (error) {
    document.getElementById('status').textContent = '采集失败：' + error.message;
    console.error('采集错误：', error);
  }
});

document.getElementById('exportExcel').addEventListener('click', async () => {
  try {
    const result = await chrome.storage.local.get(['xhsData']);
    console.log('获取到的数据：', result); // 调试用
    
    if (result.xhsData && result.xhsData.notes && result.xhsData.notes.length > 0) {
      exportToExcel(result.xhsData);
    } else {
      document.getElementById('status').textContent = '没有可导出的数据，请先采集数据';
    }
  } catch (error) {
    document.getElementById('status').textContent = '导出失败：' + error.message;
  }
});

function exportToExcel(data) {
  try {
    // 添加 BOM 头，解决中文乱码
    const BOM = '\uFEFF';
    let csv = BOM + '博主,粉丝数,笔记链接,点赞数,转发数,收藏数,评论数,话题\n';
    
    data.notes.forEach(note => {
      // 处理可能包含逗号的字段，确保CSV格式正确
      const row = [
        `"${data.authorName.replace(/"/g, '""')}"`,
        data.followers,
        `"${note.url}"`,
        note.likes,
        note.shares,
        note.collects,
        note.comments,
        `"${note.topics.join('；').replace(/"/g, '""')}"` // 使用中文分号分隔话题
      ].join(',');
      
      csv += row + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const fileName = `${data.authorName}_数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
    link.setAttribute('download', fileName);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    document.getElementById('status').textContent = '导出完成！共导出 ' + data.notes.length + ' 条数据';
  } catch (error) {
    console.error('导出错误：', error);
    document.getElementById('status').textContent = '导出过程出错：' + error.message;
  }
} 