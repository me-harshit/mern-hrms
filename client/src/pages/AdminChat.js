import React, { useState, useRef, useEffect } from 'react';
import api from '../utils/api'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faPaperPlane, faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css'; 
import '../styles/Chat.css'; 

const AdminChat = () => {
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hello! I am your HR AI Assistant. You can ask me about employee leaves, attendance, or purchases.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    
    // 1. Format the history
    let chatHistory = messages.map(msg => ({
      role: msg.sender === 'bot' ? 'model' : 'user', 
      parts: [{ text: msg.text }]
    }));

    // 👇 THE FIX: If the first message is from the bot, remove it from the history payload
    if (chatHistory.length > 0 && chatHistory[0].role === 'model') {
      chatHistory.shift(); 
    }

    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.post('/chat', { 
        message: userMsg,
        history: chatHistory 
      });

      setMessages(prev => [...prev, { sender: 'bot', text: response.data.reply }]);
    } catch (error) {
      console.error('Chat API Error:', error);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Sorry, I am having trouble connecting to the database right now.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-page-container fade-in">
      
      {/* 1. Standard Header */}
      <div className="page-header-row mb-20">
        <div className="flex-row gap-10">
          <FontAwesomeIcon icon={faRobot} className="text-primary" style={{ fontSize: '2.2rem' }} />
          <div>
            <h1 className="page-title header-no-margin">AI Assistant</h1>
            <p className="text-muted text-small m-0">Query employee records, track late days, and monitor purchases.</p>
          </div>
        </div>
      </div>

      {/* 2. Chat Box Container */}
      <div className="control-card chat-box-card">
        
        {/* Messages Area */}
        <div className="chat-messages-area">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.sender}`}>
              <div className={`message-bubble ${msg.sender}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-wrapper bot">
              <div className="message-bubble bot typing-indicator">
                <FontAwesomeIcon icon={faCircleNotch} spin className="mr-5" /> Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSend} className="chat-input-area">
          <input
            type="text"
            className="swal2-input chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about leaves, attendance, or purchases..."
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="gts-btn primary chat-send-btn"
          >
            <FontAwesomeIcon icon={faPaperPlane} />
            <span className="hide-on-mobile">Send</span>
          </button>
        </form>
      </div>
      
    </div>
  );
};

export default AdminChat;