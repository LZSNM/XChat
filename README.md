# XChat - 实时聊天系统

XChat是一个基于Node.js和WebSocket的实时聊天系统，支持房间聊天、私聊和文件传输功能。

## 功能特点

- **实时聊天**：使用WebSocket实现实时消息传递
- **房间聊天**：支持多个独立的聊天房间
- **私聊功能**：支持用户之间的一对一聊天
- **文件传输**：支持上传和下载文件
- **用户管理**：注册、登录系统
- **Token认证**：基于Token的用户认证
- **局域网自动发现**：自动扫描局域网内的服务器
- **响应式设计**：适配不同屏幕尺寸
- **现代化界面**：美观的用户界面，带有动画效果

## 技术栈

- **后端**：Node.js, Express, WebSocket
- **前端**：HTML, CSS, JavaScript
- **存储**：内存存储（可扩展为数据库存储）

## 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/LZSNM/XChat.git
cd XChat
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动服务器

```bash
# 启动主服务器
npm start

# 启动管理端（可选）
npm run admin
```

## 使用方法

### 1. 访问聊天系统

在浏览器中打开 `http://localhost:3000`

### 2. 注册/登录

- 点击"注册"选项卡创建新用户
- 或点击"登录"选项卡使用现有用户登录
- 输入聊天房间名称
- 点击"自动发现"按钮可自动扫描局域网内的服务器

### 3. 开始聊天

- 在输入框中输入消息并按Enter键发送
- 点击文件按钮（📎）上传文件
- 点击左侧用户列表中的用户开始私聊

### 4. 管理端

- 访问 `http://localhost:3001` 管理Token和聊天房间
- 需要在请求头中添加 `X-Admin-Key: admin123` 进行认证

## API端点

### 主服务器

- **POST /register**：注册新用户
- **POST /login**：用户登录
- **POST /relay**：消息中转（WebSocket）
- **GET /chat/:room**：获取房间历史消息

### 管理端

- **GET /tokens**：查看所有Token
- **POST /tokens**：添加新Token
- **DELETE /tokens/:token**：删除Token
- **GET /chat/rooms**：查看所有聊天房间
- **GET /chat/rooms/:room**：查看房间消息
- **DELETE /chat/rooms/:room/messages**：清空房间消息
- **DELETE /chat/rooms/:room**：删除房间

## 移动设备支持

### Windows

```bash
# 运行启动脚本
start-mobile.bat
```

### Linux/macOS

```bash
# 运行启动脚本
bash start-mobile.sh
```

## 配置

- **端口**：主服务器运行在端口3000，管理端运行在端口3001
- **Token**：默认Token为 `token123`, `token456`, `token789`
- **管理密钥**：默认管理密钥为 `admin123`

## 安全注意事项

- 本项目使用内存存储，重启服务器后数据会丢失
- 实际部署时应修改默认的管理密钥
- 生产环境中应使用HTTPS协议
- 文件传输使用Base64编码，建议限制文件大小

## 扩展建议

- 使用数据库存储用户信息和消息
- 添加用户头像和个人资料
- 实现消息加密
- 添加群聊功能
- 实现消息撤回和编辑功能

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！
