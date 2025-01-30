import React from 'react';
import './ResizablePane.css';

const ResizablePane = ({ output }) => {
    return (
        <div className="resizable-pane">
            <div className="pane output-pane">
                <textarea
                    value={output}
                    readOnly
                    className="outputTextArea"
                    placeholder='Output will be displayed here'
                />
            </div>
        </div>
    );
};

export default ResizablePane;