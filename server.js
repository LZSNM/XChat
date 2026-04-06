const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// 创建日志目录
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 生成日志文件路径
const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);

// 尝试加载mdns库，用于服务发现
let mdns = null;
try {
  mdns = require('mdns');
  writeLog('info', 'mDNS service discovery enabled');
} catch (error) {
  writeLog('warn', 'mDNS service discovery not available', { error: error.message });
  writeLog('info', 'Falling back to manual discovery method');
}

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

const app = express();
const PORT = 3000;

// 模拟Token存储，实际应用中应使用数据库
const tokens = new Map();

// 初始化默认Token
const defaultTokens = [
  { token: 'token123', user: 'user1', expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }, // 7天有效期
  { token: 'token456', user: 'user2', expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
  { token: 'token789', user: 'user3', expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }
];

defaultTokens.forEach(t => tokens.set(t.token, t));

// 验证Token中间件
function validateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    writeLog('error', 'Missing token', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Missing token' });
  }
  
  const tokenInfo = tokens.get(token);
  if (!tokenInfo) {
    writeLog('error', 'Invalid token', { ip: req.ip, path: req.path, token: token.substring(0, 6) + '...' });
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  if (Date.now() > tokenInfo.expiresAt) {
    tokens.delete(token);
    writeLog('error', 'Token expired', { ip: req.ip, path: req.path, user: tokenInfo.user });
    return res.status(401).json({ error: 'Token expired' });
  }
  
  writeLog('info', 'Token validated', { ip: req.ip, user: tokenInfo.user });
  req.tokenInfo = tokenInfo;
  next();
}

// 聊天房间存储
const chatRooms = new Map();

// 用户存储（实际应用中应使用数据库）
const users = new Map();

// 导出tokens、chatRooms和users供管理端使用
module.exports = { tokens, validateToken, chatRooms, users };

// 安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(cors());
app.use(express.json());

// 简单的速率限制
const rateLimit = new Map();
const MAX_REQUESTS = 100; // 每分钟最大请求数
const WINDOW_MS = 60 * 1000; // 时间窗口（毫秒）

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, [{ timestamp: now }]);
    return next();
  }
  
  const requests = rateLimit.get(ip).filter(r => now - r.timestamp < WINDOW_MS);
  
  if (requests.length >= MAX_REQUESTS) {
    writeLog('error', 'Rate limit exceeded', { ip, path: req.path });
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  requests.push({ timestamp: now });
  rateLimit.set(ip, requests);
  next();
});

// 转发消息到目标IP
function forwardMessage(to, message, callback) {
  try {
    // 解析目标地址
    const url = new URL(`http://${to}/relay`);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(message)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        callback(null, { statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (error) => {
      callback(error);
    });

    req.write(message);
    req.end();
  } catch (error) {
    callback(error);
  }
}

// 消息中转端点
app.post('/relay', validateToken, (req, res) => {
  const { tag, to, content } = req.body;
  
  if (!tag || !to || !content) {
    return res.status(400).json({ error: 'Missing required fields: tag, to, content' });
  }
  
  writeLog('info', 'Relaying message', { tag, to, content, user: req.tokenInfo.user, ip: req.ip });
  
  // 处理聊天消息
  if (tag === 'chat') {
    try {
      const chatMessage = JSON.parse(content);
      const roomName = to;
      
      // 初始化聊天房间
      if (!chatRooms.has(roomName)) {
        chatRooms.set(roomName, []);
        writeLog('info', 'Created new chat room', { room: roomName });
      }
      
      // 添加消息到房间
      const roomMessages = chatRooms.get(roomName);
      const messageWithMeta = {
        ...chatMessage,
        id: Date.now().toString(),
        room: roomName,
        serverTimestamp: new Date().toISOString()
      };
      roomMessages.push(messageWithMeta);
      
      // 限制消息数量，只保留最近100条
      if (roomMessages.length > 100) {
        roomMessages.shift();
      }
      
      writeLog('info', 'Chat message added to room', { room: roomName, user: chatMessage.user, message: chatMessage.message.substring(0, 50) + '...' });
      
      // 返回成功响应
      res.json({
        success: true,
        message: 'Chat message relayed successfully',
        data: {
          tag,
          room: roomName,
          message: chatMessage,
          messageId: messageWithMeta.id
        }
      });
    } catch (error) {
      writeLog('error', 'Failed to process chat message', { error: error.message, content });
      return res.json({
        success: false,
        message: 'Failed to process chat message',
        error: error.message,
        data: {
          tag,
          to,
          content
        }
      });
    }
  } else {
    // 非聊天消息，继续原有转发逻辑
    // 准备转发的消息
    const forwardMessageData = JSON.stringify({
      tag,
      content,
      from: req.ip,
      user: req.tokenInfo.user
    });
    
    // 转发消息到目标IP
    forwardMessage(to, forwardMessageData, (error, response) => {
      if (error) {
        writeLog('error', 'Failed to forward message', { to, error: error.message, tag, content, user: req.tokenInfo.user });
        return res.json({
          success: false,
          message: 'Message forwarding failed',
          error: error.message,
          data: {
            tag,
            to,
            content
          }
        });
      }
      
      writeLog('info', 'Message forwarded', { to, statusCode: response.statusCode, tag, user: req.tokenInfo.user });
      
      res.json({
        success: true,
        message: 'Message relayed successfully',
        data: {
          tag,
          to,
          content,
          forwarded: true,
          forwardStatus: response.statusCode
        }
      });
    });
  }
});

// 获取聊天房间消息
app.get('/chat/:room', validateToken, (req, res) => {
  const { room } = req.params;
  
  if (!chatRooms.has(room)) {
    return res.json({
      success: true,
      message: 'Chat room not found',
      data: {
        room,
        messages: []
      }
    });
  }
  
  const messages = chatRooms.get(room);
  writeLog('info', 'Chat room messages requested', { room, count: messages.length, user: req.tokenInfo.user });
  
  res.json({
    success: true,
    message: 'Chat room messages retrieved successfully',
    data: {
      room,
      messages
    }
  });
});

// 获取所有聊天房间
app.get('/chat', validateToken, (req, res) => {
  const rooms = Array.from(chatRooms.keys());
  writeLog('info', 'Chat rooms list requested', { count: rooms.length, user: req.tokenInfo.user });
  
  res.json({
    success: true,
    message: 'Chat rooms list retrieved successfully',
    data: {
      rooms
    }
  });
});

// 注册端点
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({
      success: false,
      error: 'Missing username or password'
    });
  }
  
  if (users.has(username)) {
    return res.json({
      success: false,
      error: 'Username already exists'
    });
  }
  
  // 生成token（实际应用中应使用更安全的方法）
  const token = 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  // 存储用户信息（实际应用中应加密密码）
  users.set(username, {
    username,
    password,
    token,
    createdAt: new Date().toISOString()
  });
  
  // 存储token
  tokens.set(token, {
    token,
    user: username,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天有效期
  });
  
  writeLog('info', 'User registered', { username });
  
  res.json({
    success: true,
    message: 'Registration successful',
    token
  });
});

// 登录端点
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({
      success: false,
      error: 'Missing username or password'
    });
  }
  
  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.json({
      success: false,
      error: 'Invalid username or password'
    });
  }
  
  // 检查token是否过期
  const tokenInfo = tokens.get(user.token);
  if (!tokenInfo || Date.now() > tokenInfo.expiresAt) {
    // 生成新token
    const newToken = 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    user.token = newToken;
    users.set(username, user);
    
    // 存储新token
    tokens.set(newToken, {
      token: newToken,
      user: username,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天有效期
    });
  }
  
  writeLog('info', 'User logged in', { username });
  
  res.json({
    success: true,
    message: 'Login successful',
    token: user.token
  });
});

// 根路径重定向到聊天页面
app.get('/', (req, res) => {
  res.redirect('/chat.html');
});

// 静态文件服务
app.use(express.static(__dirname));

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

// 存储WebSocket连接，按房间分组
const wsConnections = new Map();

// 获取WebSocket连接的客户端信息
function getClientInfo(ws) {
  return ws.clientInfo;
}

// 处理WebSocket连接
function handleWebSocket(ws) {
  let clientInfo = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // 处理认证
        if (data.type === 'auth') {
            const token = data.token;
            const username = data.username;
            const tokenInfo = tokens.get(token);
            
            if (!tokenInfo) {
                ws.send(JSON.stringify({ type: 'error', error: 'Invalid token' }));
                return;
            }
            
            if (Date.now() > tokenInfo.expiresAt) {
                tokens.delete(token);
                ws.send(JSON.stringify({ type: 'error', error: 'Token expired' }));
                return;
            }
            
            clientInfo = {
                user: username || tokenInfo.user,
                token,
                room: data.room
            };
            
            // 存储客户端信息到WebSocket对象
            ws.clientInfo = clientInfo;
            
            // 加入房间
            if (!wsConnections.has(data.room)) {
                wsConnections.set(data.room, new Set());
            }
            wsConnections.get(data.room).add(ws);
            
            writeLog('info', 'WebSocket client connected', { user: clientInfo.user, room: data.room });
            ws.send(JSON.stringify({ type: 'auth_success', user: clientInfo.user, room: data.room }));
            
            // 通知房间内其他用户
            broadcastToRoom(data.room, JSON.stringify({ 
              type: 'user_joined', 
              user: clientInfo.user 
            }), ws);
            
            // 发送在线用户列表
            const onlineUsers = [];
            wsConnections.get(data.room).forEach((connection) => {
              const connInfo = getClientInfo(connection);
              if (connInfo) {
                onlineUsers.push(connInfo.user);
              }
            });
            ws.send(JSON.stringify({ 
              type: 'online_users', 
              users: onlineUsers 
            }));
        
      } else if (data.type === 'message') {
        // 处理聊天消息
        if (!clientInfo) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        
        const room = clientInfo.room;
        const chatMessage = {
          user: clientInfo.user,
          message: data.message,
          timestamp: new Date().toISOString()
        };
        
        // 存储消息到房间
        if (!chatRooms.has(room)) {
          chatRooms.set(room, []);
        }
        
        const roomMessages = chatRooms.get(room);
        const messageWithMeta = {
          ...chatMessage,
          id: Date.now().toString(),
          room,
          serverTimestamp: new Date().toISOString()
        };
        roomMessages.push(messageWithMeta);
        
        // 限制消息数量
        if (roomMessages.length > 100) {
          roomMessages.shift();
        }
        
        writeLog('info', 'WebSocket chat message', { room, user: clientInfo.user, message: chatMessage.message.substring(0, 50) + '...' });
        
        // 广播消息到房间（排除发送者）
        broadcastToRoom(room, JSON.stringify({ 
          type: 'message', 
          message: messageWithMeta 
        }), ws);
        
      } else if (data.type === 'file') {
        // 处理文件消息
        if (!clientInfo) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        
        const room = clientInfo.room;
        const fileMessage = data.message;
        
        // 存储文件消息到房间
        if (!chatRooms.has(room)) {
          chatRooms.set(room, []);
        }
        
        const roomMessages = chatRooms.get(room);
        const fileMessageWithMeta = {
          ...fileMessage,
          id: Date.now().toString(),
          room,
          serverTimestamp: new Date().toISOString()
        };
        roomMessages.push(fileMessageWithMeta);
        
        // 限制消息数量
        if (roomMessages.length > 100) {
          roomMessages.shift();
        }
        
        writeLog('info', 'WebSocket file message', { room, user: clientInfo.user, fileName: fileMessage.file.name, fileSize: fileMessage.file.size });
        
        // 广播文件消息到房间（排除发送者）
        broadcastToRoom(room, JSON.stringify({ 
          type: 'message', 
          message: fileMessageWithMeta 
        }), ws);
        
      } else if (data.type === 'private_message') {
        // 处理私聊消息
        if (!clientInfo) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        
        const privateMessage = data.message;
        const toUser = privateMessage.to;
        
        if (privateMessage.file) {
          writeLog('info', 'WebSocket private file message', { from: clientInfo.user, to: toUser, fileName: privateMessage.file.name, fileSize: privateMessage.file.size });
        } else {
          writeLog('info', 'WebSocket private message', { from: clientInfo.user, to: toUser, message: privateMessage.message.substring(0, 50) + '...' });
        }
        
        // 查找目标用户的WebSocket连接
        let targetWs = null;
        wsConnections.forEach((connections, room) => {
          connections.forEach((connection) => {
            const connectionInfo = getClientInfo(connection);
            if (connectionInfo && connectionInfo.user === toUser) {
              targetWs = connection;
            }
          });
        });
        
        if (targetWs) {
          // 发送私聊消息给目标用户
          targetWs.send(JSON.stringify({ 
            type: 'message', 
            message: privateMessage 
          }));
        } else {
          // 目标用户不在线，发送错误消息
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'User not online' 
          }));
        }
        
      } else if (data.type === 'ping') {
        // 处理心跳
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      writeLog('error', 'WebSocket message error', { error: error.message });
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
    }
  });
  
  ws.on('close', () => {
    if (clientInfo) {
      const { room, user } = clientInfo;
      // 从房间中移除连接
      if (wsConnections.has(room)) {
        wsConnections.get(room).delete(ws);
        // 如果房间为空，删除房间
        if (wsConnections.get(room).size === 0) {
          wsConnections.delete(room);
        }
      }
      writeLog('info', 'WebSocket client disconnected', { user, room });
      // 通知房间内其他用户
      broadcastToRoom(room, JSON.stringify({ 
        type: 'user_left', 
        user 
      }));
    }
  });
  
  ws.on('error', (error) => {
    writeLog('error', 'WebSocket error', { error: error.message });
  });
}

// 广播消息到房间内所有客户端
function broadcastToRoom(room, message, excludeWs = null) {
  if (wsConnections.has(room)) {
    wsConnections.get(room).forEach((ws) => {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

// 仅在直接运行时启动服务器
if (require.main === module) {
  // 创建HTTP服务器
  const server = http.createServer(app);
  
  // 创建WebSocket服务器
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', handleWebSocket);
  
  server.listen(PORT, () => {
    writeLog('info', 'Relay server started', { port: PORT, websocket: true });
    
    // 启动服务发现
    if (mdns) {
      try {
        // 注册mDNS服务
        const ad = mdns.createAdvertisement(mdns.tcp('http'), PORT, {
          name: 'Chat Server',
          txtRecord: {
            version: '1.0.0',
            description: 'Online Chat System'
          }
        });
        ad.start();
        writeLog('info', 'mDNS service registered', { name: 'Chat Server', port: PORT });
      } catch (error) {
        writeLog('error', 'Failed to register mDNS service', { error: error.message });
      }
    }
  });
}