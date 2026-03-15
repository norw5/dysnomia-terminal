import React from 'react';

const getSoulTheme = (soulIdStr: string) => {
    let hash = 0;
    for (let i = 0; i < soulIdStr.length; i++) {
        hash = soulIdStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash) % 360;
    const primary = `hsl(${h1}, 75%, 60%)`;
    const hash2 = (hash * 1664525 + 1013904223) | 0; 
    const h2 = Math.abs(hash2) % 360;
    const secondary = `hsl(${h2}, 85%, 70%)`;
    return { primary, secondary };
};

const SoulSigil: React.FC<{ soulId: string, size?: number, className?: string }> = ({ soulId, size = 32, className }) => {
    const { primary, secondary } = getSoulTheme(soulId);
    const generateMatrix = () => {
        let hash = 0;
        for (let i = 0; i < soulId.length; i++) {
            hash = soulId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const shapeBits = [];
        for(let i = 0; i < 15; i++) shapeBits.push(((hash >> i) & 1) === 1);
        const colorHash = (hash * 1664525 + 1013904223) | 0;
        const colorBits = [];
        for(let i = 0; i < 15; i++) colorBits.push(((colorHash >> i) & 1) === 1);
        return { shapeBits, colorBits };
    };
    const { shapeBits, colorBits } = generateMatrix();
    return (
        <svg width={size} height={size} viewBox="0 0 5 5" shapeRendering="crispEdges" className={`bg-black border border-white/10 shrink-0 ${className || ''}`}>
            <rect x="0" y="0" width="5" height="5" fill="#050505" />
            {Array.from({ length: 5 }).map((_, y) => (
                Array.from({ length: 3 }).map((_, x) => {
                    const idx = y * 3 + x;
                    if (shapeBits[idx]) {
                        const fill = colorBits[idx] ? secondary : primary;
                        return (
                            <React.Fragment key={`${x}-${y}`}>
                                <rect x={x} y={y} width="1" height="1" fill={fill} />
                                {x < 2 && <rect x={4 - x} y={y} width="1" height="1" fill={fill} />}
                            </React.Fragment>
                        );
                    }
                    return null;
                })
            ))}
        </svg>
    );
};

export default SoulSigil;
