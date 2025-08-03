const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('WebSocket Proxy Server - Use WebSocket connections');
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false 
});

// Exchange configurations
const exchanges = {
  okx: {
    url: 'wss://ws.okx.com:8443/ws/v5/public',
    pingInterval: 25000,
    subscribeMessage: {
      op: 'subscribe',
      args: [{ channel: 'books', instId: 'BTC-USDT' }]
    }
  },
  bybit: {
    url: 'wss://stream.bybit.com/v5/public/spot',
    pingInterval: null,
    subscribeMessage: {
      op: 'subscribe',
      args: ['orderbook.1.BTCUSDT']
    }
  },
  deribit: {
    url: 'wss://www.deribit.com/ws/api/v2',
    pingInterval: null,
    subscribeMessage: {
      method: 'public/subscribe',
      params: { channels: ['book.BTC-PERPETUAL.100ms'] },
      jsonrpc: '2.0',
      id: 1
    }
  }
};

// Track active connections
const activeConnections = new Map();

console.log('Proxy server starting...');

wss.on('connection', (clientWs, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const exchange = url.pathname.slice(1);
  
  console.log(`Client connected to ${exchange} endpoint`);
  
  if (!exchanges[exchange]) {
    console.log(`Unknown exchange: ${exchange}`);
    clientWs.close(4000, 'Unknown exchange');
    return;
  }
  
  const exchangeConfig = exchanges[exchange];
  const exchangeWs = new WebSocket(exchangeConfig.url);
  const connectionId = `${exchange}-${Date.now()}`;
  
  activeConnections.set(connectionId, {
    client: clientWs,
    exchange: exchangeWs,
    exchange: exchange,
    connected: false
  });
  
  // Handle exchange connection
  exchangeWs.on('open', () => {
    console.log(`Connected to ${exchange} exchange`);
    activeConnections.get(connectionId).connected = true;
    
    // Send subscription message
    exchangeWs.send(JSON.stringify(exchangeConfig.subscribeMessage));
    
    // Setup ping for OKX
    if (exchange === 'okx' && exchangeConfig.pingInterval) {
      const pingTimer = setInterval(() => {
        if (exchangeWs.readyState === WebSocket.OPEN) {
          exchangeWs.ping();
        }
      }, exchangeConfig.pingInterval);
      
      activeConnections.get(connectionId).pingTimer = pingTimer;
    }
  });
  
  // Forward exchange messages to client
  exchangeWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });
  
  // Handle exchange errors
  exchangeWs.on('error', (error) => {
    console.log(`${exchange} connection error:`, error.message);
  });
  
  // Handle exchange close
  exchangeWs.on('close', (code, reason) => {
    console.log(`${exchange} connection closed:`, code, reason?.toString());
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(4001, `${exchange} connection lost`);
    }
  });
  
  // Handle client messages (forward to exchange)
  clientWs.on('message', (data) => {
    if (exchangeWs.readyState === WebSocket.OPEN) {
      exchangeWs.send(data);
    }
  });
  
  // Handle client disconnect
  clientWs.on('close', () => {
    console.log(`Client disconnected from ${exchange}`);
    const connection = activeConnections.get(connectionId);
    if (connection) {
      if (connection.pingTimer) {
        clearInterval(connection.pingTimer);
      }
      if (exchangeWs.readyState === WebSocket.OPEN) {
        exchangeWs.close();
      }
      activeConnections.delete(connectionId);
    }
  });
  
  // Handle client errors
  clientWs.on('error', (error) => {
    console.log(`Client connection error:`, error.message);
  });
});

// Start server on all interfaces (0.0.0.0)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket Proxy Server running on ws://0.0.0.0:${PORT}`);
  console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
  console.log('Available endpoints:');
  console.log(`   • ws://0.0.0.0:${PORT}/okx`);
  console.log(`   • ws://0.0.0.0:${PORT}/bybit`);
  console.log(`   • ws://0.0.0.0:${PORT}/deribit`);
  console.log('Ready to proxy exchange connections');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  activeConnections.forEach((connection, id) => {
    if (connection.pingTimer) {
      clearInterval(connection.pingTimer);
    }
    connection.client.close();
    connection.exchange.close();
  });
  server.close(() => {
    process.exit(0);
  });
});
