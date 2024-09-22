// EditorPage.js
import React, { useEffect, useState, useRef } from 'react';
import Client from '../componenets/Client'; // Correct the path if needed
import Editor from '../componenets/Editor'; // Correct the path if needed
import { initSocket } from '../socket'; // Ensure this function initializes the socket
import ACTIONS from '../Action';
import { useLocation, useNavigate, Navigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

// Error handling function to be reused
const handleErrors = (e, navigate) => {
    console.log('Socket error:', e);
    toast.error('Socket connection failed, try again later.');
    navigate('/');
};

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null); // For code synchronization
    const location = useLocation(); // Get route location
    const reactNavigator = useNavigate(); // For navigation
    const { roomId } = useParams(); // Get room ID from URL params
    const [clients, setClients] = useState([]); // To store connected clients

    useEffect(() => {
        const init = async () => {
            // Initialize socket connection
            socketRef.current = await initSocket();

            // Handle connection errors
            socketRef.current.on('connect_error', (err) => handleErrors(err, reactNavigator));
            socketRef.current.on('connect_failed', (err) => handleErrors(err, reactNavigator));

            // Emit a JOIN event to the server with the room ID and username
            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            // Listen for the JOINED event from the server
            socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
                console.log('JOINED event:', { clients, username, socketId });

                // Notify when a new user joins (exclude the current user)
                if (username !== location.state?.username) {
                    toast.success(`${username} joined the room.`);
                }

                // Use a Map to ensure that clients are unique based on socketId
                const uniqueClients = Array.from(new Map(clients.map(client => [client.socketId, client])).values());
                setClients(uniqueClients);
            });

            // Listen for when a user disconnects from the room
            socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
                console.log('DISCONNECTED event:', { socketId, username });
                toast.success(`${username} left the room`);

                // Update the clients state by removing the disconnected user
                setClients((prev) => prev.filter((client) => client.socketId !== socketId));
            });
        };

        init();

        // Clean up: disconnect socket and remove event listeners on component unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current.off(ACTIONS.JOINED);
                socketRef.current.off(ACTIONS.DISCONNECTED);
            }
        };
    }, [reactNavigator, location.state?.username, roomId]);

    // Copy room ID to clipboard
    const copyRoomId = () => {
        navigator.clipboard.writeText(roomId);
        toast.success('Room ID copied to clipboard.');
    };

    // Leave the room and navigate back to the home page
    const leaveRoom = () => {
        reactNavigator('/');
        toast.success('You left the room.');
    };

    // If no username exists in location state, redirect to home
    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="mainWrap">
            <div className='aside'>
                <div className='asideInner'>
                    <div className='logo'>
                        <img className="logoImage" src="/code.png" alt="logo" />
                    </div>
                    <h3>Connected</h3>
                    <div className="clientList">
                        {/* Map through clients and display each client in the client list */}
                        {clients.map((client) => (
                            <Client key={client.socketId} username={client.username} />
                        ))}
                    </div>
                </div>
                {/* Button to copy Room ID */}
                <button className='btn copyBtn' onClick={copyRoomId}>Copy Room ID</button>
                {/* Button to leave the room */}
                <button className='btn leaveBtn' onClick={leaveRoom}>Leave the Room</button>
            </div>
            <div className="editorWrap">
                {/* Editor component for code collaboration */}
                <Editor 
                    socketRef={socketRef}
                    roomId={roomId}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                />
            </div>
        </div>
    );
};

export default EditorPage;
