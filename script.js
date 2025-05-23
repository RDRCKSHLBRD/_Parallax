// ========================================
// GLOBALS - Unified Perspective System
// ========================================

const WORLD = {
    size: 11, // Grid from 0 to 10
    center: 5,
    player: {
        x: 5,
        y: 5,
    },
    roomHeight: 5.0,  // Maintained taller height
    floorLevelY: 0,
    wallProximityOffset: 0.5
};

const VIEWPORT = {
    width: 800,
    height: 600,
    centerX: 400,
    centerY: 300
};

const PERSPECTIVE = {
    focalLength: 260,   // <<< REDUCED for a WIDER Field of View
    eyeHeight: 1.2,     // Adjusted slightly
    nearClipZ: 0.15,    // <<< REDUCED slightly to allow closer rendering
    baseFontSize: 12,
    fontPerspectiveFactor: 0.8, // May need tuning with new focal length
    labelOffsetFromLine: 15
};

const ROOM_GEOMETRY = {
    projectedFloorCorners: [],
    projectedCeilingCorners: [],
    projectedWalls: {
        north: [],
        east: [],
        west: [],
    },
    projectedGridLines: []
};

// ========================================
// DOM ELEMENTS (Same as before)
// ========================================
let svgElement;
let positionText;
let debugInfo;
let navButtons;

// ========================================
// UTILITIES (Same as before)
// ========================================
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function createSVGElement(tag, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
}

// ========================================
// UNIFIED PERSPECTIVE PROJECTION (Same as before)
// ========================================
function projectToScreen(worldX, worldY_height, worldZ_depth) {
    const cameraX = WORLD.player.x;
    const cameraY_height = PERSPECTIVE.eyeHeight;
    const cameraZ_depth = WORLD.player.y;

    const relativeX = worldX - cameraX;
    const relativeY = worldY_height - cameraY_height;
    let effectiveDepth = cameraZ_depth - worldZ_depth; // Positive if point is in front (towards Z=0)

    if (effectiveDepth <= PERSPECTIVE.nearClipZ) {
        return null;
    }

    const scaleFactor = PERSPECTIVE.focalLength / effectiveDepth;
    const screenX = VIEWPORT.centerX + (relativeX * scaleFactor);
    const screenY = VIEWPORT.centerY - (relativeY * scaleFactor);

    return { x: screenX, y: screenY, depth: effectiveDepth };
}

// ========================================
// GEOMETRY DEFINITION & PROJECTION
// ========================================
function calculateProjectedGeometry() {
    const wMax = WORLD.size - 1;
    const rHeight = WORLD.roomHeight;
    const fLevel = WORLD.floorLevelY;

    // Store 3D points for clarity
    const worldCorners = {
        // Floor
        fl_far_l:  { x: 0,    y: fLevel, z: 0 },
        fl_far_r:  { x: wMax, y: fLevel, z: 0 },
        fl_near_r: { x: wMax, y: fLevel, z: wMax },
        fl_near_l: { x: 0,    y: fLevel, z: wMax },
        // Ceiling
        cl_far_l:  { x: 0,    y: fLevel + rHeight, z: 0 },
        cl_far_r:  { x: wMax, y: fLevel + rHeight, z: 0 },
        cl_near_r: { x: wMax, y: fLevel + rHeight, z: wMax },
        cl_near_l: { x: 0,    y: fLevel + rHeight, z: wMax }
    };

    // Project all unique 3D corners once
    const projectedPoints = {};
    for (const id in worldCorners) {
        projectedPoints[id] = projectToScreen(worldCorners[id].x, worldCorners[id].y, worldCorners[id].z);
    }

    ROOM_GEOMETRY.projectedFloorCorners = [
        projectedPoints['fl_far_l'], projectedPoints['fl_far_r'],
        projectedPoints['fl_near_r'], projectedPoints['fl_near_l']
    ];
    ROOM_GEOMETRY.projectedCeilingCorners = [
        projectedPoints['cl_far_l'], projectedPoints['cl_far_r'],
        projectedPoints['cl_near_r'], projectedPoints['cl_near_l']
    ];

    ROOM_GEOMETRY.projectedWalls.north = [ // Far wall (Z=0)
        projectedPoints['fl_far_l'], projectedPoints['fl_far_r'],
        projectedPoints['cl_far_r'], projectedPoints['cl_far_l']
    ];
    ROOM_GEOMETRY.projectedWalls.west = [ // Left wall (X=0). Order: NearBottom, FarBottom, FarTop, NearTop
        projectedPoints['fl_near_l'], projectedPoints['fl_far_l'],
        projectedPoints['cl_far_l'], projectedPoints['cl_near_l']
    ];
    ROOM_GEOMETRY.projectedWalls.east = [ // Right wall (X=wMax)
        projectedPoints['fl_near_r'], projectedPoints['fl_far_r'],
        projectedPoints['cl_far_r'], projectedPoints['cl_near_r']
    ];

    // Calculate 2D Grid Lines
    ROOM_GEOMETRY.projectedGridLines = [];
    const numGridLines = WORLD.size;

    for (let i = 0; i < numGridLines; i++) { // Horizontal lines
        const worldZ = i;
        const p1_h = projectToScreen(0, fLevel, worldZ);
        const p2_h = projectToScreen(wMax, fLevel, worldZ);
        if (p1_h && p2_h) {
            ROOM_GEOMETRY.projectedGridLines.push({ start: p1_h, end: p2_h, worldValue: i, type: 'horizontal', avgDepth: (p1_h.depth + p2_h.depth) / 2 });
        }
    }
    for (let i = 0; i < numGridLines; i++) { // Vertical lines
        const worldX = i;
        const p1_v = projectToScreen(worldX, fLevel, 0);    // Far end
        let p2_v = projectToScreen(worldX, fLevel, wMax); // Near end
        
        if (p1_v) { // If the far point is visible
            if (!p2_v) { // If near point is clipped, try to project to just in front of nearClipZ
                const nearClipWorldZ = WORLD.player.y - (PERSPECTIVE.nearClipZ + 0.01); // Z value just in front of near clip
                // Ensure this Z is within the world's depth bounds (0 to wMax)
                // and also ensure it's "in front" of the far point (p1_v.worldZ which is 0)
                if (nearClipWorldZ < wMax && nearClipWorldZ > 0) {
                     p2_v = projectToScreen(worldX, fLevel, nearClipWorldZ);
                }
            }
            if (p1_v && p2_v) { // If both points (original or adjusted p2_v) are now valid
                 ROOM_GEOMETRY.projectedGridLines.push({ start: p1_v, end: p2_v, worldValue: i, type: 'vertical', avgDepth: (p1_v.depth + p2_v.depth) / 2 });
            }
        }
    }
    ROOM_GEOMETRY.projectedGridLines.sort((a, b) => b.avgDepth - a.avgDepth);
}


function pointsToPathString(pointsArray, closePath = false) {
    const validPoints = pointsArray.filter(p => p !== null);
    if (validPoints.length < 2) return ''; // Need at least 2 points for a line, 3 for a filled shape
    let path = `M ${validPoints[0].x.toFixed(2)} ${validPoints[0].y.toFixed(2)}`;
    for (let i = 1; i < validPoints.length; i++) {
        path += ` L ${validPoints[i].x.toFixed(2)} ${validPoints[i].y.toFixed(2)}`;
    }
    if (closePath && validPoints.length >= 3) path += ' Z'; // Only close if it makes sense (3+ points)
    return path;
}

// ========================================
// RENDERING
// ========================================
function updatePositionDisplay() {
    positionText.textContent = `${WORLD.player.x.toFixed(1)},${WORLD.player.y.toFixed(1)}`;
}

function clearSVG() {
    while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);
}

function renderScene() {
    clearSVG();
    const drawOrder = [];
    const labelsToDraw = [];

    const addShapeToDrawOrder = (points, cssClass, depth, isClosed = true) => {
        const validPoints = points.filter(p => p !== null);
        if (validPoints.length >= (isClosed ? 3 : 2)) { // Need 3 for closed, 2 for open path/line
            drawOrder.push({
                type: 'path', // All polygons are paths
                d: pointsToPathString(points, isClosed),
                class: cssClass,
                depth: depth
            });
        }
    };
    
    // Calculate approximate depths for sorting. Lower depth value = further away for this sort.
    // For walls, using average Z of their defining 3D points, relative to player.
    const wMax = WORLD.size -1;
    const avgWallZ = (0 + wMax) / 2; // Mid-depth of side walls

    addShapeToDrawOrder(ROOM_GEOMETRY.projectedFloorCorners, 'room-floor', Infinity, true); // Floor is "most distant" plane
    addShapeToDrawOrder(ROOM_GEOMETRY.projectedWalls.north, 'room-wall-back', WORLD.player.y - 0, true);
    addShapeToDrawOrder(ROOM_GEOMETRY.projectedWalls.west, 'room-wall-left', Math.abs(WORLD.player.x - 0) + Math.abs(WORLD.player.y - avgWallZ), true);
    addShapeToDrawOrder(ROOM_GEOMETRY.projectedWalls.east, 'room-wall-right', Math.abs(WORLD.player.x - wMax) + Math.abs(WORLD.player.y - avgWallZ), true);
    
    ROOM_GEOMETRY.projectedGridLines.forEach(line => {
        drawOrder.push({ type: 'line', x1: line.start.x, y1: line.start.y, x2: line.end.x, y2: line.end.y, class: 'grid-line', depth: line.avgDepth, labelInfo: { worldValue: line.worldValue, type: line.type, line: line } });
    });
    
    addShapeToDrawOrder(ROOM_GEOMETRY.projectedCeilingCorners, 'room-ceiling', -Infinity, true); // Ceiling is "closest" plane

    drawOrder.sort((a, b) => b.depth - a.depth);

    drawOrder.forEach(item => {
        if (item.type === 'path') {
            if (item.d) svgElement.appendChild(createSVGElement('path', { d: item.d, class: item.class }));
        } else if (item.type === 'line') {
            svgElement.appendChild(createSVGElement('line', { x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2, class: item.class }));
            if (item.labelInfo) labelsToDraw.push(item.labelInfo);
        }
    });

    // Draw labels on top
    labelsToDraw.forEach(info => {
        const {worldValue, type, line} = info;
        if (!line.start || !line.end) return;
        let fontSize, labelX, labelY, pointForLabel;

        if (type === 'horizontal') {
            const depthForFontScale = Math.max(PERSPECTIVE.nearClipZ + 0.1, line.avgDepth);
            fontSize = PERSPECTIVE.baseFontSize * (PERSPECTIVE.focalLength / (PERSPECTIVE.focalLength + depthForFontScale * 1.3));
            fontSize = clamp(fontSize, 5, PERSPECTIVE.baseFontSize * 1.5);
            
            const lineMidXProjected = (line.start.x + line.end.x) / 2;
            const anchorLeft = line.start.x < VIEWPORT.centerX || lineMidXProjected < VIEWPORT.centerX;
            
            if(anchorLeft) {
                 labelX = line.start.x - PERSPECTIVE.labelOffsetFromLine;
                 pointForLabel = line.start;
            } else {
                 labelX = line.end.x + PERSPECTIVE.labelOffsetFromLine;
                 pointForLabel = line.end;
            }
            labelY = pointForLabel.y;

            if ((worldValue === 0 || worldValue === (WORLD.size - 1) || fontSize > 6) &&
                (labelX > 5 && labelX < VIEWPORT.width - 5 && labelY > 20 && labelY < VIEWPORT.height - 20)) {
                svgElement.appendChild(createSVGElement('text', {
                    x: labelX, y: labelY, class: 'grid-label',
                    style: `font-size: ${fontSize.toFixed(1)}px; text-anchor: ${anchorLeft ? 'end' : 'start'};`
                })).textContent = String(worldValue);
            }
        } else { // Vertical
            pointForLabel = line.start.y > line.end.y ? line.start : line.end;
            if (pointForLabel.y < PERSPECTIVE.baseFontSize * 2 && (line.start.y < line.end.y ? line.start : line.end).y > pointForLabel.y) {
                pointForLabel = line.start.y < line.end.y ? line.start : line.end;
            }
            fontSize = PERSPECTIVE.baseFontSize * 0.9;
            labelX = pointForLabel.x;
            labelY = Math.max(line.start.y, line.end.y) + PERSPECTIVE.labelOffsetFromLine; 
            
            if (labelY > VIEWPORT.height - PERSPECTIVE.baseFontSize / 2) labelY = Math.max(line.start.y, line.end.y) - PERSPECTIVE.labelOffsetFromLine;
            if (labelY < PERSPECTIVE.baseFontSize) labelY = PERSPECTIVE.baseFontSize;

            if ((worldValue === 0 || worldValue === (WORLD.size - 1) || Math.abs(WORLD.player.x - worldValue) <=3 ) && // Show more vertical labels near player
               (labelX > PERSPECTIVE.labelOffsetFromLine / 2 && labelX < VIEWPORT.width - PERSPECTIVE.labelOffsetFromLine / 2 &&
                labelY > PERSPECTIVE.baseFontSize / 2 && labelY < VIEWPORT.height - PERSPECTIVE.baseFontSize / 2 )) {
                svgElement.appendChild(createSVGElement('text', {
                    x: labelX, y: labelY, class: 'grid-label',
                    style: `font-size: ${fontSize.toFixed(1)}px;`
                })).textContent = String(worldValue);
            }
        }
    });
    updateDebugInfo();
}

function updateDebugInfo() {
    debugInfo.innerHTML = `
        Player: (${WORLD.player.x.toFixed(1)}, ${WORLD.player.y.toFixed(1)})<br>
        FocalLen: ${PERSPECTIVE.focalLength.toFixed(0)} | EyeH: ${PERSPECTIVE.eyeHeight.toFixed(1)}<br>
        NearClip: ${PERSPECTIVE.nearClipZ.toFixed(1)} | RoomH: ${WORLD.roomHeight.toFixed(1)}<br>
        GridLines Drawn: ${ROOM_GEOMETRY.projectedGridLines.length}
    `;
}

// ========================================
// MOVEMENT AND INTERACTION (Wall Proximity Offset applied)
// ========================================
function movePlayer(direction) {
    let newX = WORLD.player.x;
    let newY = WORLD.player.y;
    const WPO = WORLD.wallProximityOffset;
    const wMax = WORLD.size - 1;

    switch(direction) {
        case 'forward': newY -= 1; break;
        case 'back':    newY += 1; break;
        case 'left':    newX -= 1; break;
        case 'right':   newX += 1; break;
    }

    newX = clamp(newX, WPO, wMax - WPO);
    newY = clamp(newY, WPO, wMax - WPO);

    if (Math.abs(newX - WORLD.player.x) > 0.01 || Math.abs(newY - WORLD.player.y) > 0.01) { // Check for actual change
        WORLD.player.x = newX;
        WORLD.player.y = newY;
        calculateProjectedGeometry();
        renderScene();
        updatePositionDisplay();
        addMovementFeedback(direction);
    }
}

// ========================================
// EVENT LISTENERS & INITIALIZATION (Same as before)
// ========================================
// ... (rest of the script: addMovementFeedback, setupEventListeners, handleKeyDown, handleResize, initializeDOM, initializeWorld, initializeApp) ...
// (No changes to these functions from the previous full script provided in V6 response)

function addMovementFeedback(direction) {
    const button = navButtons[direction];
    if (button) {
        button.classList.add('nav-btn-active-feedback');
        setTimeout(() => { button.classList.remove('nav-btn-active-feedback'); }, 100);
    }
}

function setupEventListeners() {
    navButtons.forward.addEventListener('click', () => movePlayer('forward'));
    navButtons.left.addEventListener('click', () => movePlayer('left'));
    navButtons.right.addEventListener('click', () => movePlayer('right'));
    navButtons.back.addEventListener('click', () => movePlayer('back'));
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', debounce(handleResize, 250));
}

function handleKeyDown(event) {
    switch(event.key) {
        case 'ArrowUp': case 'w': case 'W': event.preventDefault(); movePlayer('forward'); break;
        case 'ArrowDown': case 's': case 'S': event.preventDefault(); movePlayer('back'); break;
        case 'ArrowLeft': case 'a': case 'A': event.preventDefault(); movePlayer('left'); break;
        case 'ArrowRight': case 'd': case 'D': event.preventDefault(); movePlayer('right'); break;
    }
}

function handleResize() {
    calculateProjectedGeometry();
    renderScene();
}

function initializeDOM() {
    svgElement = document.getElementById('space-svg');
    positionText = document.getElementById('position-text');
    debugInfo = document.getElementById('debug-info');
    navButtons = {
        forward: document.getElementById('nav-forward'),
        left: document.getElementById('nav-left'),
        right: document.getElementById('nav-right'),
        back: document.getElementById('nav-back')
    };
}

function initializeWorld() {
    WORLD.player.x = WORLD.center;
    WORLD.player.y = WORLD.center;
    calculateProjectedGeometry();
}

function initializeApp() {
    initializeDOM();
    initializeWorld();
    setupEventListeners();
    updatePositionDisplay();
    renderScene();
    console.log(`Unified Perspective SVG Space V7 Initialized. Player: (${WORLD.player.x}, ${WORLD.player.y})`);
}

document.addEventListener('DOMContentLoaded', initializeApp);