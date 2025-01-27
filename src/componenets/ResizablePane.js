import React, { useRef, useState } from 'react';
import './ResizablePane.css';

const ResizablePane = ({ output }) => {
    const inputRef = useRef(null);
    const [userInput, setUserInput] = useState('');

    return (
        <div className="resizable-pane">
            <div className="pane bottom-pane">
                <div className="pane left-pane">
                    <textarea
                        ref={inputRef}
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
                <div className="pane right-pane">
                    <textarea
                        value={output}
                        readOnly
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
            </div>
        </div>
    );
};

export default ResizablePane;