import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faRotateLeft, faRotateRight, faArrowsLeftRight, faArrowsUpDown,
    faCrosshairs, faTimes, faCheck, faMagnifyingGlassPlus, faSpinner
} from '@fortawesome/free-solid-svg-icons';
import '../styles/imageEditor.css';

/**
 * The square the photo is cropped to.
 *
 * 800 rather than 512 because the avatar popup shows a picture at up to
 * 300 CSS pixels, and a phone or a retina laptop draws that with two or three
 * device pixels each -- so a 512px file was being scaled *up* to fill it,
 * which is what made it look soft. 800 also happens to be exactly the width
 * the server caps images at, so the upload is never downscaled a second time.
 */
const OUTPUT_PX = 800;

// Displayed size of the crop window. Only affects the preview — every
// transform is stored in these units and scaled to OUTPUT_PX on export.
const VIEWPORT_PX = 300;

/**
 * Quality is deliberately generous: this is a face at 300px, and the file is
 * re-encoded once more by the server, so anything lost here is lost twice.
 * A cropped 800px JPEG at 0.94 lands around 200-300KB, which is still two
 * orders of magnitude below the multi-megabyte original.
 *
 * The ladder is a backstop for a pathological image, not the normal path --
 * an ordinary photo is accepted at the first step.
 */
const MAX_BYTES = 1200 * 1024;
const QUALITY_STEPS = [0.94, 0.9, 0.84, 0.76];

/**
 * Crop, straighten and flip a picture before it is uploaded.
 *
 * Built on a canvas rather than a cropping library: the whole interaction is
 * pan, zoom, four rotations and two flips, and the export has to reproduce
 * exactly what the preview showed — which is easier to guarantee when both
 * sides apply the same transform list than when one of them belongs to a
 * dependency.
 *
 * Rotation is restricted to 90 degree steps. That is what makes it possible
 * to keep the photo covering the crop window at all times: at right angles
 * the rotated bounding box is just the width and height swapped, so the pan
 * limits stay computable and the user can never drag a blank wedge into
 * frame.
 */
const ImageEditor = ({ file, onCancel, onConfirm }) => {
    const [src, setSrc] = useState(null);
    const [natural, setNatural] = useState(null);   // { w, h }
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);    // degrees, always a multiple of 90
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [busy, setBusy] = useState(false);

    const imgRef = useRef(null);
    const dragRef = useRef(null);

    // Object URLs are a leak if they outlive the component.
    useEffect(() => {
        if (!file) return undefined;
        const url = URL.createObjectURL(file);
        setSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    // At zoom 1 the photo exactly covers the crop window, whichever way round
    // it is, so there is never a gap to start with.
    const quarterTurned = ((rotation / 90) % 2 + 2) % 2 === 1;
    const baseScale = natural
        ? Math.max(
            VIEWPORT_PX / (quarterTurned ? natural.h : natural.w),
            VIEWPORT_PX / (quarterTurned ? natural.w : natural.h)
        )
        : 1;

    const dispW = natural ? natural.w * baseScale * zoom : 0;
    const dispH = natural ? natural.h * baseScale * zoom : 0;

    // How far the photo may be dragged before its edge would enter the frame.
    // The rotated footprint is the un-rotated one with the sides swapped.
    const limits = useCallback(() => {
        const w = quarterTurned ? dispH : dispW;
        const h = quarterTurned ? dispW : dispH;
        return {
            x: Math.max(0, (w - VIEWPORT_PX) / 2),
            y: Math.max(0, (h - VIEWPORT_PX) / 2)
        };
    }, [dispW, dispH, quarterTurned]);

    const clamp = useCallback((next) => {
        const lim = limits();
        return {
            x: Math.min(lim.x, Math.max(-lim.x, next.x)),
            y: Math.min(lim.y, Math.max(-lim.y, next.y))
        };
    }, [limits]);

    // Re-clamp whenever the footprint changes, or zooming out would strand the
    // photo off-centre with a gap showing.
    useEffect(() => { setOffset(o => clamp(o)); }, [zoom, rotation, clamp]);

    const onImgLoad = (e) => {
        setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight });
        setZoom(1);
        setOffset({ x: 0, y: 0 });
    };

    // --- dragging: pointer events cover mouse and touch in one path ---
    const onPointerDown = (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startX: e.clientX, startY: e.clientY, from: offset };
    };

    const onPointerMove = (e) => {
        if (!dragRef.current) return;
        const d = dragRef.current;
        setOffset(clamp({
            x: d.from.x + (e.clientX - d.startX),
            y: d.from.y + (e.clientY - d.startY)
        }));
    };

    const endDrag = (e) => {
        if (dragRef.current) {
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
        }
        dragRef.current = null;
    };

    const onWheel = (e) => {
        // The page behind must not scroll while the pointer is over the frame.
        e.preventDefault();
        setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.0015)));
    };

    const recentre = () => {
        setOffset({ x: 0, y: 0 });
        setZoom(1);
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
    };

    // --- export ---
    const confirm = async () => {
        if (!imgRef.current || !natural) return;
        setBusy(true);
        try {
            const k = OUTPUT_PX / VIEWPORT_PX;
            const canvas = document.createElement('canvas');
            canvas.width = OUTPUT_PX;
            canvas.height = OUTPUT_PX;
            const ctx = canvas.getContext('2d');

            // JPEG has no alpha, so an unpainted pixel would come out black.
            // It cannot happen while the clamp holds, but a white ground costs
            // nothing and fails politely if it ever does.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
            ctx.imageSmoothingQuality = 'high';

            // The same transform list the preview applies, in the same order.
            ctx.translate(OUTPUT_PX / 2, OUTPUT_PX / 2);
            ctx.translate(offset.x * k, offset.y * k);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
            ctx.drawImage(
                imgRef.current,
                (-dispW * k) / 2, (-dispH * k) / 2,
                dispW * k, dispH * k
            );

            const toBlob = (quality) => new Promise(resolve =>
                canvas.toBlob(resolve, 'image/jpeg', quality));

            let blob = null;
            for (const q of QUALITY_STEPS) {
                blob = await toBlob(q);
                if (blob && blob.size <= MAX_BYTES) break;
            }
            if (!blob) throw new Error('Could not encode the image');

            const base = (file.name || 'profile').replace(/\.[^.]+$/, '');
            onConfirm(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
        } catch (err) {
            console.error('Could not process the image', err);
            setBusy(false);
        }
    };

    const transform =
        `translate(${offset.x}px, ${offset.y}px) ` +
        `rotate(${rotation}deg) ` +
        `scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`;

    return (
        <div className="ie-overlay" onClick={onCancel}>
            <div
                className="ie-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Adjust your photo"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="ie-head">
                    <h3>Adjust your photo</h3>
                    <button type="button" className="ie-close" onClick={onCancel} aria-label="Cancel">
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </header>

                <div
                    className="ie-stage"
                    style={{ width: VIEWPORT_PX, height: VIEWPORT_PX }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onWheel={onWheel}
                >
                    {src && (
                        <img
                            ref={imgRef}
                            src={src}
                            alt="Preview"
                            className="ie-img"
                            draggable={false}
                            onLoad={onImgLoad}
                            style={{
                                width: dispW || undefined,
                                height: dispH || undefined,
                                marginLeft: -dispW / 2,
                                marginTop: -dispH / 2,
                                transform
                            }}
                        />
                    )}
                    {/* Shows what will be kept. Drawn over the photo and
                        click-through, so it never interferes with dragging. */}
                    <div className="ie-mask" aria-hidden="true">
                        <div className="ie-mask-circle" />
                    </div>
                </div>

                <p className="ie-hint">Drag to reposition · scroll or use the slider to zoom</p>

                <div className="ie-zoom">
                    <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
                    <input
                        type="range" min="1" max="4" step="0.01"
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        aria-label="Zoom"
                    />
                </div>

                <div className="ie-tools">
                    <button type="button" className="ie-tool" onClick={() => setRotation(r => r - 90)} title="Rotate left">
                        <FontAwesomeIcon icon={faRotateLeft} /><span>Left</span>
                    </button>
                    <button type="button" className="ie-tool" onClick={() => setRotation(r => r + 90)} title="Rotate right">
                        <FontAwesomeIcon icon={faRotateRight} /><span>Right</span>
                    </button>
                    <button type="button" className={`ie-tool ${flipH ? 'is-on' : ''}`} onClick={() => setFlipH(v => !v)} title="Flip horizontally">
                        <FontAwesomeIcon icon={faArrowsLeftRight} /><span>Flip</span>
                    </button>
                    <button type="button" className={`ie-tool ${flipV ? 'is-on' : ''}`} onClick={() => setFlipV(v => !v)} title="Flip vertically">
                        <FontAwesomeIcon icon={faArrowsUpDown} /><span>Flip</span>
                    </button>
                    <button type="button" className="ie-tool" onClick={recentre} title="Centre and reset">
                        <FontAwesomeIcon icon={faCrosshairs} /><span>Centre</span>
                    </button>
                </div>

                <footer className="ie-foot">
                    <button type="button" className="gts-btn secondary" onClick={onCancel} disabled={busy}>
                        Cancel
                    </button>
                    <button type="button" className="gts-btn primary" onClick={confirm} disabled={busy || !natural}>
                        {busy
                            ? <><FontAwesomeIcon icon={faSpinner} spin /> Preparing...</>
                            : <><FontAwesomeIcon icon={faCheck} /> Use this photo</>}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default ImageEditor;
