import React, { useEffect, useRef } from 'react';
import Codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import ACTIONS from '../Action';

const Editor = ({ socketRef, roomId, onCodeChange }) => {
    const editorRef = useRef(null);
    const textareaRef = useRef(null); // Use a ref to manage the textarea element

    useEffect(() => {
        function init() {
            if (textareaRef.current) {
                editorRef.current = Codemirror.fromTextArea(textareaRef.current, {
                    mode: { name: 'javascript', json: true },
                    theme: 'dracula',
                    autoCloseTags: true,
                    autoCloseBrackets: true,
                    lineNumbers: true,
                });

                // Handle code changes
                editorRef.current.on('change', (instance, changes) => {
                    const { origin } = changes;
                    const code = instance.getValue();
                    if (onCodeChange) {
                        onCodeChange(code);
                    }
                    if (origin !== 'setValue') {
                        if (socketRef.current) {
                            socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                                roomId,
                                code,
                            });
                        }
                    }
                });
            }
        }

        init();

        // Cleanup CodeMirror instance when component unmounts
        return () => {
            if (editorRef.current) {
                editorRef.current.toTextArea(); // This will destroy the CodeMirror instance
                editorRef.current = null; // Clear the ref to avoid stale references
            }
        };
    }, [socketRef, roomId, onCodeChange]);

    useEffect(() => {
        const handleCodeChange = ({ code }) => {
            if (code !== null && editorRef.current) {
                editorRef.current.setValue(code);
            }
        };

        if (socketRef.current) {
            socketRef.current.on(ACTIONS.CODE_CHANGE, handleCodeChange);
        }

        // Cleanup event listener when component unmounts or socketRef changes
        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.CODE_CHANGE, handleCodeChange);
            }
        };
    }, [socketRef, roomId]);

    return <textarea ref={textareaRef} id="realtimeEditor"></textarea>;
};

export default Editor;
