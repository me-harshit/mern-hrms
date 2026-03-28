import React, { useState, useRef, useEffect } from 'react';
import api from '../utils/api'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faPaperPlane, faCircleNotch, faTrash, faUser } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css'; 
import '../styles/Chat.css'; 

const INITIAL_GREETING = 'Hello! I am your HR & ERP AI Assistant. You can ask me about employee leaves, attendance, inventory, or projects.';

const AdminChat = () => {
  const [messages, setMessages] = useState([
    { sender: 'bot', text: INITIAL_GREETING }
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const handleClearChat = () => {
    setMessages([{ sender: 'bot', text: INITIAL_GREETING }]);
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    
    // Format History securely for Gemini
    const formattedHistory = [];
    let lastRole = null;

    messages.forEach(msg => {
      if (msg.text === INITIAL_GREETING) return;
      
      const currentRole = msg.sender === 'bot' ? 'model' : 'user';
      
      if (currentRole === lastRole) {
        formattedHistory[formattedHistory.length - 1].parts[0].text += `\n\n${msg.text}`;
      } else {
        formattedHistory.push({ role: currentRole, parts: [{ text: msg.text }] });
        lastRole = currentRole;
      }
    });

    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.post('/chat', { 
        message: userMsg,
        history: formattedHistory 
      });

      setMessages(prev => [...prev, { sender: 'bot', text: response.data.reply }]);
    } catch (error) {
      console.error('Chat API Error:', error);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Sorry, I encountered an error connecting to the database.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-page-container fade-in">
      
      {/* Header */}
      <div className="page-header-row mb-20" style={{ justifyContent: 'space-between' }}>
        <div className="flex-row gap-10">
          <FontAwesomeIcon icon={faRobot} className="text-primary" style={{ fontSize: '2.2rem' }} />
          <div>
            <h1 className="page-title header-no-margin">AI Assistant</h1>
            <p className="text-muted text-small m-0">Query HR, Finance, and Operations Data.</p>
          </div>
        </div>
        <button 
          onClick={handleClearChat} 
          className="gts-btn secondary" 
          disabled={isLoading || messages.length <= 1}
        >
          <FontAwesomeIcon icon={faTrash} className="mr-5" /> <span className="hide-on-mobile">Clear Chat</span>
        </button>
      </div>

      {/* Chat Box Container */}
      <div className="control-card chat-box-card">
        
        {/* Messages Area */}
        <div className="chat-messages-area">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.sender}`}>
              
              {/* Avatar Icon */}
              <div className={`chat-avatar ${msg.sender}`}>
                <FontAwesomeIcon icon={msg.sender === 'user' ? faUser : faRobot} />
              </div>

              {/* Message Bubble */}
              <div className={`message-bubble ${msg.sender}`}>
                {msg.text}
              </div>

            </div>
          ))}
          
          {isLoading && (
            <div className="message-wrapper bot">
              <div className="chat-avatar bot">
                <FontAwesomeIcon icon={faRobot} />
              </div>
              <div className="message-bubble bot typing-indicator">
                <FontAwesomeIcon icon={faCircleNotch} spin className="mr-5" /> Analysing data...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSend} className="chat-input-area">
          <textarea
            className="swal2-input chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question... (Press Enter to send)"
            disabled={isLoading}
            rows={1}
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