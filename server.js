const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function createRoom(code) {
    rooms[code] = { players: {}, started: false, murderer: null, sheriff: null };
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('joinRoom', (data) => {
        const { roomCode, playerName } = data;
        if (!rooms[roomCode]) createRoom(roomCode);
        currentRoom = roomCode;
        socket.join(roomCode);
        rooms[roomCode].players[socket.id] = {
            id: socket.id, name: playerName || 'لاعب',
            position: { x: Math.random()*40-20, y: 5, z: Math.random()*40-20 },
            rotation: 0, role: 'innocent', alive: true
        };
        socket.emit('joinedRoom', { roomCode, players: rooms[roomCode].players, started: rooms[roomCode].started });
        socket.to(roomCode).emit('playerJoined', rooms[roomCode].players[socket.id]);
    });

    socket.on('playerMovement', (data) => {
        if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[socket.id]) {
            rooms[currentRoom].players[socket.id].position = data.position;
            rooms[currentRoom].players[socket.id].rotation = data.rotation;
            socket.to(currentRoom).emit('playerMoved', { id: socket.id, data });
        }
    });

    socket.on('startGame', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        const ids = Object.keys(room.players).filter(id => room.players[id].alive);
        if (ids.length >= 3) {
            const s = ids.sort(() => 0.5 - Math.random());
            room.murderer = s[0]; room.sheriff = s[1]; room.started = true;
            ids.forEach(id => {
                if (id === s[0]) { room.players[id].role = 'murderer'; io.to(id).emit('roleAssigned', 'murderer'); }
                else if (id === s[1]) { room.players[id].role = 'sheriff'; io.to(id).emit('roleAssigned', 'sheriff'); }
                else { room.players[id].role = 'innocent'; io.to(id).emit('roleAssigned', 'innocent'); }
            });
            io.to(currentRoom).emit('gameStarted');
        } else {
            io.to(socket.id).emit('needMorePlayers', ids.length);
        }
    });

    socket.on('kill', (targetId) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        if (socket.id === room.murderer && room.players[targetId] && room.players[targetId].alive) {
            room.players[targetId].alive = false;
            io.to(currentRoom).emit('playerKilled', targetId);
            const alive = Object.values(room.players).filter(p => p.alive && p.role !== 'murderer');
            if (alive.length === 0) io.to(currentRoom).emit('gameOver', 'murderer');
        }
    });

    socket.on('shoot', (targetId) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        if (socket.id === room.sheriff && room.players[targetId] && room.players[targetId].alive) {
            if (targetId === room.murderer) {
                room.players[targetId].alive = false;
                io.to(currentRoom).emit('playerKilled', targetId);
                io.to(currentRoom).emit('gameOver', 'sheriff');
            } else {
                room.players[targetId].alive = false;
                io.to(currentRoom).emit('playerKilled', targetId);
                io.to(currentRoom).emit('gameOver', 'sheriff_dead');
            }
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            delete rooms[currentRoom].players[socket.id];
            io.to(currentRoom).emit('playerDisconnected', socket.id);
            if (Object.keys(rooms[currentRoom].players).length === 0) delete rooms[currentRoom];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server running on port ' + PORT));
