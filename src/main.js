const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

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

// 扫描目录获取文件信息（包含隐藏文件夹）
async function scanDirectory(dirPath, depth = 0, maxDepth = 4) {
  const results = [];
  
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // 只跳过特定的系统目录，保留隐藏文件夹
      if (entry.name === 'node_modules' || 
          entry.name === '.Trash' ||
          entry.name === '.Spotlight-V100' ||
          entry.name === '.fseventsd' ||
          entry.name === '.DocumentRevisions-V100') {
        continue;
      }
      
      try {
        const stats = await fs.promises.stat(fullPath);
        
        if (entry.isDirectory() && depth < maxDepth) {
          const children = await scanDirectory(fullPath, depth + 1, maxDepth);
          const totalSize = children.reduce((sum, child) => sum + child.size, stats.size);
          
          results.push({
            name: entry.name,
            path: fullPath,
            size: totalSize,
            type: 'directory',
            children: children,
            mtime: stats.mtime,
            isHidden: entry.name.startsWith('.')
          });
        } else if (entry.isFile()) {
          results.push({
            name: entry.name,
            path: fullPath,
            size: stats.size,
            type: 'file',
            children: [],
            mtime: stats.mtime,
            isHidden: entry.name.startsWith('.')
          });
        }
      } catch (err) {
        // 权限错误，跳过
      }
    }
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
