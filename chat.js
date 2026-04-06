// 全局变量
let currentUser = null;
let currentToken = null;
let currentRoom = null;
let ws = null;
let onlineUsers = [];
let privateChats = new Map(); // 存储私聊消息
let currentChatType = 'room'; // 'room' 或 'private'
let currentPrivateUser = null;
let serverAddress = 'localhost:3000'; // 默认服务器地址

// DOM元素
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const backToRoomBtn = document.getElementById('back-to-room');
const sendBtn = document.getElementById('send-btn');
const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');
const chatTitle = document.getElementById('chat-title');
const currentRoomElement = document.getElementById('current-room');
const userList = document.getElementById('user-list');
const privateChatsList = document.getElementById('private-chats');
const serverAddressInput = document.getElementById('server-address');
const discoverServerBtn = document.getElementById('discover-server');
const fileInput = document.getElementById('file-input');
const fileBtn = document.getElementById('file-btn');

// 选项卡切换
const tabBtns = document.querySelectorAll('.tab-btn');
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // 切换选项卡
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 切换表单
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
        });
        document.getElementById(`${tab}-form`).classList.add('active');
    });
});

// 服务器地址输入事件
serverAddressInput.addEventListener('input', () => {
    serverAddress = serverAddressInput.value.trim();
});

// 自动发现服务器
if (discoverServerBtn) {
    discoverServerBtn.addEventListener('click', () => {
        discoverServer();
    });
}

// 自动发现服务器函数
function discoverServer() {
    discoverServerBtn.disabled = true;
    discoverServerBtn.textContent = '搜索中...';
    
    const foundServers = [];
    let scanned = 0;
    const total = 254;
    
    // 扫描多个常见的局域网网段
    const subnets = [
        '192.168.0.',
        '192.168.1.',
        '192.168.10.',
        '192.168.100.',
        '10.0.0.',
        '10.0.1.'
    ];
    
    const totalScans = subnets.length * 254;
    
    // 扫描每个网段
    subnets.forEach(subnet => {
        for (let i = 1; i <= 254; i++) {
            const ip = subnet + i;
            
            // 创建一个小型的GET请求，只请求根路径
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 500); // 500ms超时
            
            fetch(`http://${ip}:3000/`, {
                method: 'GET',
                signal: controller.signal
            })
            .then(response => {
                if (response.ok) {
                    foundServers.push(ip + ':3000');
                }
            })
            .catch(() => {
                // 忽略错误
            })
            .finally(() => {
                clearTimeout(timeoutId);
                scanned++;
                
                // 更新进度
                const progress = Math.round((scanned / totalScans) * 100);
                discoverServerBtn.textContent = `搜索中... ${progress}%`;
                
                if (scanned === totalScans) {
                    processDiscoveryResults(foundServers);
                }
            });
        }
    });
}

// 处理发现结果
function processDiscoveryResults(servers) {
    discoverServerBtn.disabled = false;
    discoverServerBtn.textContent = '自动发现';
    
    if (servers.length === 0) {
        alert('未发现局域网内的服务器');
        return;
    }
    
    if (servers.length === 1) {
        // 只有一个服务器，直接使用
        serverAddress = servers[0];
        serverAddressInput.value = serverAddress;
        alert(`已发现服务器: ${serverAddress}`);
    } else {
        // 多个服务器，让用户选择
        const server = prompt('发现多个服务器，请选择一个:', servers.join('\n'));
        if (server && servers.includes(server)) {
            serverAddress = server;
            serverAddressInput.value = serverAddress;
        }
    }
}

// 获取本地IP地址
function getLocalIP() {
    // 尝试获取本地IP地址
    try {
        // 简单的IP地址检测，适用于大多数局域网
        const possibleIPs = [
            '192.168.0.1',
            '192.168.1.1',
            '192.168.10.1',
            '192.168.100.1',
            '10.0.0.1',
            '10.0.1.1'
        ];
        
        // 选择一个常见的局域网IP前缀
        return '192.168.1.100'; // 默认使用192.168.1.x网段
    } catch (error) {
        console.error('获取本地IP地址错误:', error);
        return '192.168.1.100'; //  fallback
    }
}

// 登录功能
loginBtn.addEventListener('click', () => {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const room = document.getElementById('login-room').value;
    serverAddress = serverAddressInput.value.trim();
    
    if (!username || !password || !room || !serverAddress) {
        alert('请填写所有字段');
        return;
    }
    
    // 模拟登录请求
    fetch(`http://${serverAddress}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username,
            password
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentUser = username;
            currentToken = data.token;
            currentRoom = room;
            
            // 显示聊天界面
            authContainer.style.display = 'none';
            chatContainer.style.display = 'flex';
            currentRoomElement.textContent = room;
            
            // 加载历史消息
            loadMessages();
            
            // 建立WebSocket连接
            connectWebSocket();
        } else {
            alert('登录失败: ' + data.error);
        }
    })
    .catch(error => {
        console.error('登录错误:', error);
        alert('登录失败，请检查网络连接');
    });
});

// 注册功能
registerBtn.addEventListener('click', () => {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    if (!username || !password || !confirmPassword) {
        alert('请填写所有字段');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('两次输入的密码不一致');
        return;
    }
    
    // 模拟注册请求
    fetch(`http://${serverAddress}/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username,
            password
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('注册成功，请登录');
            // 切换到登录选项卡
            document.querySelector('.tab-btn[data-tab="login"]').click();
            // 填充用户名
            document.getElementById('login-username').value = username;
        } else {
            alert('注册失败: ' + data.error);
        }
    })
    .catch(error => {
        console.error('注册错误:', error);
        alert('注册失败，请检查网络连接');
    });
});

// 退出功能
logoutBtn.addEventListener('click', () => {
    // 关闭WebSocket连接
    if (ws) {
        ws.close();
        ws = null;
    }
    
    currentUser = null;
    currentToken = null;
    currentRoom = null;
    
    // 显示登录/注册界面
    chatContainer.style.display = 'none';
    authContainer.style.display = 'block';
    
    // 清空输入框
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-room').value = '';
    document.getElementById('register-username').value = '';
    document.getElementById('register-password').value = '';
    document.getElementById('register-confirm-password').value = '';
    messageInput.value = '';
    chatMessages.innerHTML = '';
});

// 发送消息
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// 文件上传
fileBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        uploadFile(file);
    }
});

function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;
    
    // 显示自己的消息
    addMessage(currentUser, content, true);
    
    // 通过WebSocket发送消息
    if (ws && ws.readyState === WebSocket.OPEN) {
        if (currentChatType === 'room') {
            // 发送房间消息
            ws.send(JSON.stringify({
                type: 'message',
                message: content
            }));
        } else if (currentChatType === 'private' && currentPrivateUser) {
            // 发送私聊消息
            const privateMessage = {
                user: currentUser,
                message: content,
                to: currentPrivateUser,
                type: 'private',
                timestamp: new Date().toISOString()
            };
            
            // 存储到本地私聊消息
            if (!privateChats.has(currentPrivateUser)) {
                privateChats.set(currentPrivateUser, []);
            }
            privateChats.get(currentPrivateUser).push(privateMessage);
            
            // 发送到服务器
            ws.send(JSON.stringify({
                type: 'private_message',
                message: privateMessage
            }));
        }
    } else {
        console.error('WebSocket连接未建立');
    }
    
    // 清空输入框
    messageInput.value = '';
}

// 上传文件
function uploadFile(file) {
    // 显示文件上传消息
    addMessage(currentUser, `[文件] ${file.name} (${formatFileSize(file.size)})`, true);
    
    // 读取文件内容
    const reader = new FileReader();
    reader.onload = function(e) {
        const fileData = e.target.result;
        const fileExtension = file.name.split('.').pop();
        
        // 构建文件消息对象
        const fileMessage = {
            user: currentUser,
            type: currentChatType === 'private' ? 'private' : 'file',
            file: {
                name: file.name,
                size: file.size,
                type: file.type,
                data: fileData.split(',')[1], // 提取Base64数据部分
                extension: fileExtension
            },
            timestamp: new Date().toISOString()
        };
        
        if (currentChatType === 'private' && currentPrivateUser) {
            fileMessage.to = currentPrivateUser;
            
            // 存储到本地私聊消息
            if (!privateChats.has(currentPrivateUser)) {
                privateChats.set(currentPrivateUser, []);
            }
            privateChats.get(currentPrivateUser).push(fileMessage);
        }
        
        // 通过WebSocket发送文件
        if (ws && ws.readyState === WebSocket.OPEN) {
            if (currentChatType === 'private' && currentPrivateUser) {
                ws.send(JSON.stringify({
                    type: 'private_message',
                    message: fileMessage
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'file',
                    message: fileMessage
                }));
            }
        } else {
            console.error('WebSocket连接未建立');
        }
    };
    
    reader.onerror = function() {
        addMessage('系统', '文件上传失败', false);
    };
    
    // 读取文件为DataURL (Base64)
    reader.readAsDataURL(file);
    
    // 重置文件输入
    fileInput.value = '';
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 添加消息到聊天界面
function addMessage(sender, content, isOwn, isFile = false, fileData = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    
    if (isFile && fileData) {
        // 处理文件消息
        messageDiv.innerHTML = `
            <div class="sender">${sender}</div>
            <div class="message-content">
                <div class="file-message">
                    <span class="file-name">${fileData.name}</span>
                    <span class="file-size">(${formatFileSize(fileData.size)})</span>
                    <button class="download-btn" onclick="downloadFile('${fileData.data}', '${fileData.name}', '${fileData.type}')">下载</button>
                </div>
            </div>
        `;
    } else {
        // 处理文本消息
        messageDiv.innerHTML = `
            <div class="sender">${sender}</div>
            <div class="message-content">${content}</div>
        `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 下载文件
function downloadFile(base64Data, fileName, fileType) {
    const link = document.createElement('a');
    link.href = `data:${fileType};base64,${base64Data}`;
    link.download = fileName;
    link.click();
}

// 加载历史消息
function loadMessages() {
    // 实际应用中，这里应该从服务器获取历史消息
    // 这里仅作为示例
    addMessage('系统', `欢迎来到 ${currentRoom} 聊天房间！`, false);
}

// 建立WebSocket连接
function connectWebSocket() {
    // 创建WebSocket连接
    ws = new WebSocket(`ws://${serverAddress}`);
    
    ws.onopen = () => {
        console.log('WebSocket连接已建立');
        // 发送认证信息
        ws.send(JSON.stringify({
            type: 'auth',
            token: currentToken,
            username: currentUser,
            room: currentRoom
        }));
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'auth_success':
                    console.log('WebSocket认证成功');
                    console.log('用户信息:', data.user);
                    break;
                case 'message':
                    // 接收其他用户的消息
                    if (data.message.user !== currentUser) {
                        if (data.message.type === 'private' && data.message.to === currentUser) {
                            // 私聊消息
                            const fromUser = data.message.user;
                            if (!privateChats.has(fromUser)) {
                                privateChats.set(fromUser, []);
                            }
                            privateChats.get(fromUser).push(data.message);
                            
                            // 如果当前正在与该用户私聊，显示消息
                            if (currentChatType === 'private' && currentPrivateUser === fromUser) {
                                if (data.message.file) {
                                    // 私聊文件消息
                                    addMessage(fromUser, `[文件] ${data.message.file.name}`, false, true, data.message.file);
                                } else {
                                    // 私聊文本消息
                                    addMessage(fromUser, data.message.message, false);
                                }
                            }
                            
                            // 更新私聊列表
                            updatePrivateChatsList();
                        } else if (data.message.type !== 'private') {
                            // 房间消息
                            if (currentChatType === 'room') {
                                if (data.message.file) {
                                    // 房间文件消息
                                    addMessage(data.message.user, `[文件] ${data.message.file.name}`, false, true, data.message.file);
                                } else {
                                    // 房间文本消息
                                    addMessage(data.message.user, data.message.message, false);
                                }
                            }
                        }
                    }
                    break;
                case 'user_joined':
                    // 其他用户加入房间
                    if (currentChatType === 'room') {
                        addMessage('系统', `${data.user} 加入了聊天`, false);
                    }
                    // 更新在线用户列表
                    updateOnlineUsersList();
                    break;
                case 'user_left':
                    // 其他用户离开房间
                    if (currentChatType === 'room') {
                        addMessage('系统', `${data.user} 离开了聊天`, false);
                    }
                    // 更新在线用户列表
                    updateOnlineUsersList();
                    break;
                case 'online_users':
                    // 在线用户列表
                    onlineUsers = data.users;
                    updateOnlineUsersList();
                    break;
                case 'error':
                    console.error('WebSocket错误:', data.error);
                    break;
                case 'pong':
                    // 心跳响应
                    break;
            }
        } catch (error) {
            console.error('WebSocket消息解析错误:', error);
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket连接已关闭');
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket连接错误:', error);
    };
    
    // 发送心跳，保持连接
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000); // 每30秒发送一次心跳
}

// 更新在线用户列表
function updateOnlineUsersList() {
    userList.innerHTML = '';
    onlineUsers.forEach(user => {
        if (user !== currentUser) {
            const li = document.createElement('li');
            li.textContent = user;
            li.addEventListener('click', () => startPrivateChat(user));
            userList.appendChild(li);
        }
    });
}

// 更新私聊列表
function updatePrivateChatsList() {
    privateChatsList.innerHTML = '';
    privateChats.forEach((messages, user) => {
        const li = document.createElement('li');
        li.textContent = user;
        li.addEventListener('click', () => openPrivateChat(user));
        privateChatsList.appendChild(li);
    });
}

// 开始私聊
function startPrivateChat(user) {
    currentChatType = 'private';
    currentPrivateUser = user;
    
    // 显示返回按钮
    backToRoomBtn.style.display = 'inline-block';
    // 更新聊天标题
    chatTitle.innerHTML = `私聊: ${user}`;
    // 清空消息列表
    chatMessages.innerHTML = '';
    // 显示历史消息
    if (privateChats.has(user)) {
        privateChats.get(user).forEach(msg => {
            addMessage(msg.user, msg.message, msg.user === currentUser);
        });
    }
    // 添加系统消息
    addMessage('系统', `开始与 ${user} 的私聊`, false);
}

// 打开已有的私聊
function openPrivateChat(user) {
    currentChatType = 'private';
    currentPrivateUser = user;
    
    // 显示返回按钮
    backToRoomBtn.style.display = 'inline-block';
    // 更新聊天标题
    chatTitle.innerHTML = `私聊: ${user}`;
    // 清空消息列表
    chatMessages.innerHTML = '';
    // 显示历史消息
    if (privateChats.has(user)) {
        privateChats.get(user).forEach(msg => {
            addMessage(msg.user, msg.message, msg.user === currentUser);
        });
    }
}

// 返回房间聊天
backToRoomBtn.addEventListener('click', () => {
    currentChatType = 'room';
    currentPrivateUser = null;
    
    // 隐藏返回按钮
    backToRoomBtn.style.display = 'none';
    // 更新聊天标题
    chatTitle.innerHTML = `聊天房间: <span id="current-room">${currentRoom}</span>`;
    // 清空消息列表
    chatMessages.innerHTML = '';
    // 加载历史消息
    loadMessages();
});

// 加载历史消息
function loadMessages() {
    // 从服务器获取历史消息
    fetch(`http://${serverAddress}/chat/${encodeURIComponent(currentRoom)}`, {
        headers: {
            'Authorization': `Bearer ${currentToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // 清空消息列表
            chatMessages.innerHTML = '';
            // 添加历史消息
            data.data.messages.forEach(msg => {
                addMessage(msg.user, msg.message, msg.user === currentUser);
            });
            // 添加系统欢迎消息
            addMessage('系统', `欢迎来到 ${currentRoom} 聊天房间！`, false);
        } else {
            console.error('加载历史消息失败:', data.error);
            addMessage('系统', `欢迎来到 ${currentRoom} 聊天房间！`, false);
        }
    })
    .catch(error => {
        console.error('加载历史消息错误:', error);
        addMessage('系统', `欢迎来到 ${currentRoom} 聊天房间！`, false);
    });
}
