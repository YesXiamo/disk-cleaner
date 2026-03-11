const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fg = require('fast-glob');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    transparent: true,
    backgroundColor: '#00000000'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // 开发时打开开发者工具
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 扫描目录获取文件信息（使用 fast-glob 优化性能）
async function scanDirectory(dirPath, depth = 0, maxDepth = 4) {
  const results = [];
  
  try {
    // 使用 fast-glob 快速获取所有文件和目录
    const entries = await fg('*', {
      cwd: dirPath,
      onlyFiles: false,
      markDirectories: true,
      dot: true, // 包含隐藏文件
      followSymbolicLinks: false,
      suppressErrors: true, // 忽略权限错误
      concurrency: 100 // 并发数
    });
    
    // 并行处理所有条目
    const entryPromises = entries.map(async (entryName) => {
      // 去除目录标记的斜杠
      const cleanName = entryName.endsWith('/') ? entryName.slice(0, -1) : entryName;
      const fullPath = path.join(dirPath, cleanName);
      
      // 只跳过特定的系统目录，保留隐藏文件夹
      if (cleanName === 'node_modules' || 
          cleanName === '.Trash' ||
          cleanName === '.Spotlight-V100' ||
          cleanName === '.fseventsd' ||
          cleanName === '.DocumentRevisions-V100') {
        return null;
      }
      
      try {
        const stats = await fs.promises.stat(fullPath);
        const isDirectory = stats.isDirectory();
        
        if (isDirectory && depth < maxDepth) {
          const children = await scanDirectory(fullPath, depth + 1, maxDepth);
          const totalSize = children.reduce((sum, child) => sum + child.size, stats.size);
          
          return {
            name: cleanName,
            path: fullPath,
            size: totalSize,
            type: 'directory',
            children: children,
            mtime: stats.mtime,
            isHidden: cleanName.startsWith('.')
          };
        } else if (isDirectory) {
          // 达到最大深度，只统计目录本身大小
          return {
            name: cleanName,
            path: fullPath,
            size: stats.size,
            type: 'directory',
            children: [],
            mtime: stats.mtime,
            isHidden: cleanName.startsWith('.')
          };
        } else {
          return {
            name: cleanName,
            path: fullPath,
            size: stats.size,
            type: 'file',
            children: [],
            mtime: stats.mtime,
            isHidden: cleanName.startsWith('.')
          };
        }
      } catch (err) {
        // 权限错误，跳过
        return null;
      }
    });
    
    // 等待所有并行任务完成
    const resolvedEntries = await Promise.all(entryPromises);
    
    // 过滤掉 null 值并添加到结果
    resolvedEntries.forEach(entry => {
      if (entry) results.push(entry);
    });
    
  } catch (err) {
    // 目录无法读取
  }
  
  return results.sort((a, b) => b.size - a.size);
}

// 获取磁盘使用情况（使用当前扫描目录所在的磁盘）
async function getDiskUsage(dirPath) {
  try {
    // 获取目录所在的挂载点
    const { stdout: mountStdout } = await execPromise(`df "${dirPath}"`);
    const mountLines = mountStdout.trim().split('\n');
    const mountDataLine = mountLines[1];
    const mountParts = mountDataLine.split(/\s+/);
    
    // 获取字节级别的精确数据
    const { stdout: byteStdout } = await execPromise(`df -k "${dirPath}"`);
    const byteLines = byteStdout.trim().split('\n');
    const byteDataLine = byteLines[1];
    const byteParts = byteDataLine.split(/\s+/);
    
    // 计算百分比（使用块数计算更准确）
    const totalBlocks = parseInt(byteParts[1]);
    const usedBlocks = parseInt(byteParts[2]);
    const availableBlocks = parseInt(byteParts[3]);
    const percentage = Math.round((usedBlocks / totalBlocks) * 100);
    
    // 格式化大小显示
    function formatBytes(kb) {
      const bytes = kb * 1024;
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = bytes;
      let unitIndex = 0;
      
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }
      
      if (unitIndex >= 3) {
        return `${size.toFixed(2)} ${units[unitIndex]}`;
      } else {
        return `${Math.round(size)} ${units[unitIndex]}`;
      }
    }
    
    return {
      total: formatBytes(totalBlocks),
      used: formatBytes(usedBlocks),
      available: formatBytes(availableBlocks),
      percentage: percentage,
      mountPoint: mountParts[8] || mountParts[mountParts.length - 1]
    };
  } catch (error) {
    console.error('获取磁盘使用情况失败:', error);
    return { total: 'N/A', used: 'N/A', available: 'N/A', percentage: 0, mountPoint: '/' };
  }
}

// IPC 处理程序
ipcMain.handle('scan-directory', async (event, dirPath) => {
  try {
    const results = await scanDirectory(dirPath);
    const diskUsage = await getDiskUsage(dirPath);
    return { success: true, data: results, diskUsage };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-home-directory', async () => {
  return require('os').homedir();
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      await fs.promises.rmdir(filePath, { recursive: true });
    } else {
      await fs.promises.unlink(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result;
});

// 在Finder中打开文件/文件夹
ipcMain.handle('open-in-finder', async (event, filePath) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    await execPromise(`open -R "${filePath}"`);
    return { success: true };
  } catch (error) {
    console.error('打开Finder失败:', error);
    return { success: false, error: error.message };
  }
});
