import fs from 'fs';
let content = fs.readFileSync('components/VoidChat.tsx', 'utf8');

// I also noticed `useLayoutEffect` vs `useEffect`. We should definitely be using `useEffect` as we already are!
// Wait! Let's check what `applyScroll` looks like now.

console.log(content.match(/const applyScroll = \(\) => \{[\s\S]*?setShowScrollToBottom\(!isNearBottom\);\n\s*\};/)[0]);
