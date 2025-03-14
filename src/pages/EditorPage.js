import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Action';
import Client from '../componenets/Client';
import Editor from '../componenets/Editor';
import { initSocket } from '../socket';
import { useLocation, useNavigate, Navigate, useParams } from 'react-router-dom';
import ResizablePane from '../componenets/ResizablePane';

const languages = [
    { id: 63, name: "JavaScript (Node.js 12.14.0)", mode: 'javascript' },
    { id: 93, name: "JavaScript (Node.js 18.15.0)", mode: 'javascript' },
    { id: 97, name: "JavaScript (Node.js 20.17.0)", mode: 'javascript' },
    { id: 92, name: "Python (3.11.2)", mode: 'python' },
    { id: 100, name: "Python (3.12.5)", mode: 'python' },
    { id: 91, name: "Java (JDK 17.0.6)", mode: 'java' },
    { id: 105, name: "C++ (GCC 14.1.0)", mode: 'cpp' },
    { id: 104, name: "C (Clang 18.1.8)", mode: 'c' },
    { id: 60, name: "Go (1.13.5)", mode: 'go' },
    { id: 95, name: "Go (1.18.5)", mode: 'go' },
    { id: 94, name: "TypeScript (5.0.3)", mode: 'javascript' },
    { id: 101, name: "TypeScript (5.6.2)", mode: 'javascript' },
    { id: 83, name: "Swift (5.2.3)", mode: 'swift' },
    { id: 73, name: "Rust (1.40.0)", mode: 'rust' },
    { id: 82, name: "SQL (SQLite 3.27.2)", mode: 'sql' },
];

const EditorPage = () => {
    const socketRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [language, setLanguage] = useState(languages[0].id);
    const [output, setOutput] = useState('');
    const codeRef = useRef(null); // Define codeRef
    const inputRef = useRef(null); // Define inputRef
    const [userInput, setUserInput] = useState(''); // Define userInput and setUserInput

    useEffect(() => {
        const init = async () => {
            if (!socketRef.current) {
                socketRef.current = await initSocket();
                console.log('Socket initialized:', socketRef.current.id);

                socketRef.current.on('connect_error', (err) => handleErrors(err));
                socketRef.current.on('connect_failed', (err) => handleErrors(err));

                function handleErrors(e) {
                    console.log('socket error', e);
                    toast.error('Socket connection failed, try again later.');
                    reactNavigator('/');
                }

                socketRef.current.emit(ACTIONS.JOIN, {
                    roomId,
                    username: location.state?.username,
                });

                socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
                    console.log(`User ${username} joined with socket ID ${socketId}`);
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                    }
                    setClients(clients);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                });

                socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
                    console.log(`User ${username} disconnected with socket ID ${socketId}`);
                    toast.success(`${username} left the room.`);
                    setClients((prev) => prev.filter((client) => client.socketId !== socketId));
                });

                // Listen for output event
                socketRef.current.on('output', ({ output }) => {
                    console.log(`Received output: ${output}`);
                    setOutput(output);
                });
            }
        };

        init();

        return () => {
            if (socketRef.current) {
                console.log('Socket disconnecting:', socketRef.current.id);
                socketRef.current.disconnect();
                socketRef.current = null; // Ensure the socket is cleaned up
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

            handleCodeExecution(token);
        } catch (error) {
            console.error('Error executing code:', error);
            setOutput(`Error: ${error.message}`);
        }
    }, [language, userInput]);

    const handleCodeExecution = async (token) => {
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
        }

        setOutput(output);
        socketRef.current.emit('output', { roomId, output });
    };

    if (!location.state) {
        return <Navigate to="/" />;
    }

    const selectedLanguage = languages.find(lang => lang.id === language) || languages[0];

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
                    languageMode={selectedLanguage.mode}
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
                <ResizablePane output={output} />
            </div>
        </div>
    );
};

export default EditorPage;