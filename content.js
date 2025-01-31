// 在文件开头添加一个变量来控制采集状态
let isCollecting = false;

// 立即添加消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'collect') {
    isCollecting = true;
    collectData().then(sendResponse);
    return true;
  } else if (request.action === 'stopCollect') {
    isCollecting = false;
    console.log('手动停止采集');
  }
});

async function updateProgress(progress, text) {
  chrome.runtime.sendMessage({
    action: 'updateProgress',
    progress: progress,
    text: text
  });
}

async function autoScrollAndCount() {
  return new Promise((resolve) => {
    let collectedCount = 0;  // 已收集的笔记计数
    let maxDataIndex = -1;   // 当前最大的data-index值
    let noUpdateCount = 0;   // 连续未更新的次数
    const notes = new Map(); // 使用Map存储笔记，防止重复

    // 收集笔记函数
    const collectNotes = () => {
      const feedsContainer = document.getElementById('userPostedFeeds');
      if (!feedsContainer) return false;

      const sections = feedsContainer.querySelectorAll('section.note-item');
      let hasNewNotes = false;

      sections.forEach(section => {
        try {
          const dataIndex = parseInt(section.getAttribute('data-index'));
          // 如果这个笔记还没有收集过
          if (!notes.has(dataIndex)) {
            const href = section.querySelector('.cover, .ld, .mask a')?.getAttribute('href') || '';
            if (href) {
              notes.set(dataIndex, {
                url: `https://www.xiaohongshu.com${href}`,
                title: section.querySelector('.title')?.textContent.trim() || '',
                dataIndex: dataIndex
              });
              collectedCount++;
              hasNewNotes = true;
              console.log(`采集到第 ${collectedCount} 篇笔记, data-index: ${dataIndex}`);
              // 更新进度显示为已读取的笔记数量
              updateProgress(Math.min(45, Math.floor(collectedCount * 0.5)), `已读取 ${collectedCount} 篇笔记`);
            }
          }
          
          // 更新最大data-index
          if (dataIndex > maxDataIndex) {
            maxDataIndex = dataIndex;
            noUpdateCount = 0; // 重置未更新计数
            hasNewNotes = true;
          }
        } catch (error) {
          console.error('处理笔记数据时出错:', error);
        }
      });

      return hasNewNotes;
    };

    // 开始滚动和采集
    const timer = setInterval(() => {
      // 检查是否已手动停止
      if (!isCollecting) {
        clearInterval(timer);
        console.log('采集已手动停止');
        const sortedNotes = Array.from(notes.values())
          .sort((a, b) => a.dataIndex - b.dataIndex);
        resolve(sortedNotes);
        return;
      }

      window.scrollBy(0, 300);
      
      const hasNewNotes = collectNotes();
      if (!hasNewNotes) {
        noUpdateCount++;
      }

      // 如果连续5次没有新的笔记，认为已到达底部
      if (noUpdateCount >= 5) {
        clearInterval(timer);
        console.log('未发现新笔记，停止采集');
        console.log(`共采集到 ${collectedCount} 篇笔记，最大 data-index: ${maxDataIndex}`);
        
        // 转换Map为数组并按data-index排序
        const sortedNotes = Array.from(notes.values())
          .sort((a, b) => a.dataIndex - b.dataIndex);
        
        resolve(sortedNotes);
      }
    }, 1000);

    // 修改超时保护
    setTimeout(() => {
      if (isCollecting) {
        clearInterval(timer);
        console.log('达到最大采集时间，停止采集');
        const sortedNotes = Array.from(notes.values())
          .sort((a, b) => a.dataIndex - b.dataIndex);
        resolve(sortedNotes);
      }
    }, 30000);
  });
}

async function collectData() {
  try {
    // 修改初始提示文本
    await updateProgress(0, '开始读取笔记...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 获取博主名称和粉丝数
    const authorName = document.querySelector('.name')?.textContent.trim() || '未知博主';
    let followers = '0';
    const followersElements = document.querySelectorAll('.user-info .count');
    for (const element of followersElements) {
      const text = element.textContent.trim();
      if (text.includes('粉丝') || element.parentElement?.textContent.includes('粉丝')) {
        followers = text.replace(/[^0-9.万k]/g, '');
        if (followers.includes('万')) {
          followers = String(parseFloat(followers.replace('万', '')) * 10000);
        } else if (followers.includes('k')) {
          followers = String(parseFloat(followers.replace('k', '')) * 1000);
        }
        break;
      }
    }
    
    console.log('博主名称:', authorName);
    console.log('粉丝数:', followers);

    // 滚动并获取笔记
    const notes = await autoScrollAndCount();
    const totalNotes = notes.length;
    console.log('找到笔记数量:', totalNotes);
    
    // 采集每篇笔记的详细数据
    await updateProgress(50, `开始采集 ${totalNotes} 篇笔记的详细数据...`);
    
    for (let i = 0; i < notes.length; i++) {
      try {
        const section = document.querySelector(`section[data-index="${notes[i].dataIndex}"]`);
        if (!section) continue;

        // 获取互动数据
        const stats = {
          likes: '0',
          collects: '0',
          comments: '0',
          shares: '0'
        };
        
        const interactions = section.querySelectorAll('.interactions span');
        interactions.forEach(item => {
          const text = item.textContent.trim();
          if (text.includes('赞')) stats.likes = text.replace(/[^0-9]/g, '');
          if (text.includes('收藏')) stats.collects = text.replace(/[^0-9]/g, '');
          if (text.includes('评论')) stats.comments = text.replace(/[^0-9]/g, '');
          if (text.includes('分享')) stats.shares = text.replace(/[^0-9]/g, '');
        });
        
        // 获取话题标签
        const topics = Array.from(section.querySelectorAll('.tag')).map(tag => tag.textContent.trim());
        
        // 更新笔记数据
        notes[i] = {
          ...notes[i],
          ...stats,
          topics: topics || []
        };
        
        console.log(`采集笔记 ${i + 1}/${totalNotes}:`, notes[i]);
        
        // 更新进度
        const progress = 50 + Math.round((i + 1) / totalNotes * 50);
        await updateProgress(progress, `已采集 ${i + 1}/${totalNotes} 篇笔记...`);
      } catch (error) {
        console.error(`处理第 ${i + 1} 篇笔记时出错:`, error);
      }
    }

    // 保存数据
    const data = {
      authorName,
      followers,
      totalNotes,
      collectedNotes: notes.length,
      notes,
      timestamp: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ xhsData: data });
    await updateProgress(100, `采集完成，共采集 ${notes.length}/${totalNotes} 篇笔记`);
    
    return `采集完成！共采集到 ${notes.length}/${totalNotes} 篇笔记`;
  } catch (error) {
    console.error('采集过程出错：', error);
    return '采集失败：' + error.message;
  }
} 