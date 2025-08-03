const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
  // Health check endpoint for Render
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      uptime: process.uptime(),
      activeConnections: activeConnections.size,
      timestamp: new Date().toISOString()
    }));
    return;
  }
  
  // CORS headers for production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('GoQuant WebSocket Proxy Server - Use WebSocket connections on /okx, /bybit, or /deribit');
});

const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    // Basic verification - you can add more security here
    const origin = info.origin;
    const pathname = info.req.url;
    
    // Allow all origins in development, restrict in production if needed
    if (process.env.NODE_ENV === 'production') {
      console.log(`WebSocket connection attempt from origin: ${origin}, path: ${pathname}`);
    }
    
    return true; // Allow all connections for now
  }
});

const EXCHANGE_URLS = {
  okx: 'wss://ws.okx.com:8443/ws/v5/public',
  bybit: 'wss://stream.bybit.com/v5/public/linear',
  deribit: 'wss://www.deribit.com/ws/api/v2'
};

// Default subscriptions for each exchange
const DEFAULT_SUBSCRIPTIONS = {
  okx: {
    op: 'subscribe',
    args: [{
      channel: 'books',
      instId: 'BTC-USDT'
    }]
  },
  bybit: {
    op: 'subscribe',
    args: ['orderbook.1.BTCUSDT']
  },
  deribit: {
    jsonrpc: '2.0',
    id: 1,
    method: 'public/subscribe',
    params: {
      channels: ['book.BTC-PERPETUAL.100ms']
    }
  }
};

const activeConnections = new Map();

console.log('Proxy server starting...');

wss.on('connection', (clientWS, request) => {
  const pathname = url.parse(request.url).pathname;
  const exchange = pathname.substring(1);
  const clientIP = request.headers['x-forwarded-for'] || request.connection.remoteAddress;

  console.log(`Client connected: ${exchange} from ${clientIP}`);

  if (!EXCHANGE_URLS[exchange]) {
    console.error(`Unsupported exchange: ${exchange} from ${clientIP}`);
    clientWS.close(1000, 'Unsupported exchange');
    return;
  }

  const connectionId = `${exchange}_${Date.now()}_${Math.random()}`;

  const exchangeWS = new WebSocket(EXCHANGE_URLS[exchange]);
  let pingInterval = null;
  let subscribed = false;

  activeConnections.set(connectionId, {
    clientWS,
    exchangeWS,
    exchange,
    subscribed: false
  });

  exchangeWS.on('open', () => {
    console.log(`Connected to ${exchange}`);

    // Set up ping for OKX
    if (exchange === 'okx') {
      pingInterval = setInterval(() => {
        if (exchangeWS.readyState === WebSocket.OPEN) {
          exchangeWS.ping();
        }
      }, 25000);
    }

    // Send connection confirmation to client
    clientWS.send(JSON.stringify({ type: 'connected', exchange }));

    // Auto-subscribe to default orderbook data
    const defaultSub = DEFAULT_SUBSCRIPTIONS[exchange];
    if (defaultSub && exchangeWS.readyState === WebSocket.OPEN) {
      console.log(`Auto-subscribing to ${exchange} orderbook:`, defaultSub);
      exchangeWS.send(JSON.stringify(defaultSub));
    }
  });

  exchangeWS.on('message', (data) => {
    try {
      const message = data.toString();
      console.log(`${exchange} → client: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`);

      // Forward all messages to client
      if (clientWS.readyState === WebSocket.OPEN) {
        clientWS.send(message);
      }

      // Track if we're getting orderbook data
      if (!subscribed && exchange === 'okx') {
        try {
          const parsed = JSON.parse(message);
          if (parsed.data && parsed.data.length > 0) {
            subscribed = true;
            console.log(`${exchange} orderbook data confirmed flowing`);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      if (!subscribed && exchange === 'bybit') {
        try {
          const parsed = JSON.parse(message);
          if (parsed.data && (parsed.data.b || parsed.data.a)) {
            subscribed = true;
            console.log(`${exchange} orderbook data confirmed flowing`);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      if (!subscribed && exchange === 'deribit') {
        try {
          const parsed = JSON.parse(message);
          if (parsed.params && parsed.params.data && (parsed.params.data.bids || parsed.params.data.asks)) {
            subscribed = true;
            console.log(`${exchange} orderbook data confirmed flowing`);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    } catch (error) {
      console.warn(`Message forward failed from ${exchange}:`, error.message);
    }
  });

  exchangeWS.on('error', (error) => {
    console.error(`${exchange} WebSocket error:`, error.message);
    if (clientWS.readyState === WebSocket.OPEN) {
      clientWS.send(JSON.stringify({
        type: 'error',
        exchange,
        message: error.message
      }));
    }
  });

  exchangeWS.on('close', (code, reason) => {
    console.log(`${exchange} WebSocket closed: ${code} ${reason}`);

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    if (clientWS.readyState === WebSocket.OPEN) {
      try {
        const closeCode = (code && typeof code === 'number') ? code : 1000;
        clientWS.close(closeCode, reason);
      } catch (err) {
        console.log(`Error closing client WebSocket:`, err.message);
        clientWS.terminate();
      }
    }

    activeConnections.delete(connectionId);
  });

  exchangeWS.on('pong', () => {
    // Connection healthy
  });

  clientWS.on('message', (data) => {
    try {
      const messageStr = data.toString();
      console.log(`Client → ${exchange}: ${messageStr}`);

      if (exchangeWS.readyState === WebSocket.OPEN) {
        exchangeWS.send(data);

        try {
          const parsed = JSON.parse(messageStr);
          if (parsed.op === 'subscribe' || parsed.method === 'public/subscribe') {
            console.log(`Custom subscription sent to ${exchange}:`, parsed);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      } else {
        console.warn(`Cannot send to ${exchange} - connection not open`);
      }
    } catch (error) {
      console.warn(`Message forward failed to ${exchange}:`, error.message);
    }
  });

  clientWS.on('close', () => {
    console.log(`Client disconnected from ${exchange}`);

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    if (exchangeWS.readyState === WebSocket.OPEN) {
      exchangeWS.close();
    }

    activeConnections.delete(connectionId);
  });

  clientWS.on('error', (error) => {
    console.error(`Client WebSocket error:`, error.message);

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    if (exchangeWS.readyState === WebSocket.OPEN) {
      exchangeWS.close();
    }

    activeConnections.delete(connectionId);
  });
});

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0'; // Always bind to all interfaces for cloud deployment

server.listen(PORT, HOST, () => {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.PORT;
  const serverUrl = isProduction 
    ? `wss://${process.env.RENDER_EXTERNAL_HOSTNAME || 'goquant-proxy-server.onrender.com'}` 
    : `ws://localhost:${PORT}`;
    
  console.log(`WebSocket Proxy Server running on ${HOST}:${PORT}`);
  console.log(`Public URL: ${serverUrl}`);
  console.log(`Available endpoints:`);
  console.log(`   • ${serverUrl}/okx`);
  console.log(`   • ${serverUrl}/bybit`);
  console.log(`   • ${serverUrl}/deribit`);
  console.log(`Ready to proxy exchange connections`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Host binding: ${HOST}, Port: ${PORT}`);
});

setInterval(() => {
  const connectionCount = activeConnections.size;
  if (connectionCount > 0) {
    console.log(`Active connections: ${connectionCount}`);
  }
}, 60000);

process.on('SIGINT', () => {
  console.log('\nShutting down proxy server...');

  activeConnections.forEach((conn) => {
    if (conn.exchangeWS.readyState === WebSocket.OPEN) {
      conn.exchangeWS.close();
    }
    if (conn.clientWS.readyState === WebSocket.OPEN) {
      conn.clientWS.close();
    }
  });

  server.close(() => {
    console.log('Proxy server closed');
    process.exit(0);
  });
});
