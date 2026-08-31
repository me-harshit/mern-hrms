import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTimes, faFilePdf, faFileWord, faFileExcel, faFilePowerpoint,
    faFileZipper, faFileLines, faFileCode, faFile, faFilm, faMicrophone
} from '@fortawesome/free-solid-svg-icons';
import '../styles/attachMenu.css';

/**
 * The files chosen but not yet uploaded, with a way to drop one.
 *
 * Tasks previously showed the browser's own "3 files selected" text, which
 * cannot say *which* three and offers no way to remove the wrong one short of
 * re-picking the whole set. Images get a thumbnail so a mis-picked screenshot
 * is obvious before it is attached to a task everyone will read.
 */

const iconFor = (file) => {
    if (file.type?.startsWith('video/')) return faFilm;
    if (file.type?.startsWith('audio/')) return faMicrophone;

    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return faFilePdf;
    if (['doc', 'docx'].includes(ext)) return faFileWord;
    if (['xls', 'xlsx', 'csv'].includes(ext)) return faFileExcel;
    if (['ppt', 'pptx'].includes(ext)) return faFilePowerpoint;
    if (ext === 'zip') return faFileZipper;
    if (['html', 'htm'].includes(ext)) return faFileCode;
    if (ext === 'txt') return faFileLines;
    return faFile;
};

const prettySize = (n) => {
    if (!n) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** One thumbnail, owning its object URL so it is revoked when the chip goes. */
const Thumb = ({ file }) => {
    const [url, setUrl] = useState(null);

    useEffect(() => {
        if (!file.type?.startsWith('image/')) return undefined;
        const u = URL.createObjectURL(file);
        setUrl(u);
        // An object URL that outlives its blob leaks; the whole point of doing
        // this per-chip is that removal revokes it.
        return () => URL.revokeObjectURL(u);
    }, [file]);

    if (url) return <img src={url} alt={file.name} />;
    return (
        <span className="attach-chip-icon">
            <FontAwesomeIcon icon={iconFor(file)} />
        </span>
    );
};

const StagedFiles = ({ files = [], onRemove, disabled }) => {
    if (!files.length) return null;

    return (
        <div className="attach-staged">
            {files.map((f, i) => (
                <div className="attach-chip" key={`${f.name}-${f.size}-${i}`}>
                    <Thumb file={f} />
                    <div className="attach-chip-body">
                        <span className="attach-chip-name" title={f.name}>{f.name}</span>
                        <span className="attach-chip-size">{prettySize(f.size)}</span>
                    </div>
                    {onRemove && (
                        <button
                            type="button"
                            onClick={() => onRemove(i)}
                            disabled={disabled}
                            title="Remove"
                        >
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
};

export default StagedFiles;
