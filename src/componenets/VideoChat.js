import React, { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import ACTIONS from '../Action';

const VideoChat = ({ socketRef, roomId, isAudioEnabled, isVideoEnabled }) => {
    const [peers, setPeers] = useState([]);
    const userVideo = useRef();
    const userAudio = useRef(); // New ref for audio playback
    const peersRef = useRef([]);
    const streamRef = useRef(null);

    useEffect(() => {
        const getUserMedia = async () => {
            try {
                console.log(`[DEBUG] getUserMedia triggered - Audio: ${isAudioEnabled}, Video: ${isVideoEnabled}`);

                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                }

                if (!isAudioEnabled && !isVideoEnabled) {
                    console.warn("[DEBUG] Skipping getUserMedia as both audio and video are disabled.");
                    if (userVideo.current) userVideo.current.srcObject = null;
                    if (userAudio.current) userAudio.current.srcObject = null;
                    return;
                }

                console.log("[DEBUG] Requesting new media stream...");
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: isVideoEnabled || false,
                    audio: isAudioEnabled || false
                });

                console.log("[DEBUG] Stream received:", stream);
                streamRef.current = stream;
                if (userVideo.current) userVideo.current.srcObject = stream;
                if (userAudio.current) userAudio.current.srcObject = stream;

                peersRef.current.forEach(({ peer }) => {
                    stream.getTracks().forEach(track => {
                        const sender = peer.getSenders().find(s => s.track?.kind === track.kind);
                        if (sender) {
                            sender.replaceTrack(track);
                        } else {
                            peer.addTrack(track, stream);
                        }
                    });
                });

            } catch (error) {
                console.error('[DEBUG] Error accessing media devices:', error);
            }
        };

        getUserMedia();

        return () => {
            console.log("[DEBUG] Cleaning up media stream...");
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
                if (userVideo.current) userVideo.current.srcObject = null;
                if (userAudio.current) userAudio.current.srcObject = null;
            }
        };
    }, [isAudioEnabled, isVideoEnabled]);

    useEffect(() => {
        const init = async () => {
            try {
                console.log("[DEBUG] Initializing video chat...");
                if (!isAudioEnabled && !isVideoEnabled) return;

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: isVideoEnabled || false,
                    audio: isAudioEnabled || false
                });

                streamRef.current = stream;
                if (userVideo.current) userVideo.current.srcObject = stream;
                if (userAudio.current) userAudio.current.srcObject = stream;

                socketRef.current.emit(ACTIONS.JOIN_VIDEO, { roomId });

                socketRef.current.on(ACTIONS.ALL_USERS, users => {
                    const peers = [];
                    users.forEach(userId => {
                        const peer = createPeer(userId, socketRef.current.id, stream);
                        peersRef.current.push({ peerID: userId, peer });
                        peers.push(peer);
                    });
                    setPeers(peers);
                });

                socketRef.current.on(ACTIONS.USER_JOINED, payload => {
                    const peer = addPeer(payload.signal, payload.callerID, stream);
                    peersRef.current.push({ peerID: payload.callerID, peer });
                    setPeers(users => [...users, peer]);
                });

                socketRef.current.on(ACTIONS.RECEIVING_RETURNED_SIGNAL, payload => {
                    const item = peersRef.current.find(p => p.peerID === payload.id);
                    if (item && !item.peer.destroyed) {
                        item.peer.signal(payload.signal);
                    } else {
                        console.warn("[DEBUG] Attempted to signal a destroyed peer.");
                    }
                });

                socketRef.current.on(ACTIONS.USER_LEFT, id => {
                    const peerObj = peersRef.current.find(p => p.peerID === id);
                    if (peerObj) {
                        peerObj.peer.destroy();
                    }
                    peersRef.current = peersRef.current.filter(p => p.peerID !== id);
                    setPeers(peers => peers.filter(p => p.peerID !== id));
                });
            } catch (error) {
                console.error('[DEBUG] Error accessing media devices:', error);
            }
        };

        init();

        return () => {
            console.log("[DEBUG] Cleaning up peers and media stream...");
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            peersRef.current.forEach(({ peer }) => {
                if (!peer.destroyed) {
                    peer.destroy();
                }
            });

            peersRef.current = [];
            setPeers([]);
        };
    }, [roomId, socketRef]);

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
            <audio ref={userAudio} autoPlay playsInline />

            {peers.map((peer, index) => (
                <Video key={index} peer={peer} />
            ))}
        </div>
    );
};

const Video = ({ peer }) => {
    const ref = useRef();
    const audioRef = useRef();

    useEffect(() => {
        peer.on('stream', stream => {
            if (ref.current) ref.current.srcObject = stream;
            if (audioRef.current) {
                console.log("[DEBUG] Playing remote audio...");
                audioRef.current.srcObject = stream;
            }
        });
    }, [peer]);

    return (
        <div>
            <video ref={ref} autoPlay playsInline />
            <audio ref={audioRef} autoPlay playsInline />
        </div>
    );
};

export default VideoChat;

