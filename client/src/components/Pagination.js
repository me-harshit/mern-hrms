import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

const Pagination = ({ 
    currentPage, 
    totalPages, 
    totalRecords, 
    limit, 
    onPageChange, 
    onLimitChange 
}) => {
    const [pageInput, setPageInput] = useState(currentPage);

    useEffect(() => {
        setPageInput(currentPage);
    }, [currentPage]);

    const handlePageJump = (e) => {
        let val = Number(e.target.value);
        if (val < 1) val = 1;
        if (val > totalPages) val = totalPages;
        onPageChange(val);
        setPageInput(val);
    };

    if (totalRecords === 0) return null;

    return (
        <div className="pagination-container fade-in">
            <div className="pagination-left">
                <div className="pagination-total-text">
                    Total Records: <span className="pagination-total-highlight">{totalRecords}</span>
                </div>
                <div className="pagination-limit-wrapper">
                    <label>Show:</label>
                    <select 
                        className="pagination-input" 
                        style={{ width: 'auto' }}
                        value={limit}
                        onChange={(e) => onLimitChange(Number(e.target.value))}
                    >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>
            </div>

            <div className="pagination-right">
                <button 
                    className="pagination-btn"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                >
                    <FontAwesomeIcon icon={faChevronLeft} /> Prev
                </button>
                
                <div className="pagination-jump-wrapper">
                    Page 
                    <input 
                        type="number" 
                        className="pagination-input"
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        onBlur={handlePageJump}
                        onKeyDown={(e) => e.key === 'Enter' && handlePageJump(e)}
                    /> 
                    of {totalPages}
                </div>

                <button 
                    className="pagination-btn"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                >
                    Next <FontAwesomeIcon icon={faChevronRight} />
                </button>
            </div>
        </div>
    );
};

export default Pagination;