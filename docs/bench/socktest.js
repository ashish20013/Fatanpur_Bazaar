const { io } = require('/root/fb2/bench/api/node_modules/socket.io-client');
const N = parseInt(process.argv[2] || '100', 10);
let connected = 0;
const clients = [];
for (let i = 0; i < N; i++) {
  const s = io('http://127.0.0.1:3101', { path: '/socket', transports: ['websocket'] });
  s.on('connect', () => { connected++; });
  clients.push(s);
}
setTimeout(() => {
  console.log(`connected=${connected}/${N}`);
  // simulate 2 riders pinging every 15s -> here fire 200 location events
  let sent = 0;
  for (let k = 0; k < 200; k++) { clients[k % N].emit('ping-loc', { lat: 25.74 + k*1e-5, lng: 81.95, t: Date.now() }); sent++; }
  setTimeout(() => { console.log(`events_sent=${sent}`); process.exit(0); }, 2000);
}, 4000);
