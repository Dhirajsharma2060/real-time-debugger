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
        // Check if username already exists in the room
        const existingClients = getAllConnectedClients(roomId);
        const duplicateUser = existingClients.find(client => 
            userSocketMap[client.socketId] === username
        );
        
        if (duplicateUser) {
            console.log(`Duplicate connection for user ${username}. Updating socket ID from ${duplicateUser.socketId} to ${socket.id}`);
            
            // Remove old socket from room
            io.sockets.sockets.get(duplicateUser.socketId)?.leave(roomId);
            delete userSocketMap[duplicateUser.socketId];
        }
        
        userSocketMap[socket.id] = username;
        console.log(`User ${username} connected with socket ID ${socket.id}`);
        socket.join(roomId);
        
        const clients = getAllConnectedClients(roomId);
        console.log(`Current clients in room ${roomId}:`, clients);
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
        console.log(`Broadcasting output to room ${roomId}: ${output}`);
        io.in(roomId).emit('output', { output });
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
        console.log(`User ${userSocketMap[socket.id]} disconnected with socket ID ${socket.id}`);
        delete userSocketMap[socket.id];
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
