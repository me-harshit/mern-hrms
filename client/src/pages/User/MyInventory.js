import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faLaptopHouse, 
    faCheckCircle, 
    faCircleNotch, 
    faBoxOpen, 
    faStickyNote 
} from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';
import '../../styles/inventory.css'; 

const MyInventory = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/inventory/my-items')
            .then(res => {
                setItems(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching my inventory", err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="page-container fade-in">
            
            {/* Standard Page Header */}
            <div className="page-header-row mb-20">
                <div className="flex-row gap-10 align-items-center">
                    <div className="inventory-header-icon-bg">
                        <FontAwesomeIcon icon={faLaptopHouse} className="text-primary" style={{ fontSize: '1.8rem' }} />
                    </div>
                    <div>
                        <h1 className="page-title header-no-margin">My Inventory</h1>
                        <p className="text-muted text-small m-0">Company assets currently assigned to you.</p>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {loading ? (
                /* Loading State */
                <div className="control-card flex-column align-items-center justify-content-center" style={{ minHeight: '300px' }}>
                    <FontAwesomeIcon icon={faCircleNotch} spin className="text-primary mb-10" style={{ fontSize: '2rem' }} />
                    <p className="text-muted">Fetching your assigned assets...</p>
                </div>
            ) : items.length === 0 ? (
                /* Empty State */
                <div className="control-card flex-column align-items-center justify-content-center text-center" style={{ minHeight: '300px' }}>
                    <FontAwesomeIcon icon={faBoxOpen} className="text-muted mb-10" style={{ fontSize: '3rem', opacity: 0.5 }} />
                    <h3 style={{ margin: '10px 0 5px 0', color: '#334155' }}>No Assets Assigned</h3>
                    <p className="text-muted text-small m-0">You currently do not have any company inventory items assigned to you.</p>
                </div>
            ) : (
                /* 3D Card Grid Layout */
                <div className="inventory-grid">
                    {items.map(item => (
                        <div key={item._id} className="inventory-card">
                            
                            {/* Card Header */}
                            <div className="inventory-card-header">
                                <div>
                                    <h3 className="inventory-item-name">
                                        {item.itemName}
                                    </h3>
                                    <span className="inventory-status-pill">
                                        <FontAwesomeIcon icon={faCheckCircle} /> {item.status}
                                    </span>
                                </div>
                                <div className="inventory-qty-box">
                                    <div className="inventory-qty-label">QTY</div>
                                    <div className="inventory-qty-value">{item.quantity}</div>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="inventory-divider"></div>

                            {/* Notes Section */}
                            <div className="inventory-notes-section">
                                <FontAwesomeIcon icon={faStickyNote} className="inventory-notes-icon" />
                                <span className="inventory-notes-text" style={{ fontStyle: item.notes ? 'normal' : 'italic' }}>
                                    {item.notes ? item.notes : "No additional notes provided by the admin."}
                                </span>
                            </div>
                            
                        </div>
                    ))}
                </div>
            )}
            
        </div>
    );
};

export default MyInventory;