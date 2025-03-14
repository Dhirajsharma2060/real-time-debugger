import React, { useRef, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

const VideoCall = ({ socketRef, roomId, clients }) => {
    const localVideoRef = useRef(null);
    const [remoteVideos, setRemoteVideos] = useState([]);
    const [isCallActive, setIsCallActive] = useState(false);
    const peerConnectionsRef = useRef({});
    const remoteStreamsRef = useRef({}); // Add a ref to track remote streams
    
    // Function to show notification before starting call
    const showCallNotification = (message, action) => {
        return toast((t) => (
            <span className="call-notification">
                <b>Video Call</b> {message} 
                {action && (
                    <button onClick={() => action(t)}>
                        Join Call
                    </button>
                )}
            </span>
        ), { 
            duration: 10000,
            position: "top-center", // More prominent position
            style: {
                border: '1px solid #4aed88',
                padding: '16px',
                color: '#000'
            }
        });
    };

    const startCall = async () => {
        try {
            // First show notification to all users in the room
            if (socketRef.current) {
                const currentUser = clients.find(client => 
                    client.socketId === socketRef.current.id
                );
                const username = currentUser ? currentUser.username : 'Someone';
                
                socketRef.current.emit('call-initiated', { 
                    roomId, 
                    from: socketRef.current.id,
                    username: username
                });
                
                // Show a pending notification to the caller
                showCallNotification('is being started. Waiting for camera access...');
            }
            
            // Wait for camera access
            const localStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            
            // Now that we have camera access, activate the call UI
            setIsCallActive(true);
            
            // Add a small delay to ensure DOM elements are created
            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
                
                // Get all connected clients and create peer connections
                socketRef.current?.emit('get-connected-clients', { roomId }, (clients) => {
                    if (clients) {
                        console.log("Creating connections with clients:", clients);
                        clients.forEach(client => {
                            if (client.socketId !== socketRef.current?.id) {
                                createPeerConnection(client.socketId, localStream, true);
                            }
                        });
                    }
                });
                
                toast.success('Call started successfully');
            } else {
                console.error('localVideoRef.current is still null after delay');
                toast.error('Could not initialize video call');
                setIsCallActive(false);
            }
        } catch (error) {
            console.error('Error starting call:', error);
            toast.error('Could not access camera or microphone');
            setIsCallActive(false);
        }
    };

    const createPeerConnection = async (socketId, localStream, isInitiator = false) => {
        console.log(`Creating peer connection with ${socketId}, initiator: ${isInitiator}`);
        
        // Don't create duplicate connections
        if (peerConnectionsRef.current[socketId]) {
            console.log(`Connection with ${socketId} already exists, not creating a new one`);
            return peerConnectionsRef.current[socketId];
        }
        
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                {
                    urls: 'turn:turn.relay.metered.ca:80',
                    username: 'b924119c906dda61136969e9',
                    credential: 'n3nQPfszAHXs6fXC'
                },
                {
                    urls: 'turn:turn.relay.metered.ca:443',
                    username: 'b924119c906dda61136969e9',
                    credential: 'n3nQPfszAHXs6fXC'
                },
                {
                    urls: 'turn:turn.relay.metered.ca:443?transport=tcp',
                    username: 'b924119c906dda61136969e9',
                    credential: 'n3nQPfszAHXs6fXC'
                }
            ]
        });

        // Add local stream tracks to peer connection
        localStream.getTracks().forEach(track => {
            console.log(`Adding local track to peer connection with ${socketId}:`, track.kind);
            peerConnection.addTrack(track, localStream);
        });

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                console.log(`Sending ICE candidate to ${socketId}`);
                socketRef.current.emit('webrtc-ice-candidate', { 
                    roomId, 
                    candidate: event.candidate, 
                    to: socketId 
                });
            }
        };

        // More verbose debugging for connection state
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state with ${socketId}: ${peerConnection.connectionState}`);
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state with ${socketId}: ${peerConnection.iceConnectionState}`);
            
            if (peerConnection.iceConnectionState === 'failed' || 
                peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'closed') {
                console.warn(`ICE connection with ${socketId} failed/closed`);
            }
        };

        // Handle incoming tracks (remote video streams)
        peerConnection.ontrack = (event) => {
            console.log(`Received tracks from ${socketId}, kind:`, event.track.kind);
            
            const remoteStream = event.streams[0];
            if (!remoteStream) {
                console.error("No stream in track event");
                return;
            }
            
            console.log(`Got remote stream for ${socketId}:`, remoteStream.id);
            remoteStreamsRef.current[socketId] = remoteStream;
            
            // Update the UI with the new stream - Use setTimeout to ensure state updates properly
            setTimeout(() => {
                setRemoteVideos(prevVideos => {
                    // Check if we already have this stream
                    const existingVideo = prevVideos.find(v => v.socketId === socketId);
                    if (existingVideo) {
                        console.log(`Updating existing video for ${socketId}`);
                        return prevVideos.map(v => 
                            v.socketId === socketId ? { ...v, stream: remoteStream } : v
                        );
                    }
                    
                    // Get user info
                    const remoteUser = clients.find(client => client.socketId === socketId);
                    const username = remoteUser ? remoteUser.username : 'Unknown user';
                    
                    console.log(`Adding new video for ${socketId} (${username})`);
                    return [...prevVideos, { 
                        socketId, 
                        stream: remoteStream,
                        username 
                    }];
                });
            }, 100);
        };

        // Store the peer connection
        peerConnectionsRef.current[socketId] = peerConnection;

        // If this peer is the initiator, create and send an offer
        if (isInitiator && socketRef.current) {
            try {
                console.log(`Creating offer for ${socketId}`);
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offer);
                console.log(`Sending offer to ${socketId}`);
                socketRef.current.emit('webrtc-offer', { roomId, offer, to: socketId });
            } catch (error) {
                console.error('Error creating offer:', error);
            }
        }

        return peerConnection;
    };

    const handleOffer = async ({ offer, from }) => {
        console.log(`Received offer from ${from}`);
        
        try {
            let localStream;
            
            if (localVideoRef.current?.srcObject) {
                localStream = localVideoRef.current.srcObject;
            } else {
                console.log("Getting user media for offer");
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setIsCallActive(true);
                
                // Wait for video element to be created
                await new Promise(resolve => setTimeout(resolve, 100));
                
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = localStream;
                }
            }
            
            const peerConnection = peerConnectionsRef.current[from] || 
                await createPeerConnection(from, localStream);
            
            console.log(`Setting remote description for offer from ${from}`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            console.log(`Creating answer for ${from}`);
            const answer = await peerConnection.createAnswer();
            console.log(`Setting local description for ${from}`);
            await peerConnection.setLocalDescription(answer);
            
            if (socketRef.current) {
                console.log(`Sending answer to ${from}`);
                socketRef.current.emit('webrtc-answer', { roomId, answer, to: from });
            }
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    };

    const handleAnswer = async ({ answer, from }) => {
        console.log(`Received answer from ${from}`);
        const peerConnection = peerConnectionsRef.current[from];
        
        if (peerConnection) {
            try {
                console.log(`Setting remote description for answer from ${from}`);
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error('Error setting remote description:', error);
            }
        } else {
            console.warn(`No peer connection for ${from} when handling answer`);
        }
    };

    const handleIceCandidate = async ({ candidate, from }) => {
        console.log(`Received ICE candidate from ${from}`);
        const peerConnection = peerConnectionsRef.current[from];
        
        if (peerConnection) {
            try {
                console.log(`Adding ICE candidate from ${from}`);
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        } else {
            console.warn(`No peer connection for ${from} when handling ICE candidate`);
        }
    };

    const endCall = (emitEvent = true) => {
        // Close all peer connections
        Object.values(peerConnectionsRef.current).forEach(peerConnection => {
            peerConnection.close();
        });
        peerConnectionsRef.current = {};
        remoteStreamsRef.current = {};

        // Stop local media tracks
        if (localVideoRef.current?.srcObject) {
            localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
            localVideoRef.current.srcObject = null;
        }

        setRemoteVideos([]);
        setIsCallActive(false);
        
        // Check if socketRef.current exists and we should emit the event
        if (socketRef.current && emitEvent) {
            // Send username with the call-ended event
            const currentUser = clients.find(client => 
                client.socketId === socketRef.current?.id
            );
            const username = currentUser ? currentUser.username : 'Someone';
            
            socketRef.current.emit('call-ended', { 
                roomId, 
                username: username 
            });
            toast.success('Call ended');
        }
    };

    // Log component state for debugging
    useEffect(() => {
        console.log("Remote videos state:", remoteVideos);
    }, [remoteVideos]);

    useEffect(() => {
        if (!socketRef.current) return;

        socketRef.current.on('webrtc-offer', handleOffer);
        socketRef.current.on('webrtc-answer', handleAnswer);
        socketRef.current.on('webrtc-ice-candidate', handleIceCandidate);
        
        // Handle call-initiated with username info
        socketRef.current.on('call-initiated', async (data = {}) => {
            const from = data.from || 'unknown';
            const username = data.username || 'Someone';
            
            console.log(`Received call initiation from ${username} (${from})`);
            
            // Show notification with username
            showCallNotification(`has been initiated by ${username}.`, (t) => {
                toast.dismiss(t);
                
                // Start joining the call process - Camera access happens only after user clicks Join
                navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                    .then(localStream => {
                        setIsCallActive(true);
                        
                        // Wait for video element to be created
                        setTimeout(() => {
                            if (localVideoRef.current) {
                                localVideoRef.current.srcObject = localStream;
                                
                                // Notify others that I've joined the call
                                socketRef.current?.emit('joined-call', { roomId });
                                
                                // Then connect to all existing participants
                                socketRef.current?.emit('get-connected-clients', { roomId }, (clients) => {
                                    if (clients) {
                                        console.log("Creating connections with all clients after joining:", clients);
                                        clients.forEach(client => {
                                            if (client.socketId !== socketRef.current?.id) {
                                                createPeerConnection(client.socketId, localStream, true);
                                            }
                                        });
                                    }
                                });
                            } else {
                                console.error('localVideoRef.current is null');
                                toast.error('Could not access camera or microphone');
                            }
                        }, 100);
                    })
                    .catch(error => {
                        console.error('Error accessing media devices:', error);
                        toast.error('Could not access camera or microphone');
                    });
            });
        });

        socketRef.current.on('call-ended', ({ from, username } = {}) => {
            console.log(`Call ended by ${username || 'unknown user'} (${from || 'unknown'})`);
            
            // Show notification that call was ended
            if (username) {
                toast(`${username} ended the call`, {
                    style: {
                        border: '1px solid #3498db',
                        padding: '16px',
                        color: '#3498db',
                    },
                    icon: 'ℹ️',
                });
            } else {
                toast('The call has ended', {
                    style: {
                        border: '1px solid #3498db',
                        padding: '16px',
                        color: '#3498db',
                    },
                    icon: 'ℹ️',
                });
            }
            
            if (isCallActive) {
                endCall(false);
            }
        });

        socketRef.current.on('user-left-call', ({ socketId, username }) => {
            console.log(`User ${username || socketId} left the call`);
            
            // Show notification that user left
            if (username) {
                toast(`${username} left the call`, {
                    style: {
                        border: '1px solid #3498db',
                        padding: '16px',
                        color: '#3498db',
                    }
                });
            }
            
            // Remove peer connection for user who left
            if (peerConnectionsRef.current[socketId]) {
                peerConnectionsRef.current[socketId].close();
                delete peerConnectionsRef.current[socketId];
                delete remoteStreamsRef.current[socketId];
            }
            
            // Remove their video
            setRemoteVideos(prevVideos => prevVideos.filter(v => v.socketId !== socketId));
        });

        // Add a new event handler for when users join an existing call
        socketRef.current.on('joined-call', ({ from, username }) => {
            console.log(`User ${username || from} joined the call`);
            
            toast(`${username || 'A new user'} joined the call`, {
                style: {
                    border: '1px solid #4aed88',
                    padding: '16px',
                    color: '#4aed88',
                }
            });
            
            // Create a new peer connection to this user if I'm already in a call
            if (isCallActive && localVideoRef.current?.srcObject) {
                // Create a connection with this new participant (as initiator)
                createPeerConnection(from, localVideoRef.current.srcObject, true);
            }
        });

        return () => {
            // Store socketRef in a local variable to avoid null reference
            const socket = socketRef.current;
            
            if (socket) {
                // Clean up all event listeners
                socket.off('webrtc-offer', handleOffer);
                socket.off('webrtc-answer', handleAnswer);
                socket.off('webrtc-ice-candidate', handleIceCandidate);
                socket.off('call-initiated');
                socket.off('call-ended');
                socket.off('user-left-call');
                socket.off('joined-call');
            }
            
            // End the call and clean up
            endCall(false);
        };
    }, [roomId, clients]);

    // Add a new useEffect to handle call-in-progress notification
    useEffect(() => {
        if (!socketRef.current) return;

        const handleCallInProgress = () => {
            console.log('Detected call in progress when joining room');
            toast((t) => (
                <span className="call-notification">
                    <b>Video Call</b> is in progress. 
                    <button onClick={() => {
                        toast.dismiss(t);
                        
                        // Get local stream and create peer connection
                        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                            .then(localStream => {
                                setIsCallActive(true);
                                
                                // Wait for video element to be created
                                setTimeout(() => {
                                    if (localVideoRef.current) {
                                        localVideoRef.current.srcObject = localStream;
                                        
                                        // Notify others that I've joined the call
                                        socketRef.current?.emit('joined-call', { roomId });
                                        
                                        // Get all connected clients and create peer connections
                                        socketRef.current?.emit('get-connected-clients', { roomId }, (clients) => {
                                            if (clients) {
                                                console.log("Creating connections with clients after joining ongoing call:", clients);
                                                clients.forEach(client => {
                                                    if (client.socketId !== socketRef.current?.id) {
                                                        createPeerConnection(client.socketId, localStream, true);
                                                    }
                                                });
                                            }
                                        });
                                    } else {
                                        console.error('localVideoRef.current is null');
                                        toast.error('Could not access camera or microphone');
                                    }
                                }, 100);
                            })
                            .catch(error => {
                                console.error('Error accessing media devices:', error);
                                toast.error('Could not access camera or microphone');
                            });
                    }}>Join Call</button>
                </span>
            ), { duration: 10000 });
        };

        socketRef.current.on('call-in-progress', handleCallInProgress);

        return () => {
            if (socketRef.current) {
                socketRef.current.off('call-in-progress', handleCallInProgress);
            }
        };
    }, [roomId]);

    const getUsernameBySocketId = (socketId) => {
        const client = clients.find(client => client.socketId === socketId);
        return client ? client.username : 'Participant';
    };

    return (
        <div className="video-call-container">
            {!isCallActive ? (
                <button className="btn call-btn" onClick={startCall}>
                    Start Video Call
                </button>
            ) : (
                <div className="video-grid">
                    <div className="video-call-controls">
                        <button className="btn end-call-btn" onClick={() => endCall(true)}>
                            End Call
                        </button>
                    </div>
                    
                    <div className="videos-container">
                        <div className="video-item local-video">
                            <video 
                                ref={localVideoRef} 
                                autoPlay 
                                muted 
                                playsInline
                            />
                            <div className="video-label">You</div>
                        </div>
                        
                        {remoteVideos.map(({ socketId, stream, username }) => (
                            <div key={socketId} className="video-item">
                                <video
                                    autoPlay
                                    playsInline
                                    ref={element => {
                                        if (element && stream) {
                                            console.log(`Setting stream ${stream.id} for remote user ${username}`);
                                            element.srcObject = stream;
                                        }
                                    }}
                                />
                                <div className="video-label">
                                    {username || getUsernameBySocketId(socketId)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoCall;