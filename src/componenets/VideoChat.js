import React, { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import ACTIONS from '../Action';

const VideoChat = ({ socketRef, roomId, isAudioEnabled, isVideoEnabled }) => {
    const [peers, setPeers] = useState([]);
    const userVideo = useRef();
    const peersRef = useRef([]);
    const streamRef = useRef(null);

    useEffect(() => {
        const getUserMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: isVideoEnabled, audio: isAudioEnabled });
                streamRef.current = stream;
                userVideo.current.srcObject = stream;

                socketRef.current.emit(ACTIONS.JOIN_VIDEO, { roomId });

                socketRef.current.on(ACTIONS.ALL_USERS, users => {
                    const peers = [];
                    users.forEach(userId => {
                        const peer = createPeer(userId, socketRef.current.id, stream);
                        peersRef.current.push({
                            peerID: userId,
                            peer,
                        });
                        peers.push(peer);
                    });
                    setPeers(peers);
                });

                socketRef.current.on(ACTIONS.USER_JOINED, payload => {
                    const peer = addPeer(payload.signal, payload.callerID, stream);
                    peersRef.current.push({
                        peerID: payload.callerID,
                        peer,
                    });

                    setPeers(users => [...users, peer]);
                });

                socketRef.current.on(ACTIONS.RECEIVING_RETURNED_SIGNAL, payload => {
                    const item = peersRef.current.find(p => p.peerID === payload.id);
                    if (item) {
                        item.peer.signal(payload.signal);
                    }
                });

                socketRef.current.on(ACTIONS.USER_LEFT, id => {
                    const peerObj = peersRef.current.find(p => p.peerID === id);
                    if (peerObj) {
                        peerObj.peer.destroy();
                    }
                    const peers = peersRef.current.filter(p => p.peerID !== id);
                    peersRef.current = peers;
                    setPeers(peers);
                });
            } catch (error) {
                console.error('Error accessing media devices:', error);
            }
        };

        if (isAudioEnabled || isVideoEnabled) {
            getUserMedia();
        } else {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
                userVideo.current.srcObject = null;
            }
        }

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [roomId, socketRef, isAudioEnabled, isVideoEnabled]);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new SimplePeer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socketRef.current.emit(ACTIONS.SENDING_SIGNAL, { userToSignal, callerID, signal });
        });

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new SimplePeer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socketRef.current.emit(ACTIONS.RETURNING_SIGNAL, { signal, callerID });
        });

        peer.signal(incomingSignal);

        return peer;
    }

    return (
        <div>
            <video muted ref={userVideo} autoPlay playsInline />
            {peers.map((peer, index) => {
                return <Video key={index} peer={peer} />;
            })}
        </div>
    );
};

const Video = ({ peer }) => {
    const ref = useRef();

    useEffect(() => {
        peer.on('stream', stream => {
            ref.current.srcObject = stream;
        });
    }, [peer]);

    return <video ref={ref} autoPlay playsInline />;
};

export default VideoChat;