const express = require('express');
const app = express();
const PORT = 3001;
const fs = require('fs');
const path = require('path');

// 创建日志目录
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志文件路径
const logFile = path.join(logDir, `admin-${new Date().toISOString().split('T')[0]}.log`);

// 日志写入函数
function writeLog(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data
  };
  
  const logString = JSON.stringify(logEntry) + '\n';
  
  // 写入文件
  fs.appendFile(logFile, logString, (err) => {
    if (err) {
      console.error('Failed to write log:', err);
    }
  });
  
  // 同时输出到控制台
  console[level === 'error' ? 'error' : 'log'](`${timestamp} [${level.toUpperCase()}] ${message}`, data);
}

// 导入主服务器的Token存储和聊天房间
const server = require('./server');
const tokens = server.tokens || new Map();
const chatRooms = server.chatRooms || new Map();

app.use(express.json());

// 简单的管理端认证（实际应用中应使用更安全的认证方式）
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'admin123') {
    writeLog('error', 'Admin authentication failed', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  writeLog('info', 'Admin authenticated', { ip: req.ip, path: req.path });
  next();
};



// 查看所有Token
app.get('/tokens', adminAuth, (req, res) => {
  const tokenList = [];
  tokens.forEach((info, token) => {
    tokenList.push({
      token,
      user: info.user,
      expiresAt: info.expiresAt,
      expiresIn: Math.round((info.expiresAt - Date.now()) / 1000 / 60 / 60 / 24) + ' days'
    });
  });
  writeLog('info', 'Tokens listed', { count: tokenList.length });
  res.json({
    tokens: tokenList
  });
});

// 添加新Token
app.post('/tokens', adminAuth, (req, res) => {
  const { token, user, expiresDays = 7 } = req.body;
  if (!token) {
    writeLog('error', 'Missing token in request', { user: user || 'unknown' });
    return res.status(400).json({ error: 'Missing token' });
  }
  
  tokens.set(token, {
    token,
    user: user || 'unknown',
    expiresAt: Date.now() + expiresDays * 24 * 60 * 60 * 1000
  });
  
  writeLog('info', 'Token added', { token: token.substring(0, 6) + '...', user: user || 'unknown', expiresDays });
  res.json({
    success: true,
    message: 'Token added successfully',
    token,
    user: user || 'unknown',
    expiresIn: expiresDays + ' days'
  });
});

// 删除Token
app.delete('/tokens/:token', adminAuth, (req, res) => {
  const { token } = req.params;
  if (tokens.has(token)) {
    const tokenInfo = tokens.get(token);
    tokens.delete(token);
    writeLog('info', 'Token deleted', { token: token.substring(0, 6) + '...', user: tokenInfo.user });
    res.json({
      success: true,
      message: 'Token deleted successfully',
      token
    });
  } else {
    writeLog('error', 'Token not found', { token: token.substring(0, 6) + '...' });
    res.status(404).json({ error: 'Token not found' });
  }
});

// 404处理
app.use((req, res) => {
  writeLog('error', 'Route not found', { ip: req.ip, path: req.path, method: req.method });
  res.status(404).json({
    success: false,
    error: 'Route not found',
    data: {
      path: req.path,
      method: req.method
    }
  });
});

// 统一错误处理中间件
app.use((err, req, res, next) => {
  writeLog('error', 'Internal server error', { error: err.message, stack: err.stack, ip: req.ip, path: req.path });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    data: {
      message: err.message
    }
  });
});

// 查看所有聊天房间
app.get('/chat/rooms', adminAuth, (req, res) => {
  const rooms = [];
  chatRooms.forEach((messages, room) => {
    rooms.push({
      room,
      messageCount: messages.length
    });
  });
  writeLog('info', 'Chat rooms listed', { count: rooms.length });
  res.json({
    success: true,
    message: 'Chat rooms listed successfully',
    data: {
      rooms
    }
  });
});

// 查看房间消息
app.get('/chat/rooms/:room', adminAuth, (req, res) => {
  const { room } = req.params;
  if (!chatRooms.has(room)) {
    writeLog('error', 'Chat room not found', { room });
    return res.status(404).json({ error: 'Chat room not found' });
  }
  
  const messages = chatRooms.get(room);
  writeLog('info', 'Chat room messages viewed', { room, count: messages.length });
  res.json({
    success: true,
    message: 'Chat room messages retrieved successfully',
    data: {
      room,
      messages
    }
  });
});

// 清空房间消息
app.delete('/chat/rooms/:room/messages', adminAuth, (req, res) => {
  const { room } = req.params;
  if (!chatRooms.has(room)) {
    writeLog('error', 'Chat room not found', { room });
    return res.status(404).json({ error: 'Chat room not found' });
  }
  
  chatRooms.set(room, []);
  writeLog('info', 'Chat room messages cleared', { room });
  res.json({
    success: true,
    message: 'Chat room messages cleared successfully',
    data: {
      room
    }
  });
});

// 删除房间
app.delete('/chat/rooms/:room', adminAuth, (req, res) => {
  const { room } = req.params;
  if (!chatRooms.has(room)) {
    writeLog('error', 'Chat room not found', { room });
    return res.status(404).json({ error: 'Chat room not found' });
  }
  
  chatRooms.delete(room);
  writeLog('info', 'Chat room deleted', { room });
  res.json({
    success: true,
    message: 'Chat room deleted successfully',
    data: {
      room
    }
  });
});

app.listen(PORT, () => {
  writeLog('info', 'Admin server started', { port: PORT });
});

module.exports = { tokens, chatRooms };