import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faBroom, faBell, faBellSlash } from '@fortawesome/free-solid-svg-icons';

/**
 * Right-click menu on a row in the chat list.
 *
 * Rendered at the pointer rather than inside the row so it is never clipped by
 * the list's own overflow, and flipped back on-screen when the click lands near
 * an edge — a menu whose last item falls below the fold is a menu with a
 * missing option.
 */
const MENU_WIDTH = 200;
const ITEM_HEIGHT = 38;

const ChatContextMenu = ({ x, y, conversation, onClose, onCloseChat, onClearChat, onToggleMute }) => {
    const ref = useRef(null);
    const [pos, setPos] = useState({ left: x, top: y });

    useEffect(() => {
        const items = 3;
        const height = items * ITEM_HEIGHT + 12;
        setPos({
            left: Math.min(x, window.innerWidth - MENU_WIDTH - 8),
            top: Math.min(y, window.innerHeight - height - 8)
        });
    }, [x, y]);

    // Any click elsewhere, any scroll, or Escape dismisses it.
    useEffect(() => {
        const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
        const key = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        window.addEventListener('scroll', onClose, true);
        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', key);
            window.removeEventListener('scroll', onClose, true);
        };
    }, [onClose]);

    return (
        <div className="msgr-ctx" ref={ref} style={{ left: pos.left, top: pos.top }}>
            <div className="msgr-ctx-head">{conversation.title}</div>

            <button onClick={() => { onClose(); onToggleMute(conversation); }}>
                <FontAwesomeIcon icon={conversation.muted ? faBell : faBellSlash} />
                {conversation.muted ? 'Unmute' : 'Mute notifications'}
            </button>

            <button onClick={() => { onClose(); onCloseChat(conversation); }}>
                <FontAwesomeIcon icon={faXmark} />
                Close chat
            </button>

            <button className="danger" onClick={() => { onClose(); onClearChat(conversation); }}>
                <FontAwesomeIcon icon={faBroom} />
                Clear chat
            </button>
        </div>
    );
};

export default ChatContextMenu;
