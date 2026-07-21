import React, { useEffect, useState } from "react";
import api from "../utils/api";

export default function ForeverBegins() {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/forever-begins")
            .then((res) => {
                setFiles(res.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const formatSize = (bytes) => {
        const gb = bytes / (1024 ** 3);
        if (gb >= 1) return `${gb.toFixed(2)} GB`;

        const mb = bytes / (1024 ** 2);
        return `${mb.toFixed(0)} MB`;
    };

    return (
        <div className="fb-page">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,500&family=Cinzel:wght@500;600&family=Jost:wght@300;400;500&display=swap');

                .fb-page {
                    min-height: 100vh;
                    background:
                        radial-gradient(circle at 15% 10%, rgba(201,162,39,0.10), transparent 40%),
                        radial-gradient(circle at 85% 90%, rgba(107,30,60,0.08), transparent 45%),
                        linear-gradient(160deg, #FDF7F0 0%, #FBEEE6 45%, #F7E6EA 100%);
                    font-family: 'Jost', sans-serif;
                    padding: 60px 20px 90px;
                    position: relative;
                    overflow: hidden;
                }

                .fb-petal {
                    position: absolute;
                    top: -40px;
                    font-size: 20px;
                    opacity: 0.35;
                    color: #C9A227;
                    animation: fbFall linear infinite;
                    pointer-events: none;
                    user-select: none;
                }

                @keyframes fbFall {
                    0%   { transform: translateY(0) rotate(0deg); opacity: 0; }
                    10%  { opacity: 0.45; }
                    90%  { opacity: 0.35; }
                    100% { transform: translateY(110vh) rotate(340deg); opacity: 0; }
                }

                .fb-container {
                    max-width: 780px;
                    margin: 0 auto;
                    position: relative;
                    z-index: 1;
                }

                .fb-header {
                    text-align: center;
                    margin-bottom: 20px;
                    animation: fbFadeDown 0.9s ease both;
                }

                @keyframes fbFadeDown {
                    from { opacity: 0; transform: translateY(-16px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                .fb-eyebrow {
                    font-family: 'Cinzel', serif;
                    letter-spacing: 4px;
                    font-size: 12px;
                    color: #A9762F;
                    text-transform: uppercase;
                    margin: 0 0 14px;
                }

                .fb-names {
                    font-family: 'Cormorant Garamond', serif;
                    font-weight: 600;
                    font-size: 52px;
                    color: #6B1E3C;
                    margin: 0;
                    line-height: 1.15;
                }

                .fb-names .fb-heart {
                    display: inline-block;
                    color: #C9A227;
                    font-size: 34px;
                    margin: 0 14px;
                    animation: fbPulse 1.8s ease-in-out infinite;
                }

                @keyframes fbPulse {
                    0%, 100% { transform: scale(1); }
                    50%      { transform: scale(1.18); }
                }

                .fb-divider {
                    display: block;
                    margin: 22px auto 26px;
                    width: 220px;
                    height: 28px;
                    overflow: visible;
                }

                .fb-divider path {
                    fill: none;
                    stroke: #C9A227;
                    stroke-width: 1.4;
                    stroke-linecap: round;
                    stroke-dasharray: 320;
                    stroke-dashoffset: 320;
                    animation: fbDraw 1.6s ease forwards 0.3s;
                }

                @keyframes fbDraw {
                    to { stroke-dashoffset: 0; }
                }

                .fb-sub {
                    text-align: center;
                    color: #6B4A3E;
                    font-size: 15.5px;
                    line-height: 1.75;
                    max-width: 460px;
                    margin: 0 auto 48px;
                    animation: fbFadeDown 0.9s ease both 0.15s;
                }

                .fb-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .fb-card {
                    background: rgba(255,255,255,0.72);
                    backdrop-filter: blur(6px);
                    border: 1px solid rgba(201,162,39,0.28);
                    border-radius: 16px;
                    padding: 26px 28px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    box-shadow: 0 6px 22px rgba(107,30,60,0.07);
                    opacity: 0;
                    transform: translateY(18px);
                    animation: fbCardIn 0.7s ease forwards;
                    transition: transform 0.35s ease, box-shadow 0.35s ease, border-color 0.35s ease;
                }

                .fb-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 16px 34px rgba(107,30,60,0.16);
                    border-color: rgba(201,162,39,0.55);
                }

                @keyframes fbCardIn {
                    to { opacity: 1; transform: translateY(0); }
                }

                .fb-card-info h3 {
                    font-family: 'Cormorant Garamond', serif;
                    font-weight: 600;
                    font-size: 25px;
                    color: #4A2432;
                    margin: 0 0 6px;
                    text-transform: capitalize;
                }

                .fb-card-info p {
                    margin: 0;
                    font-size: 13px;
                    color: #9C7A5B;
                    letter-spacing: 0.3px;
                }

                .fb-download {
                    flex-shrink: 0;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 22px;
                    border: none;
                    border-radius: 999px;
                    font-family: 'Jost', sans-serif;
                    font-size: 13.5px;
                    font-weight: 500;
                    letter-spacing: 0.4px;
                    color: #FFF8EC;
                    background: linear-gradient(120deg, #6B1E3C, #8C2C4F 45%, #6B1E3C);
                    background-size: 220% auto;
                    cursor: pointer;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 6px 16px rgba(107,30,60,0.28);
                    transition: background-position 0.5s ease, transform 0.2s ease, box-shadow 0.3s ease;
                }

                .fb-download:hover {
                    background-position: right center;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 22px rgba(107,30,60,0.35);
                }

                .fb-download:active {
                    transform: translateY(0);
                }

                .fb-download-icon {
                    font-size: 15px;
                    transform: translateY(1px);
                }

                .fb-loading {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                    gap: 18px;
                    background: linear-gradient(160deg, #FDF7F0 0%, #FBEEE6 45%, #F7E6EA 100%);
                    font-family: 'Cormorant Garamond', serif;
                    color: #6B1E3C;
                    font-size: 20px;
                    letter-spacing: 1px;
                }

                .fb-ring {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid rgba(201,162,39,0.3);
                    border-top-color: #C9A227;
                    animation: fbSpin 0.9s linear infinite;
                }

                @keyframes fbSpin {
                    to { transform: rotate(360deg); }
                }

                .fb-empty {
                    text-align: center;
                    color: #9C7A5B;
                    font-size: 15px;
                    padding: 40px 0;
                    animation: fbFadeDown 0.9s ease both 0.2s;
                }

                @media (max-width: 560px) {
                    .fb-names { font-size: 38px; }
                    .fb-card { flex-direction: column; align-items: flex-start; }
                    .fb-download { width: 100%; justify-content: center; }
                }
            `}</style>

            {[...Array(10)].map((_, i) => (
                <span
                    key={i}
                    className="fb-petal"
                    style={{
                        left: `${(i * 9.7) % 100}%`,
                        animationDuration: `${9 + (i % 5) * 2.3}s`,
                        animationDelay: `${i * 1.4}s`,
                        fontSize: `${14 + (i % 3) * 6}px`
                    }}
                >
                    ❀
                </span>
            ))}

            {loading ? (
                <div className="fb-loading">
                    <div className="fb-ring" />
                    Gathering your memories&hellip;
                </div>
            ) : (
                <div className="fb-container">
                    <header className="fb-header">
                        <p className="fb-eyebrow">Forever begins</p>
                        <h1 className="fb-names">
                            Kunal<span className="fb-heart">❤</span>Sneha
                        </h1>
                    </header>

                    <svg className="fb-divider" viewBox="0 0 220 28" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 14 C 40 2, 70 26, 110 14 S 180 2, 218 14" />
                    </svg>

                    <p className="fb-sub">
                        Thank you for celebrating with us. Every frame here holds a
                        piece of that day &mdash; download all the memories below.
                    </p>

                    {files.length === 0 ? (
                        <p className="fb-empty">No albums have been uploaded yet. Please check back soon.</p>
                    ) : (
                        <div className="fb-grid">
                            {files.map((file, index) => (
                                <div
                                    key={file.name}
                                    className="fb-card"
                                    style={{ animationDelay: `${0.15 + index * 0.12}s` }}
                                >
                                    <div className="fb-card-info">
                                        <h3>{file.name.replace(".zip", "").replace(/[_-]/g, " ")}</h3>
                                        <p>{formatSize(file.size)}</p>
                                    </div>

                                    <a href={file.url} target="_blank" rel="noreferrer">
                                        <button className="fb-download">
                                            <span className="fb-download-icon">&#8681;</span>
                                            Download
                                        </button>
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}