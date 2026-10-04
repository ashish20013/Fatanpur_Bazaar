// Realistic API process: Nest core + express + socket.io + knex/mysql2 + helmet + zod
require('reflect-metadata');
require('@nestjs/core'); require('@nestjs/common'); require('@nestjs/platform-express');
require('@nestjs/websockets'); require('@nestjs/platform-socket.io'); require('@nestjs/jwt');
const express = require('express');
const helmet = require('helmet');
const { Server } = require('socket.io');
const knexLib = require('knex');
const z = require('zod');

const db = knexLib({ client: 'mysql2', connection: { host:'127.0.0.1', user:'fbapp', password:'benchpass', database:'fb3' }, pool:{min:2,max:8} });
const app = express(); app.use(helmet()); app.use(express.json({limit:'1mb'}));
const schema = z.object({ phone: z.string().length(10) });
app.get('/health', async (req,res) => { const r = await db.raw('SELECT 1 AS ok'); res.json({ok:true, db:r[0][0].ok, mem:process.memoryUsage().rss}); });
app.get('/products', async (req,res) => { const rows = await db('products').select('id','name','price').limit(24); res.json(rows); });
const http = app.listen(3101, () => console.log('API on 3101'));
const io = new Server(http, { path:'/socket', transports:['websocket','polling'] });
io.on('connection', s => { s.on('ping-loc', d => io.to('ops').emit('loc', d)); });
setInterval(()=>{}, 1<<30);
