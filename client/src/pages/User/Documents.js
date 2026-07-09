import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import api from '../../utils/api';
import {
    faFilePdf, faCheckCircle, faClock, faEye, faSignature,
    faUpload, faUsers, faExclamationTriangle, faArchive
} from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';

const Documents = () => {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewed, setViewed] = useState(() => new Set());

    const currentUser = JSON.parse(localStorage.getItem('user')) || {};
    const canManage = ['ADMIN', 'HR'].includes(currentUser.role);

    useEffect(() => { fetchDocs(); }, []);

    const fetchDocs = async () => {
        try {
            const res = await api.get('/documents');
            setDocs(res.data);
        } catch (err) {
            console.error('Failed to load documents', err);
        } finally {
            setLoading(false);
        }
    };

    // --- READ: open the PDF inline. Marks the doc as viewed so it can be signed. ---
    const handleRead = (doc) => {
        setViewed(prev => new Set(prev).add(doc._id));
        Swal.fire({
            title: doc.title,
            html: `<iframe src="${doc.fileUrl}" width="100%" height="100%" style="border:1px solid #e2e8f0; border-radius:8px; height:78vh; display:block;"></iframe>
                   <div style="text-align:left; font-size:11px; color:#94a3b8; margin-top:8px;">
                     Version ${doc.version} &middot; ${doc.fileName || ''}
                   </div>`,
            width: '92vw',
            padding: '1rem',
            customClass: { popup: 'doc-viewer-popup' },
            showCloseButton: true,
            showConfirmButton: false
        });
    };

    // --- ACKNOWLEDGE: click-wrap (checkbox + typed name). Server records IP/UA/version/hash. ---
    const handleAcknowledge = async (doc) => {
        const { value: formValues } = await Swal.fire({
            title: 'Acknowledge Document',
            html: `
                <div style="text-align:left;">
                    <p style="font-size:14px; color:#334155; margin-top:0;">
                        <b>${doc.title}</b> <span style="color:#94a3b8;">(v${doc.version})</span>
                    </p>
                    <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; color:#334155; margin:14px 0;">
                        <input type="checkbox" id="ack-agree" style="margin-top:3px;">
                        <span>I confirm that I have read, understood, and agree to comply with this document.</span>
                    </label>
                    <label class="swal-custom-label">Type your full name to sign</label>
                    <input id="ack-name" class="swal2-input" style="width:100%; margin:6px 0;" value="${(currentUser.name || '').replace(/"/g, '&quot;')}">
                    <p style="font-size:11px; color:#94a3b8; line-height:1.5;">
                        Your typed name, the date &amp; time, your IP address, and the document version will be
                        recorded as your electronic signature.
                    </p>
                </div>
            `,
            confirmButtonText: 'Sign & Acknowledge',
            confirmButtonColor: '#215D7B',
            showCancelButton: true,
            focusConfirm: false,
            preConfirm: () => {
                const agreed = document.getElementById('ack-agree').checked;
                const signedName = document.getElementById('ack-name').value.trim();
                if (!agreed) { Swal.showValidationMessage('Please confirm you have read the document.'); return false; }
                if (!signedName) { Swal.showValidationMessage('Please type your full name to sign.'); return false; }
                return { agreed, signedName };
            }
        });

        if (!formValues) return;
        try {
            await api.post(`/documents/${doc._id}/acknowledge`, formValues);
            Swal.fire('Acknowledged', 'Your acknowledgement has been recorded.', 'success');
            fetchDocs();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Failed to acknowledge', 'error');
        }
    };

    // --- ADMIN: upload a new document ---
    const handleUpload = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Upload Document',
            html: `
                <div style="text-align:left;">
                    <label class="swal-custom-label">Title *</label>
                    <input id="doc-title" class="swal2-input" style="width:100%; margin:6px 0;" placeholder="e.g. Information Security Policy">
                    <label class="swal-custom-label">Category</label>
                    <select id="doc-category" class="swal2-select" style="width:100%; margin:6px 0;">
                        <option value="Policy">Policy</option>
                        <option value="Handbook">Handbook</option>
                        <option value="Pledge">Pledge</option>
                        <option value="Other">Other</option>
                    </select>
                    <label class="swal-custom-label">Description</label>
                    <textarea id="doc-desc" class="swal2-textarea" style="width:100%; margin:6px 0;" placeholder="Short summary..."></textarea>
                    <label class="swal-custom-label">PDF File *</label>
                    <input id="doc-file" type="file" accept="application/pdf" class="swal2-file" style="width:100%; margin:6px 0;">
                </div>
            `,
            confirmButtonText: 'Upload',
            confirmButtonColor: '#215D7B',
            showCancelButton: true,
            focusConfirm: false,
            preConfirm: () => {
                const title = document.getElementById('doc-title').value.trim();
                const category = document.getElementById('doc-category').value;
                const description = document.getElementById('doc-desc').value.trim();
                const file = document.getElementById('doc-file').files[0];
                if (!title) { Swal.showValidationMessage('Title is required'); return false; }
                if (!file) { Swal.showValidationMessage('Please choose a PDF file'); return false; }
                return { title, category, description, file };
            }
        });

        if (!formValues) return;
        const fd = new FormData();
        fd.append('title', formValues.title);
        fd.append('category', formValues.category);
        fd.append('description', formValues.description);
        fd.append('file', formValues.file);

        try {
            Swal.fire({ title: 'Uploading...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            Swal.fire('Uploaded', 'Document is now visible to all employees.', 'success');
            fetchDocs();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Upload failed', 'error');
        }
    };

    // --- ADMIN: compliance report ---
    const handleCompliance = async (doc) => {
        try {
            const res = await api.get(`/documents/${doc._id}/acknowledgements`);
            const { summary, rows } = res.data;
            const body = rows.map(r => `
                <tr>
                    <td style="padding:6px 10px; font-size:12px;">${r.employeeId || '-'}</td>
                    <td style="padding:6px 10px; font-size:12px;">${r.name}</td>
                    <td style="padding:6px 10px; font-size:12px; color:${r.acknowledged ? '#16a34a' : '#dc2626'};">
                        ${r.acknowledged ? 'Signed' : 'Pending'}
                    </td>
                    <td style="padding:6px 10px; font-size:12px; color:#64748b;">
                        ${r.acknowledgedAt ? new Date(r.acknowledgedAt).toLocaleString('en-GB') : '-'}
                    </td>
                </tr>`).join('');

            Swal.fire({
                title: `${doc.title} — v${doc.version}`,
                html: `
                    <div style="text-align:left;">
                        <p style="font-size:14px; color:#334155;">
                            <b style="color:#16a34a;">${summary.acknowledged}</b> of <b>${summary.total}</b> employees have signed.
                        </p>
                        <div style="max-height:380px; overflow:auto; border:1px solid #e2e8f0; border-radius:8px;">
                            <table style="width:100%; border-collapse:collapse;">
                                <thead><tr style="background:#f8fafc;">
                                    <th style="padding:8px 10px; text-align:left; font-size:11px;">ID</th>
                                    <th style="padding:8px 10px; text-align:left; font-size:11px;">Name</th>
                                    <th style="padding:8px 10px; text-align:left; font-size:11px;">Status</th>
                                    <th style="padding:8px 10px; text-align:left; font-size:11px;">Signed At</th>
                                </tr></thead>
                                <tbody>${body}</tbody>
                            </table>
                        </div>
                    </div>`,
                width: '760px',
                showCloseButton: true,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Error', 'Could not load compliance report', 'error');
        }
    };

    const handleArchive = async (doc) => {
        const c = await Swal.fire({
            title: 'Archive document?',
            text: `"${doc.title}" will be hidden from employees. Existing acknowledgements are kept.`,
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'Archive'
        });
        if (!c.isConfirmed) return;
        try {
            await api.delete(`/documents/${doc._id}`);
            fetchDocs();
        } catch (err) {
            Swal.fire('Error', 'Failed to archive', 'error');
        }
    };

    const statusBadge = (doc) => {
        if (doc.acknowledged) return <span className="status-badge success"><FontAwesomeIcon icon={faCheckCircle} /> Acknowledged</span>;
        if (doc.needsReacknowledge) return <span className="status-badge warning"><FontAwesomeIcon icon={faExclamationTriangle} /> Re-acknowledge</span>;
        return <span className="status-badge warning"><FontAwesomeIcon icon={faClock} /> Pending</span>;
    };

    if (loading) return <div className="main-content">Loading Documents...</div>;

    const pending = docs.filter(d => !d.acknowledged).length;

    return (
        <div className="leaves-container fade-in">
            <div className="page-header-row">
                <h1 className="page-title header-no-margin">GTS Documents</h1>
                {canManage && (
                    <button className="action-btn-primary" onClick={handleUpload}>
                        <FontAwesomeIcon icon={faUpload} className="btn-icon" /> Upload Document
                    </button>
                )}
            </div>

            {pending > 0 && (
                <div className="control-card p-15 mb-20" style={{ background: '#fffbeb', border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FontAwesomeIcon icon={faExclamationTriangle} style={{ color: '#d97706' }} />
                    <span style={{ fontSize: '14px', color: '#92400e' }}>
                        You have <b>{pending}</b> document{pending > 1 ? 's' : ''} awaiting your acknowledgement.
                    </span>
                </div>
            )}

            {docs.length === 0 ? (
                <div className="control-card p-30 text-center text-muted">No documents have been published yet.</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                    {docs.map(doc => {
                        const canSign = viewed.has(doc._id);
                        return (
                            <div key={doc._id} className="control-card p-20 d-block">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                    <FontAwesomeIcon icon={faFilePdf} style={{ color: '#dc2626', fontSize: '26px', marginTop: '3px' }} />
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#0f172a' }}>{doc.title}</h3>
                                        <div className="text-small text-muted">{doc.category} &middot; v{doc.version}</div>
                                    </div>
                                </div>

                                {doc.description && <p className="text-small text-muted" style={{ margin: '0 0 12px' }}>{doc.description}</p>}

                                <div style={{ marginBottom: '12px' }}>{statusBadge(doc)}</div>

                                {doc.acknowledged && (
                                    <div className="text-small text-muted" style={{ marginBottom: '12px' }}>
                                        Signed by <b>{doc.signedName}</b> on {new Date(doc.acknowledgedAt).toLocaleDateString('en-GB')}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button className="gts-btn primary btn-small m-0" onClick={() => handleRead(doc)}>
                                        <FontAwesomeIcon icon={faEye} className="btn-icon" /> Read
                                    </button>

                                    {!doc.acknowledged && (
                                        <button
                                            className="gts-btn btn-small m-0"
                                            style={{
                                                background: canSign ? '#dcfce7' : '#f1f5f9',
                                                color: canSign ? '#16a34a' : '#94a3b8',
                                                cursor: canSign ? 'pointer' : 'not-allowed'
                                            }}
                                            disabled={!canSign}
                                            title={canSign ? 'Sign this document' : 'Open the document first'}
                                            onClick={() => handleAcknowledge(doc)}
                                        >
                                            <FontAwesomeIcon icon={faSignature} className="btn-icon" /> Acknowledge
                                        </button>
                                    )}

                                    {canManage && (
                                        <>
                                            <button className="gts-btn btn-small m-0" style={{ background: '#eff6ff', color: '#1e73be' }} onClick={() => handleCompliance(doc)}>
                                                <FontAwesomeIcon icon={faUsers} className="btn-icon" /> Compliance
                                            </button>
                                            <button className="gts-btn btn-small m-0" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => handleArchive(doc)}>
                                                <FontAwesomeIcon icon={faArchive} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Documents;
