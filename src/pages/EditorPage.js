import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Action';
import Client from '../componenets/Client';
import Editor from '../componenets/Editor';
import { initSocket } from '../socket';
import { useLocation, useNavigate, Navigate, useParams } from 'react-router-dom';

const languages = [
    { id: 63, name: "JavaScript (Node.js 12.14.0)" },
    { id: 93, name: "JavaScript (Node.js 18.15.0)" },
    { id: 97, name: "JavaScript (Node.js 20.17.0)" },
    { id: 92, name: "Python (3.11.2)" },
    { id: 100, name: "Python (3.12.5)" },
    { id: 91, name: "Java (JDK 17.0.6)" },
    { id: 105, name: "C++ (GCC 14.1.0)" },
    { id: 104, name: "C (Clang 18.1.8)" },
    { id: 60, name: "Go (1.13.5)" },
    { id: 95, name: "Go (1.18.5)" },
    { id: 94, name: "TypeScript (5.0.3)" },
    { id: 101, name: "TypeScript (5.6.2)" },
    { id: 83, name: "Swift (5.2.3)" },
    { id: 73, name: "Rust (1.40.0)" },
    { id: 82, name: "SQL (SQLite 3.27.2)" },
];

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const inputRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [output, setOutput] = useState('');
    const [language, setLanguage] = useState(languages[0].id);
    const [userInput, setUserInput] = useState('');

    useEffect(() => {
        const init = async () => {
            if (!socketRef.current) { // Only initialize if the socket is not already connected
                socketRef.current = await initSocket();

                // Register error handlers
                const handleErrors = (e) => {
                    console.log('Socket error:', e);
                    toast.error('Socket connection failed, try again later.');
                    reactNavigator('/');
                };

                socketRef.current.on('connect_error', handleErrors);
                socketRef.current.on('connect_failed', handleErrors);

                // Emit join event
                socketRef.current.emit(ACTIONS.JOIN, {
                    roomId,
                    username: location.state?.username,
                });

                // Listening for joined event
                socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                    }
                    setClients(clients);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                });

                // Listening for disconnected event
                socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) => prev.filter((client) => client.socketId !== socketId));
                });
            }
        };

        init();

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect(); // Properly close the connection on unmount
            }
        };
    }, [roomId, location.state?.username, reactNavigator]);

    const copyRoomId = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to your clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
        }
    }, [roomId]);

    const leaveRoom = useCallback(() => {
        reactNavigator('/');
    }, [reactNavigator]);

    const executeCode = useCallback(async () => {
        const code = codeRef.current;
        const input = userInput; // Use the user input from the state

        const options = {
            method: 'POST',
            headers: {
                'x-rapidapi-key': process.env.REACT_APP_RAPIDAPI_KEY, // Replace with your RapidAPI key
                'x-rapidapi-host': process.env.REACT_APP_RAPIDAPI_HOST,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                language_id: language,
                source_code: btoa(code),
                stdin: btoa(input),
                base64_encoded: 'true',
                wait: 'false',
                fields: '*'
            })
        };

        try {
            console.log('Sending code to Judge0 API:', code);
            console.log('Input:', input);
            console.log('Language ID:', language);

            const response = await fetch('https://judge0-ce.p.rapidapi.com/submissions', options);
            const data = await response.json();
            const token = data.token;
            console.log('Received token:', token);

            let result;
            while (true) {
                const resultResponse = await fetch(`https://judge0-ce.p.rapidapi.com/submissions/${token}`, {
                    headers: {
                        'x-rapidapi-key': process.env.REACT_APP_RAPIDAPI_KEY, // Replace with your RapidAPI key
                        'x-rapidapi-host': process.env.REACT_APP_RAPIDAPI_HOST
                    }
                });
                result = await resultResponse.json();

                console.log('Execution result:', result);

                if (result.status.id !== 2) { // Status 2 means "Processing"
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before polling again
            }

            let output = 'No output';
            if (result.stdout) {
                try {
                    if (typeof result.stdout !== 'string') {
                        console.error('stdout is not a string:', result.stdout);
                        output = 'stdout is not a valid string';
                    } else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(result.stdout)) {  // Basic Base64 Validation
                        console.log('stdout is not base64 encoded:', result.stdout);
                        output = result.stdout; // Use the plain text output directly
                    } else {
                        output = atob(result.stdout);
                    }
                } catch (e) {
                    console.error('Failed to decode stdout:', e);
                    output = 'Failed to decode stdout';
                }
            } else if (result.stderr) {
                try {
                    if (typeof result.stderr !== 'string') {
                        console.error('stderr is not a string:', result.stderr);
                        output = 'stderr is not a valid string';
                    } else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(result.stderr)) {  // Basic Base64 Validation
                        console.log('stderr is not base64 encoded:', result.stderr);
                        output = result.stderr; // Use the plain text output directly
                    } else {
                        output = atob(result.stderr);
                    }
                } catch (e) {
                    console.error('Failed to decode stderr:', e);
                    output = 'Failed to decode stderr';
                }
            } else if (result.compile_output) {
                try {
                    if (typeof result.compile_output !== 'string') {
                        console.error('compile_output is not a string:', result.compile_output);
                        output = 'compile_output is not a valid string';
                    } else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(result.compile_output)) {  // Basic Base64 Validation
                        console.log('compile_output is not base64 encoded:', result.compile_output);
                        output = result.compile_output; // Use the plain text output directly
                    } else {
                        output = atob(result.compile_output);
                    }
                } catch (e) {
                    console.error('Failed to decode compile output:', e);
                    output = 'Failed to decode compile output';
                }
            }

            console.log('Final output:', output);
            setOutput(output);
        } catch (error) {
            console.error('Error executing code:', error);
            setOutput(`Error: ${error.message}`);
        }
    }, [language, userInput]);

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img className="logoImage" src="/code.png" alt="logo" />
                    </div>
                    <h3>Connected</h3>
                    <div className="clientList">
                        {clients.map((client) => (
                            <Client key={client.socketId} username={client.username} />
                        ))}
                    </div>
                </div>
                <button className="btn copyBtn" onClick={copyRoomId}>Copy Room ID</button>
                <button className="btn leaveBtn" onClick={leaveRoom}>Leave the Room</button>
            </div>
            <div className="editorWrap">
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    onCodeChange={(code) => { codeRef.current = code; }}
                />
                <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="languageSelect"
                >
                    {languages.map((lang) => (
                        <option key={lang.id} value={lang.id}>{lang.name}</option>
                    ))}
                </select>
                <textarea
                    placeholder="Input data"
                    ref={inputRef}
                    className="inputData"
                    onChange={(e) => setUserInput(e.target.value)}
                ></textarea>
                <button className="btn executeBtn" onClick={executeCode}>Execute Code</button>
                <div className="output">
                    <h3>Output:</h3>
                    <pre>{output}</pre>
                </div>
            </div>
        </div>
    );
};
export default EditorPage;