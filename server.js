const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Action');

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('build'));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const userSocketMap = {};
function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on('output', ({ roomId, output }) => {
        io.in(roomId).emit('output', { output });
    });

    socket.on(ACTIONS.JOIN_VIDEO, ({ roomId }) => {
        const usersInThisRoom = io.sockets.adapter.rooms.get(roomId) || new Set();
        const users = Array.from(usersInThisRoom);
        socket.emit(ACTIONS.ALL_USERS, users);
    });

    socket.on(ACTIONS.SENDING_SIGNAL, payload => {
        io.to(payload.userToSignal).emit(ACTIONS.USER_JOINED, { signal: payload.signal, callerID: payload.callerID });
    });

    socket.on(ACTIONS.RETURNING_SIGNAL, payload => {
        io.to(payload.callerID).emit(ACTIONS.RECEIVING_RETURNED_SIGNAL, { signal: payload.signal, id: socket.id });
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.leave(roomId);
            const clients = getAllConnectedClients(roomId);
            clients.forEach(({ socketId }) => {
                io.to(socketId).emit(ACTIONS.DISCONNECTED, {
                    socketId: socket.id,
                    username: userSocketMap[socket.id],
                });
            });
        });
        delete userSocketMap[socket.id];
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit(ACTIONS.USER_LEFT, socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));