# GoQuant WebSocket Proxy Server

A WebSocket proxy server that enables CORS-free connections to cryptocurrency exchanges for the GoQuant Orderbook Simulator.

## Supported Exchanges

- **OKX** - Global crypto exchange
- **Bybit** - Professional derivatives platform  
- **Deribit** - Options and futures exchange

## Quick Start

```bash
npm install
npm start
```

Server will run on port 8080 by default.

## Endpoints

- `ws://localhost:8080/okx` - OKX WebSocket proxy
- `ws://localhost:8080/bybit` - Bybit WebSocket proxy
- `ws://localhost:8080/deribit` - Deribit WebSocket proxy

## Deployment

This server is designed to be deployed on platforms like:
- Render (recommended)
- Railway
- Heroku
- Any Node.js hosting service

## Environment

- Node.js 18+
- WebSocket support required

## Features

- Real-time data proxying
- Automatic reconnection handling
- Connection health monitoring
- Clean, human-readable logging
