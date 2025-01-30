// 立即添加消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'collect') {
    collectData().then(sendResponse);
    return true;
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
    let startTime = Date.now();
    const scrollDuration = 5000; // 滚动5秒
    
    const timer = setInterval(() => {
      window.scrollBy(0, 300);
      
      // 检查是否已经滚动了5秒
      if (Date.now() - startTime >= scrollDuration) {
        clearInterval(timer);
        window.scrollTo(0, 0); // 滚回顶部
        
        // 获取所有笔记section
        const feedsContainer = document.getElementById('userPostedFeeds');
        const sections = feedsContainer?.querySelectorAll('section') || [];
        console.log('找到笔记section数量:', sections.length);
        
        // 收集所有笔记链接
        const notes = Array.from(sections).map(section => {
          const href = section.querySelector('.cover, .ld, .mask a')?.getAttribute('href') || '';
          return {
            url: href ? `https://www.xiaohongshu.com${href}` : '',
            title: section.querySelector('.title')?.textContent.trim() || ''
          };
        }).filter(note => note.url);
        
        resolve(notes);
      }
    }, 100);
  });
}

async function collectData() {
  try {
    await updateProgress(0, '正在获取博主信息...');
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
    await updateProgress(30, '正在加载笔记...');
    const notes = await autoScrollAndCount();
    const totalNotes = notes.length;
    console.log('找到笔记数量:', totalNotes);
    
    // 采集每篇笔记的详细数据
    await updateProgress(50, `开始采集 ${totalNotes} 篇笔记的详细数据...`);
    
    for (let i = 0; i < notes.length; i++) {
      try {
        const section = document.querySelectorAll('section')[i];
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
        
        notes[i] = {
          ...notes[i],
          ...stats,
          topics: Array.from(section.querySelectorAll('.tag')).map(tag => tag.textContent.trim())
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