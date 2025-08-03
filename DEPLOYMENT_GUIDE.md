# 🚀 GoQuant Proxy Server - Render Deployment Guide

## 🌐 Deploy to Render

### Step 1: Push to GitHub (Already Done!)
Your code is already on GitHub at: https://github.com/naman1512/goquant-proxy-server

### Step 2: Deploy on Render

1. **Go to [render.com](https://render.com) and sign in**

2. **Click "New +" → "Web Service"**

3. **Connect GitHub Repository**:
   - Select `goquant-proxy-server` repository
   - Click "Connect"

4. **Configure Service**:
   ```
   Name: goquant-proxy-server
   Environment: Node
   Region: Choose closest to your users
   Branch: main
   
   Build Command: npm install
   Start Command: npm start
   ```

5. **Environment Variables** (Optional):
   ```
   NODE_ENV=production
   ```

6. **Click "Deploy Web Service"**

### Step 3: Get Your Deployment URL

After deployment, you'll get a URL like:
```
https://goquant-proxy-server-xyz.onrender.com
```

## 🔗 Update Your Frontend

In your main project, update the WebSocket URL:

```javascript
// Replace localhost with your Render URL
const PROXY_URL = 'wss://goquant-proxy-server-xyz.onrender.com';

// Connect to exchanges via your proxy
const okxSocket = new WebSocket(`${PROXY_URL}/okx`);
const bybitSocket = new WebSocket(`${PROXY_URL}/bybit`);
const deribitSocket = new WebSocket(`${PROXY_URL}/deribit`);
```

## ✅ Production Features Added

✅ **Health Check Endpoint**: `/health` for monitoring
✅ **Environment-aware Port Binding**: Uses `process.env.PORT`
✅ **CORS Headers**: Allows frontend connections
✅ **Production Logging**: Better error tracking
✅ **Client IP Logging**: For debugging
✅ **Graceful Shutdown**: Proper cleanup on exit

## 🎯 Testing Your Deployment

Once deployed, test the health endpoint:
```
https://your-app.onrender.com/health
```

Should return:
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "activeConnections": 0,
  "timestamp": "2025-08-03T10:30:00.000Z"
}
```

## 🔧 Troubleshooting

### Common Issues:

1. **WebSocket connection fails**:
   - Ensure you're using `wss://` (not `ws://`) for production
   - Check your frontend CORS settings

2. **Build fails**:
   - Verify `package.json` has correct dependencies
   - Check Node.js version (using 18.x)

3. **Server won't start**:
   - Check Render logs for error messages
   - Verify port binding is correct

## 📊 Monitoring

- **Render Dashboard**: View logs, metrics, and deployments
- **Health Endpoint**: Monitor server status
- **Console Logs**: Active connection count every 60 seconds

Your proxy server is production-ready! 🚀
