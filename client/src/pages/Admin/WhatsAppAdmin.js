import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCommentDots } from '@fortawesome/free-solid-svg-icons';
import WhatsAppControl from '../../components/WhatsAppControl';
import '../../styles/App.css';
import '../../styles/whatsapp.css';

/**
 * Its own page rather than a card inside System Configuration.
 *
 * Everything else on that page is a stored preference — shift times, leave
 * thresholds — set once and rarely revisited. This is the opposite: a live
 * service that can be broken right now and needs acting on. Burying a red
 * light three cards down a settings page is how a 20-hour outage goes
 * unnoticed.
 */
const WhatsAppAdmin = () => (
    <div className="attendance-container fade-in" style={{ paddingBottom: '40px' }}>
        <h1 className="page-title">
            <FontAwesomeIcon icon={faCommentDots} style={{ marginRight: '10px', color: '#25D366' }} />
            WhatsApp
        </h1>
        <p className="text-muted" style={{ marginTop: '-6px', marginBottom: '20px' }}>
            Connection status, linking, and a live test for outbound WhatsApp notifications.
        </p>

        <WhatsAppControl />
    </div>
);

export default WhatsAppAdmin;
