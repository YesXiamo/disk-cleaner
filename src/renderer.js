// 渲染进程主逻辑
const { ipcRenderer } = require('electron');

// 全局状态
let currentData = [];
let currentPath = '';
let selectedItem = null;
let navigationStack = []; // 导航栈，用于记录进入的文件夹层级
let currentViewData = null; // 当前显示的数据
let contextMenuTarget = null; // 右键菜单目标元素

// 创建右键菜单
function createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'context-menu';
    menu.style.display = 'none';
    document.body.appendChild(menu);
    return menu;
}

// 显示右键菜单
function showContextMenu(e, item) {
    e.preventDefault();
    
    const menu = document.getElementById('context-menu') || createContextMenu();
    contextMenuTarget = item;
    
    // 设置菜单内容
    menu.innerHTML = `
        <div class="context-menu-item" id="ctx-open">
            <span class="context-menu-icon">📂</span>
            <span>打开</span>
        </div>
        <div class="context-menu-item" id="ctx-finder">
            <span class="context-menu-icon">🔍</span>
            <span>在Finder中打开</span>
        </div>
        <div class="context-menu-item" id="ctx-details">
            <span class="context-menu-icon">ℹ️</span>
            <span>查看详情</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" id="ctx-delete">
            <span class="context-menu-icon">🗑️</span>
            <span>删除</span>
        </div>
    `;
    
    // 定位菜单
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
    
    // 添加菜单项事件
    document.getElementById('ctx-open').addEventListener('click', () => {
        hideContextMenu();
        if (item.type === 'directory' && item.children && item.children.length > 0) {
            enterDirectory(item);
        } else {
            showFileDetails(item);
        }
    });
    
    document.getElementById('ctx-finder').addEventListener('click', async () => {
        hideContextMenu();
        try {
            await ipcRenderer.invoke('open-in-finder', item.path);
        } catch (error) {
            console.error('打开Finder失败:', error);
        }
    });
    
    document.getElementById('ctx-details').addEventListener('click', () => {
        hideContextMenu();
        showFileDetails(item);
    });
    
    document.getElementById('ctx-delete').addEventListener('click', () => {
        hideContextMenu();
        selectedItem = item;
        handleDelete();
    });
}

// 隐藏右键菜单
function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) {
        menu.style.display = 'none';
    }
    contextMenuTarget = null;
}

// DOM 元素
const elements = {
    heatmap: document.getElementById('heatmap'),
    diskUsageText: document.getElementById('disk-usage-text'),
    diskProgress: document.getElementById('disk-progress'),
    totalFiles: document.getElementById('total-files'),
    totalSize: document.getElementById('total-size'),
    totalFolders: document.getElementById('total-folders'),
    largestFiles: document.getElementById('largest-files'),
    statusText: document.getElementById('status-text'),
    currentPath: document.getElementById('current-path'),
    selectFolderBtn: document.getElementById('select-folder-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    cleanTempBtn: document.getElementById('clean-temp-btn'),
    cleanCacheBtn: document.getElementById('clean-cache-btn'),
    fileModal: document.getElementById('file-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalName: document.getElementById('modal-name'),
    modalPath: document.getElementById('modal-path'),
    modalSize: document.getElementById('modal-size'),
    modalType: document.getElementById('modal-type'),
    modalMtime: document.getElementById('modal-mtime'),
    deleteBtn: document.getElementById('delete-btn'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    closeBtn: document.querySelector('.close-btn')
};

// 获取外层方块颜色（基于大小）
function getOuterBlockColor(size, maxSize) {
    if (maxSize === 0) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    const ratio = size / maxSize;
    
    if (ratio < 0.2) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'; // 紫
    if (ratio < 0.4) return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'; // 蓝
    if (ratio < 0.6) return 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'; // 绿
    if (ratio < 0.8) return 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'; // 粉黄
    return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'; // 粉
}

// 初始化
async function init() {
    setupEventListeners();
    setupContextMenuListeners();
    
    // 获取主目录并扫描
    const homeDir = await ipcRenderer.invoke('get-home-directory');
    currentPath = homeDir;
    await scanDirectory(homeDir);
}

// 设置右键菜单全局事件监听
function setupContextMenuListeners() {
    // 点击其他地方隐藏菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });

    // 按 ESC 隐藏菜单
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
        }
    });
}

// 设置事件监听
function setupEventListeners() {
    elements.selectFolderBtn.addEventListener('click', handleSelectFolder);
    elements.refreshBtn.addEventListener('click', () => scanDirectory(currentPath));
    elements.cleanTempBtn.addEventListener('click', handleCleanTemp);
    elements.cleanCacheBtn.addEventListener('click', handleCleanCache);
    elements.closeBtn.addEventListener('click', closeModal);
    elements.closeModalBtn.addEventListener('click', closeModal);
    elements.deleteBtn.addEventListener('click', handleDelete);
    
    // 点击弹窗外部关闭
    elements.fileModal.addEventListener('click', (e) => {
        if (e.target === elements.fileModal) {
            closeModal();
        }
    });
}

// 选择文件夹
async function handleSelectFolder() {
    const result = await ipcRenderer.invoke('show-open-dialog');
    if (!result.canceled && result.filePaths.length > 0) {
        currentPath = result.filePaths[0];
        await scanDirectory(currentPath);
    }
}

// 扫描目录
async function scanDirectory(dirPath) {
    showLoading();
    elements.statusText.textContent = '正在扫描...';
    elements.currentPath.textContent = dirPath;
    
    // 重置导航状态
    navigationStack = [];
    
    try {
        const result = await ipcRenderer.invoke('scan-directory', dirPath);
        
        if (result.success) {
            currentData = result.data;
            updateDiskInfo(result.diskUsage);
            renderHeatmap(result.data);
            updateStats(result.data);
            updateLargestFiles(result.data);
            elements.statusText.textContent = '扫描完成';
        } else {
            elements.statusText.textContent = '扫描失败: ' + result.error;
        }
    } catch (error) {
        elements.statusText.textContent = '错误: ' + error.message;
    }
}

// 显示加载状态
function showLoading() {
    elements.heatmap.innerHTML = `
        <div class="loading-overlay">
            <div class="spinner"></div>
            <p>正在扫描目录...</p>
        </div>
    `;
}

// 更新磁盘信息
function updateDiskInfo(diskUsage) {
    if (!diskUsage) return;
    
    elements.diskUsageText.textContent = 
        `已用 ${diskUsage.used} / ${diskUsage.total} (${diskUsage.percentage}%)`;
    elements.diskProgress.style.width = `${diskUsage.percentage}%`;
}

// 格式化文件大小
function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// 获取文件图标
function getFileIcon(name, type) {
    if (type === 'directory') return '📁';
    
    const ext = name.split('.').pop().toLowerCase();
    const iconMap = {
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'bmp': '🖼️', 'svg': '🖼️',
        'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'mkv': '🎬',
        'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵',
        'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📝',
        'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
        'js': '💻', 'ts': '💻', 'html': '💻', 'css': '💻', 'py': '💻',
        'exe': '⚙️', 'dmg': '💿', 'pkg': '💿'
    };
    
    return iconMap[ext] || '📄';
}

// 获取文件类型
function getFileType(name, type) {
    if (type === 'directory') return '文件夹';
    
    const ext = name.split('.').pop().toLowerCase();
    const typeMap = {
        'jpg': '图片', 'jpeg': '图片', 'png': '图片', 'gif': '图片',
        'mp4': '视频', 'avi': '视频', 'mov': '视频',
        'mp3': '音频', 'wav': '音频',
        'pdf': 'PDF文档', 'doc': 'Word文档', 'docx': 'Word文档', 'txt': '文本文件',
        'zip': '压缩包', 'rar': '压缩包', '7z': '压缩包',
        'js': 'JavaScript', 'ts': 'TypeScript', 'html': 'HTML', 'css': 'CSS', 'py': 'Python',
        'exe': '可执行文件', 'dmg': '磁盘映像'
    };
    
    return typeMap[ext] || '文件';
}

// 获取热力图颜色等级（7级）
function getHeatmapLevel(size, maxSize) {
    if (maxSize === 0) return 1;
    const ratio = size / maxSize;
    
    if (ratio < 0.15) return 1;
    if (ratio < 0.3) return 2;
    if (ratio < 0.45) return 3;
    if (ratio < 0.6) return 4;
    if (ratio < 0.75) return 5;
    if (ratio < 0.9) return 6;
    return 7;
}

// 计算树状图布局 - 按占比分配大小
function calculateTreemapLayout(data, containerWidth, containerHeight) {
    if (data.length === 0) return [];
    
    const totalSize = data.reduce((sum, item) => sum + item.size, 0);
    const items = data.map(item => ({
        ...item,
        percentage: totalSize > 0 ? (item.size / totalSize) * 100 : 0
    }));
    
    // 按大小降序排序
    items.sort((a, b) => b.size - a.size);
    
    // 计算每个项目的尺寸
    const layouts = [];
    let currentY = 0;
    const padding = 4;
    
    // 大文件（占比>10%）单独一行
    const largeItems = items.filter(item => item.percentage >= 10);
    const smallItems = items.filter(item => item.percentage < 10);
    
    // 处理大文件
    if (largeItems.length > 0) {
        const rowHeight = Math.max(80, containerHeight * 0.15);
        largeItems.forEach(item => {
            const widthPercent = item.percentage / 100;
            layouts.push({
                ...item,
                x: padding,
                y: currentY + padding,
                width: (containerWidth - padding * 2) * widthPercent - padding,
                height: rowHeight - padding * 2,
                isLarge: true
            });
        });
        currentY += rowHeight;
    }
    
    // 处理小文件 - 使用网格布局
    if (smallItems.length > 0) {
        const remainingHeight = containerHeight - currentY;
        const cols = Math.min(5, Math.ceil(Math.sqrt(smallItems.length)));
        const cellWidth = (containerWidth - padding * 2) / cols;
        const cellHeight = Math.max(60, remainingHeight / Math.ceil(smallItems.length / cols));
        
        smallItems.forEach((item, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            layouts.push({
                ...item,
                x: padding + col * cellWidth,
                y: currentY + padding + row * cellHeight,
                width: cellWidth - padding * 2,
                height: cellHeight - padding * 2,
                isLarge: false
            });
        });
    }
    
    return layouts;
}

// 渲染面包屑导航
function renderBreadcrumb() {
    if (navigationStack.length === 0) return '';
    
    let html = '<div class="breadcrumb">';
    html += '<span class="breadcrumb-item" data-index="-1">根目录</span>';
    
    navigationStack.forEach((item, index) => {
        html += '<span class="breadcrumb-separator">/</span>';
        if (index === navigationStack.length - 1) {
            html += `<span class="breadcrumb-current">${item.name}</span>`;
        } else {
            html += `<span class="breadcrumb-item" data-index="${index}">${item.name}</span>`;
        }
    });
    
    html += '</div>';
    return html;
}

// 渲染返回按钮
function renderBackButton() {
    if (navigationStack.length === 0) return '';
    return `<button class="back-button" id="back-btn">← 返回上级</button>`;
}

// 渲染热力图 - 单一大方块，内部按占比显示不同大小
function renderHeatmap(data) {
    currentViewData = data;
    
    if (data.length === 0) {
        elements.heatmap.innerHTML = `
            ${renderBackButton()}
            ${renderBreadcrumb()}
            <div class="empty-state">
                <div class="empty-state-icon">📂</div>
                <div class="empty-state-text">目录为空</div>
            </div>
        `;
        addNavigationListeners();
        return;
    }
    
    const maxSize = data.reduce((max, item) => Math.max(max, item.size), 0);
    const totalSize = data.reduce((sum, item) => sum + item.size, 0);
    
    let html = renderBackButton();
    html += renderBreadcrumb();
    
    // 创建树状图容器
    const treemapContainer = document.createElement('div');
    treemapContainer.className = 'treemap-container';
    
    // 计算布局
    const containerWidth = elements.heatmap.clientWidth - 48;
    const containerHeight = Math.max(500, elements.heatmap.clientHeight - 100);
    const layouts = calculateTreemapLayout(data, containerWidth, containerHeight);
    
    // 渲染每个项目
    layouts.forEach((layout, index) => {
        const div = document.createElement('div');
        const level = getHeatmapLevel(layout.size, maxSize);
        const hiddenClass = layout.isHidden ? 'hidden-item' : '';
        
        div.className = `treemap-item treemap-level-${level} ${hiddenClass}`;
        
        // 使用 flex 布局来分配空间
        if (layout.isLarge) {
            div.style.flex = `0 0 ${layout.percentage}%`;
            div.style.minHeight = '100px';
        } else {
            div.style.flex = '1 1 0';
            div.style.minWidth = '80px';
            div.style.minHeight = '80px';
        }
        
        // 根据大小决定是否显示详细信息
        const showDetails = layout.width > 100 && layout.height > 60;
        const showIcon = layout.width > 60 && layout.height > 40;
        
        let innerHtml = '';
        if (showIcon) {
            innerHtml += `<span class="item-icon">${getFileIcon(layout.name, layout.type)}</span>`;
        }
        if (showDetails) {
            innerHtml += `<span class="item-name">${layout.name}</span>`;
            innerHtml += `<span class="item-size">${formatSize(layout.size)}</span>`;
            innerHtml += `<span class="item-percentage">${layout.percentage.toFixed(1)}%</span>`;
        } else if (layout.width > 40) {
            innerHtml += `<span class="item-name" style="font-size: 10px;">${layout.name.substring(0, 10)}</span>`;
        }
        
        div.innerHTML = innerHtml;
        
        // 点击事件
        div.addEventListener('click', () => {
            if (layout.type === 'directory' && layout.children && layout.children.length > 0) {
                enterDirectory(layout);
            } else {
                showFileDetails(layout);
            }
        });
        
        // 右键菜单事件
        div.addEventListener('contextmenu', (e) => {
            showContextMenu(e, layout);
        });
        
        treemapContainer.appendChild(div);
    });
    
    const container = document.createElement('div');
    container.innerHTML = html;
    container.appendChild(treemapContainer);
    
    elements.heatmap.innerHTML = '';
    elements.heatmap.appendChild(container);
    
    addNavigationListeners();
}

// 添加导航事件监听
function addNavigationListeners() {
    // 返回按钮
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', goBack);
    }
    
    // 面包屑导航
    elements.heatmap.querySelectorAll('.breadcrumb-item').forEach(el => {
        el.addEventListener('click', () => {
            const index = parseInt(el.dataset.index);
            navigateToIndex(index);
        });
    });
}

// 进入文件夹
function enterDirectory(item) {
    navigationStack.push(item);
    renderHeatmap(item.children);
    elements.statusText.textContent = `已进入: ${item.name}`;
}

// 返回上级
function goBack() {
    if (navigationStack.length === 0) return;
    
    navigationStack.pop();
    
    if (navigationStack.length === 0) {
        // 返回到根目录
        renderHeatmap(currentData);
        elements.statusText.textContent = '已返回根目录';
    } else {
        // 返回到指定层级
        const parent = navigationStack[navigationStack.length - 1];
        renderHeatmap(parent.children);
        elements.statusText.textContent = `已返回: ${parent.name}`;
    }
}

// 导航到指定层级
function navigateToIndex(index) {
    if (index === -1) {
        // 返回根目录
        navigationStack = [];
        renderHeatmap(currentData);
        elements.statusText.textContent = '已返回根目录';
    } else {
        // 导航到指定层级
        navigationStack = navigationStack.slice(0, index + 1);
        const item = navigationStack[index];
        renderHeatmap(item.children);
        elements.statusText.textContent = `已导航到: ${item.name}`;
    }
}

// 扁平化数据
function flattenData(data, result = []) {
    data.forEach(item => {
        result.push(item);
        if (item.children && item.children.length > 0) {
            flattenData(item.children, result);
        }
    });
    return result.slice(0, 200); // 限制显示数量
}

// 更新统计信息
function updateStats(data) {
    let fileCount = 0;
    let folderCount = 0;
    let totalBytes = 0;
    
    function count(items) {
        items.forEach(item => {
            if (item.type === 'directory') {
                folderCount++;
                if (item.children) {
                    count(item.children);
                }
            } else {
                fileCount++;
                totalBytes += item.size;
            }
        });
    }
    
    count(data);
    
    elements.totalFiles.textContent = fileCount.toLocaleString();
    elements.totalFolders.textContent = folderCount.toLocaleString();
    elements.totalSize.textContent = formatSize(totalBytes);
}

// 更新最大文件列表
function updateLargestFiles(data) {
    const flatData = flattenData(data);
    const sorted = flatData.sort((a, b) => b.size - a.size).slice(0, 5);
    
    if (sorted.length === 0) {
        elements.largestFiles.innerHTML = '<div class="loading">无文件</div>';
        return;
    }
    
    elements.largestFiles.innerHTML = sorted.map(item => {
        const iconClass = item.type === 'directory' ? 'folder' : 
                         ['jpg', 'jpeg', 'png', 'gif'].includes(item.name.split('.').pop().toLowerCase()) ? 'image' :
                         ['mp4', 'avi', 'mov'].includes(item.name.split('.').pop().toLowerCase()) ? 'video' : 'other';
        
        return `
            <div class="largest-file-item" data-path="${item.path}">
                <div class="file-icon ${iconClass}">${getFileIcon(item.name, item.type)}</div>
                <div class="file-info-small">
                    <div class="file-name">${item.name}</div>
                    <div class="file-size">${formatSize(item.size)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    // 添加点击事件
    elements.largestFiles.querySelectorAll('.largest-file-item').forEach((el, index) => {
        el.addEventListener('click', () => showFileDetails(sorted[index]));
    });
}

// 显示文件详情
function showFileDetails(item) {
    selectedItem = item;
    
    elements.modalTitle.textContent = item.type === 'directory' ? '文件夹详情' : '文件详情';
    elements.modalName.textContent = item.name;
    elements.modalPath.textContent = item.path;
    elements.modalSize.textContent = formatSize(item.size);
    elements.modalType.textContent = getFileType(item.name, item.type);
    elements.modalMtime.textContent = new Date(item.mtime).toLocaleString('zh-CN');
    
    elements.fileModal.classList.add('show');
}

// 关闭弹窗
function closeModal() {
    elements.fileModal.classList.remove('show');
    selectedItem = null;
}

// 删除文件
async function handleDelete() {
    if (!selectedItem) return;
    
    const confirmed = confirm(`确定要删除 "${selectedItem.name}" 吗？此操作不可恢复！`);
    if (!confirmed) return;
    
    elements.statusText.textContent = '正在删除...';
    
    try {
        const result = await ipcRenderer.invoke('delete-file', selectedItem.path);
        
        if (result.success) {
            elements.statusText.textContent = '删除成功 - 请手动刷新查看更新';
            closeModal();
            // 不再自动扫描，提示用户手动刷新
            showRefreshNotification();
        } else {
            elements.statusText.textContent = '删除失败: ' + result.error;
        }
    } catch (error) {
        elements.statusText.textContent = '错误: ' + error.message;
    }
}

// 清理临时文件
async function handleCleanTemp() {
    const confirmed = confirm('确定要清理临时文件吗？');
    if (!confirmed) return;
    
    elements.statusText.textContent = '清理临时文件中...';
    // 这里可以添加具体的清理逻辑
    setTimeout(() => {
        elements.statusText.textContent = '临时文件清理完成';
    }, 1000);
}

// 清理缓存
async function handleCleanCache() {
    const confirmed = confirm('确定要清理缓存吗？');
    if (!confirmed) return;
    
    elements.statusText.textContent = '清理缓存中...';
    // 这里可以添加具体的清理逻辑
    setTimeout(() => {
        elements.statusText.textContent = '缓存清理完成 - 请手动刷新查看更新';
        showRefreshNotification();
    }, 1000);
}

// 显示刷新提示通知
function showRefreshNotification() {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'refresh-notification';
    notification.innerHTML = `
        <span class="notification-icon">🔄</span>
        <span class="notification-text">数据已变更，请刷新查看最新状态</span>
        <button class="notification-btn" id="notification-refresh">立即刷新</button>
        <button class="notification-close" id="notification-close">✕</button>
    `;
    
    document.body.appendChild(notification);
    
    // 动画显示
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // 刷新按钮事件
    document.getElementById('notification-refresh').addEventListener('click', () => {
        notification.remove();
        scanDirectory(currentPath);
    });
    
    // 关闭按钮事件
    document.getElementById('notification-close').addEventListener('click', () => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    });
    
    // 5秒后自动隐藏
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);
