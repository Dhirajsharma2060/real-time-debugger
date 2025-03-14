const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Action');

const server = http.createServer(app);
const io = new Server(server);
// Track active calls in rooms
const activeCallRooms = new Set();
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
    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        // Check if username already exists in the room
        const existingClients = getAllConnectedClients(roomId);
        const duplicateUser = existingClients.find(client => 
            userSocketMap[client.socketId] === username
        );
        
        if (duplicateUser && duplicateUser.socketId !== socket.id) {
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

        // Notify new user if there's an active call in the room
        if (activeCallRooms.has(roomId)) {
            socket.emit('call-in-progress', { roomId });
        }
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

    socket.on('webrtc-offer', ({ roomId, offer, to }) => {
        socket.to(to).emit('webrtc-offer', { offer, from: socket.id });
    });

    socket.on('webrtc-answer', ({ roomId, answer, to }) => {
        socket.to(to).emit('webrtc-answer', { answer, from: socket.id });
    });

    socket.on('webrtc-ice-candidate', ({ roomId, candidate, to }) => {
        socket.to(to).emit('webrtc-ice-candidate', { candidate, from: socket.id });
    });

    socket.on('call-initiated', ({ roomId, from, username }) => {
        console.log(`Call initiated by socket ID ${socket.id} in room ${roomId}`);
        activeCallRooms.add(roomId);
        
        // Make sure we're sending to ALL other clients in the room
        socket.to(roomId).emit('call-initiated', { 
            from: socket.id,
            username: userSocketMap[socket.id]
        });
    });

    socket.on('call-ended', ({ roomId, username }) => {
        console.log(`Call ended by socket ID ${socket.id} in room ${roomId}`);
        
        // Check if this was the last user in the call
        const roomClients = getAllConnectedClients(roomId);
        const remainingInCall = roomClients.length <= 1;
        
        if (remainingInCall) {
            activeCallRooms.delete(roomId);
        }
        
        // Forward the call-ended event to other users with username
        socket.to(roomId).emit('call-ended', { 
            from: socket.id, 
            username: username || userSocketMap[socket.id]
        });
        
        // Also emit user-left-call to ensure everyone removes this user's video
        socket.to(roomId).emit('user-left-call', { 
            socketId: socket.id, 
            username: username || userSocketMap[socket.id]
        });
    });

    socket.on('user-left-call', ({ roomId }) => {
        socket.to(roomId).emit('user-left-call', { socketId: socket.id });
    });

    socket.on('joined-call', ({ roomId }) => {
        console.log(`User ${userSocketMap[socket.id]} joined call in room ${roomId}`);
        socket.to(roomId).emit('joined-call', { 
            from: socket.id,
            username: userSocketMap[socket.id] 
        });
    });

    socket.on('get-connected-clients', ({ roomId }, callback) => {
        const clients = getAllConnectedClients(roomId);
        callback(clients);
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            if (roomId !== socket.id) { // Skip the default room named after socket.id
                console.log(`User ${userSocketMap[socket.id]} disconnecting from room ${roomId}`);
                
                // Notify others that this user left any active calls
                if (activeCallRooms.has(roomId)) {
                    socket.to(roomId).emit('user-left-call', { 
                        socketId: socket.id,
                        username: userSocketMap[socket.id]
                    });
                }
                
                // Notify others that this user left the room
                socket.to(roomId).emit(ACTIONS.DISCONNECTED, {
                    socketId: socket.id,
                    username: userSocketMap[socket.id],
                });
            }
        });
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        
        // Check if user was in any active call rooms and clean up if needed
        const socketsInCallRooms = [];
        activeCallRooms.forEach(roomId => {
            const clients = getAllConnectedClients(roomId);
            if (clients.length === 0) {
                activeCallRooms.delete(roomId);
            }
            
            // Check if any users are left in the call
            if (clients.length > 0) {
                socketsInCallRooms.push(...clients);
            }
        });
        
        delete userSocketMap[socket.id];
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
