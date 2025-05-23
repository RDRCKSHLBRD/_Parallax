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
    roomHeight: 4.5,  // <<< INCREASED WALL HEIGHT FURTHER
    floorLevelY: 0
};

const VIEWPORT = {
    width: 800,
    height: 600,
    centerX: 400,
    centerY: 300
};

const PERSPECTIVE = {
    focalLength: 290,   // Slightly adjusted based on taller room potentially
    eyeHeight: 1.3,     // Adjusted slightly with taller room
    nearClipZ: 0.25,    // Adjusted slightly
    baseFontSize: 12,
    fontPerspectiveFactor: 0.85,
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
// DOM ELEMENTS ( 그대로 유지 // Same as before )
// ========================================
let svgElement;
let positionText;
let debugInfo;
let navButtons;

// ========================================
// UTILITIES ( 그대로 유지 // Same as before )
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
// UNIFIED PERSPECTIVE PROJECTION ( 그대로 유지 // Same as before )
// ========================================
function projectToScreen(worldX, worldY_height, worldZ_depth) {
    const cameraX = WORLD.player.x;
    const cameraY_height = PERSPECTIVE.eyeHeight;
    const cameraZ_depth = WORLD.player.y;

    const relativeX = worldX - cameraX;
    const relativeY = worldY_height - cameraY_height;
    let effectiveDepth = cameraZ_depth - worldZ_depth;

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

    const floorCorners3D = [
        { id: 'fl_far_l', x: 0, y: fLevel, z: 0 }, { id: 'fl_far_r', x: wMax, y: fLevel, z: 0 },
        { id: 'fl_near_r', x: wMax, y: fLevel, z: wMax }, { id: 'fl_near_l', x: 0, y: fLevel, z: wMax }
    ];
    const ceilingCorners3D = [
        { id: 'cl_far_l', x: 0, y: fLevel + rHeight, z: 0 }, { id: 'cl_far_r', x: wMax, y: fLevel + rHeight, z: 0 },
        { id: 'cl_near_r', x: wMax, y: fLevel + rHeight, z: wMax }, { id: 'cl_near_l', x: 0, y: fLevel + rHeight, z: wMax }
    ];

    ROOM_GEOMETRY.projectedFloorCorners = floorCorners3D.map(p => projectToScreen(p.x, p.y, p.z));
    ROOM_GEOMETRY.projectedCeilingCorners = ceilingCorners3D.map(p => projectToScreen(p.x, p.y, p.z));

    const getP = (id, type) => {
        const sourceArray = type === 'floor' ? floorCorners3D : ceilingCorners3D;
        const projectedArray = type === 'floor' ? ROOM_GEOMETRY.projectedFloorCorners : ROOM_GEOMETRY.projectedCeilingCorners;
        const index = sourceArray.findIndex(p => p.id === id);
        return (index !== -1) ? projectedArray[index] : null;
    };

    const p_fl_far_l = getP('fl_far_l', 'floor');
    const p_fl_far_r = getP('fl_far_r', 'floor');
    const p_cl_far_l = getP('cl_far_l', 'ceiling');
    const p_cl_far_r = getP('cl_far_r', 'ceiling');
    ROOM_GEOMETRY.projectedWalls.north = [p_fl_far_l, p_fl_far_r, p_cl_far_r, p_cl_far_l];

    const p_fl_near_l = getP('fl_near_l', 'floor');
    const p_cl_near_l = getP('cl_near_l', 'ceiling');
    ROOM_GEOMETRY.projectedWalls.west = [p_fl_near_l, p_fl_far_l, p_cl_far_l, p_cl_near_l];

    const p_fl_near_r = getP('fl_near_r', 'floor');
    const p_cl_near_r = getP('cl_near_r', 'ceiling');
    ROOM_GEOMETRY.projectedWalls.east = [p_fl_near_r, p_fl_far_r, p_cl_far_r, p_cl_near_r];

    ROOM_GEOMETRY.projectedGridLines = [];
    const numGridLines = WORLD.size;

    for (let i = 0; i < numGridLines; i++) {
        const worldZ = i;
        const p1_h = projectToScreen(0, fLevel, worldZ);
        const p2_h = projectToScreen(wMax, fLevel, worldZ);
        if (p1_h && p2_h) {
            ROOM_GEOMETRY.projectedGridLines.push({ start: p1_h, end: p2_h, worldValue: i, type: 'horizontal', avgDepth: (p1_h.depth + p2_h.depth) / 2 });
        }
    }
    for (let i = 0; i < numGridLines; i++) {
        const worldX = i;
        const p1_v = projectToScreen(worldX, fLevel, 0);     // Far end of vertical line
        let p2_v = projectToScreen(worldX, fLevel, wMax);  // Near end of vertical line

        if (p1_v) { // If the far point is visible, we'll try to draw the line
            if (!p2_v) {
                // If near point is clipped, estimate its position at the bottom of the viewport
                // This is a simplification for visibility. A true 3D clip would be more complex.
                // Project a point very slightly in front of the near clip plane along the line's direction
                const nearClipWorldZ = WORLD.player.y - (PERSPECTIVE.nearClipZ + 0.01);
                if (nearClipWorldZ < wMax && nearClipWorldZ > 0) { // Ensure it's within world bounds
                     p2_v = projectToScreen(worldX, fLevel, nearClipWorldZ);
                }
                // If still null, or we want to force it to screen edge:
                if (!p2_v) {
                    // Estimate X at bottom based on p1_v and vanishing point for a crude line extension
                    const vpX = VIEWPORT.centerX; // Assuming vanishing point X is center for this crude extension
                    const slope = (VIEWPORT.height - p1_v.y) / ( (p1_v.x - vpX) !== 0 ? (p1_v.x - vpX) : 0.0001); // Avoid div by zero
                    let xAtBottom = p1_v.x - (p1_v.y - VIEWPORT.height) / slope;
                     xAtBottom = clamp(xAtBottom, -VIEWPORT.width, VIEWPORT.width * 2); // Clamp to avoid extreme values
                    p2_v = { x: xAtBottom, y: VIEWPORT.height - 1, depth: PERSPECTIVE.nearClipZ };
                }
            }
            // Ensure p2_v is not null before pushing
            if (p2_v) {
                 ROOM_GEOMETRY.projectedGridLines.push({ start: p1_v, end: p2_v, worldValue: i, type: 'vertical', avgDepth: (p1_v.depth + p2_v.depth) / 2 });
            }
        }
    }
    ROOM_GEOMETRY.projectedGridLines.sort((a, b) => b.avgDepth - a.avgDepth);
}

function pointsToPathString(pointsArray, closePath = false) {
    const validPoints = pointsArray.filter(p => p !== null);
    if (validPoints.length < 2) return '';
    let path = `M ${validPoints[0].x.toFixed(2)} ${validPoints[0].y.toFixed(2)}`;
    for (let i = 1; i < validPoints.length; i++) {
        path += ` L ${validPoints[i].x.toFixed(2)} ${validPoints[i].y.toFixed(2)}`;
    }
    if (closePath && validPoints.length > 2) path += ' Z';
    return path;
}

// ========================================
// RENDERING (Includes refined label logic)
// ========================================
function updatePositionDisplay() {
    positionText.textContent = `${WORLD.player.x},${WORLD.player.y}`;
}

function clearSVG() {
    while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);
}

function renderScene() {
    clearSVG();
    const drawOrder = [];

    if (ROOM_GEOMETRY.projectedFloorCorners.filter(p => p !== null).length >= 3) {
        drawOrder.push({ type: 'path', d: pointsToPathString(ROOM_GEOMETRY.projectedFloorCorners, true), class: 'room-floor', depth: Infinity });
    }
    if (ROOM_GEOMETRY.projectedWalls.north.filter(p => p !== null).length >= 3) {
         drawOrder.push({ type: 'path', d: pointsToPathString(ROOM_GEOMETRY.projectedWalls.north, true), class: 'room-wall-back', depth: WORLD.player.y - 0 });
    }
    
    ROOM_GEOMETRY.projectedGridLines.forEach(line => {
        drawOrder.push({ type: 'line', x1: line.start.x, y1: line.start.y, x2: line.end.x, y2: line.end.y, class: 'grid-line', depth: line.avgDepth, labelInfo: { worldValue: line.worldValue, type: line.type, line: line } });
    });
    
    if (ROOM_GEOMETRY.projectedWalls.west.filter(p => p !== null).length >= 3) {
        drawOrder.push({ type: 'path', d: pointsToPathString(ROOM_GEOMETRY.projectedWalls.west, true), class: 'room-wall-left', depth: Math.abs(WORLD.player.x - 0) + Math.abs(WORLD.player.y - (WORLD.size-1)/2) }); // Depth based on player proximity
    }
    if (ROOM_GEOMETRY.projectedWalls.east.filter(p => p !== null).length >= 3) {
         drawOrder.push({ type: 'path', d: pointsToPathString(ROOM_GEOMETRY.projectedWalls.east, true), class: 'room-wall-right', depth: Math.abs(WORLD.player.x - (WORLD.size-1)) + Math.abs(WORLD.player.y - (WORLD.size-1)/2) });
    }

    if (ROOM_GEOMETRY.projectedCeilingCorners.filter(p => p !== null).length >= 3) {
         drawOrder.push({ type: 'path', d: pointsToPathString(ROOM_GEOMETRY.projectedCeilingCorners, true), class: 'room-ceiling', depth: -Infinity });
    }

    drawOrder.sort((a, b) => b.depth - a.depth);

    const labelsToDraw = [];
    drawOrder.forEach(item => {
        if (item.type === 'path') {
            svgElement.appendChild(createSVGElement('path', { d: item.d, class: item.class }));
        } else if (item.type === 'line') {
            svgElement.appendChild(createSVGElement('line', { x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2, class: item.class }));
            if (item.labelInfo) labelsToDraw.push(item.labelInfo);
        }
    });

    labelsToDraw.forEach(info => {
        const {worldValue, type, line} = info;
        let fontSize, labelX, labelY, pointForLabel;

        const onScreen = (p) => p && p.x >=0 && p.x <= VIEWPORT.width && p.y >=0 && p.y <= VIEWPORT.height;

        if (type === 'horizontal') {
            const depthForFontScale = Math.max(PERSPECTIVE.nearClipZ + 0.1, line.avgDepth);
            fontSize = PERSPECTIVE.baseFontSize * (PERSPECTIVE.focalLength / (PERSPECTIVE.focalLength + depthForFontScale * 1.2)); // Tuned factor
            fontSize = clamp(fontSize, 5.5, PERSPECTIVE.baseFontSize * 1.5);
            
            // Try to place label on the side that is more on-screen or default to left
            const lineMidX = (line.start.x + line.end.x) / 2;
            if (lineMidX < VIEWPORT.centerX && line.start.x > 0) { // Line tends left, label on left start
                 labelX = line.start.x - PERSPECTIVE.labelOffsetFromLine;
            } else if (lineMidX >= VIEWPORT.centerX && line.end.x < VIEWPORT.width){ // Line tends right, label on right end
                 labelX = line.end.x + PERSPECTIVE.labelOffsetFromLine;
            } else { // Default to left if start is on screen
                 labelX = line.start.x - PERSPECTIVE.labelOffsetFromLine;
            }
            labelY = line.start.y;

            if ((worldValue === 0 || worldValue === (WORLD.size - 1) || fontSize > 7) &&
                (labelX > 5 && labelX < VIEWPORT.width - 5 && labelY > 20 && labelY < VIEWPORT.height - 20)) {
                svgElement.appendChild(createSVGElement('text', {
                    x: labelX, y: labelY, class: 'grid-label',
                    style: `font-size: ${fontSize.toFixed(1)}px; text-anchor: middle;`
                })).textContent = String(worldValue);
            }
        } else { // Vertical
            // Determine which end of the line is closer to the bottom of the screen (larger Y)
            pointForLabel = line.start.y > line.end.y ? line.start : line.end;
            // If that point is off-screen high, use the other point.
            if (pointForLabel.y < PERSPECTIVE.baseFontSize * 2 && (line.start.y < line.end.y ? line.start : line.end).y > pointForLabel.y) {
                pointForLabel = line.start.y < line.end.y ? line.start : line.end;
            }

            fontSize = PERSPECTIVE.baseFontSize * 0.9;
            labelX = pointForLabel.x;
            labelY = pointForLabel.y + PERSPECTIVE.labelOffsetFromLine; // Place below the chosen end point
            
            // Adjust if label goes off bottom
            if (labelY > VIEWPORT.height - PERSPECTIVE.baseFontSize / 2) {
                labelY = pointForLabel.y - PERSPECTIVE.labelOffsetFromLine; // Place above if below is off-screen
            }
             if (labelY < PERSPECTIVE.baseFontSize) labelY = PERSPECTIVE.baseFontSize;


            if (worldValue === 0 || worldValue === (WORLD.size - 1) || // Always show edge labels
               (labelX > PERSPECTIVE.labelOffsetFromLine && labelX < VIEWPORT.width - PERSPECTIVE.labelOffsetFromLine &&
                labelY > PERSPECTIVE.baseFontSize && labelY < VIEWPORT.height - PERSPECTIVE.baseFontSize/2 )) { // Show if reasonably on screen
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
        Player: (${WORLD.player.x}, ${WORLD.player.y})<br>
        FocalLen: ${PERSPECTIVE.focalLength.toFixed(0)} | EyeH: ${PERSPECTIVE.eyeHeight.toFixed(1)}<br>
        NearClip: ${PERSPECTIVE.nearClipZ.toFixed(1)} | RoomH: ${WORLD.roomHeight.toFixed(1)}<br>
        GridLines Drawn: ${ROOM_GEOMETRY.projectedGridLines.length}
    `;
}

// ========================================
// MOVEMENT AND INTERACTION ( 그대로 유지 // Same as before )
// ========================================
function movePlayer(direction) {
    let newX = WORLD.player.x;
    let newY = WORLD.player.y;
    switch(direction) {
        case 'forward': newY = Math.max(0, WORLD.player.y - 1); break;
        case 'back':    newY = Math.min(WORLD.size - 1, WORLD.player.y + 1); break;
        case 'left':    newX = Math.max(0, WORLD.player.x - 1); break;
        case 'right':   newX = Math.min(WORLD.size - 1, WORLD.player.x + 1); break;
    }
    if (newX !== WORLD.player.x || newY !== WORLD.player.y) {
        WORLD.player.x = newX;
        WORLD.player.y = newY;
        calculateProjectedGeometry();
        renderScene();
        updatePositionDisplay();
        addMovementFeedback(direction);
    }
}

function addMovementFeedback(direction) {
    const button = navButtons[direction];
    if (button) {
        button.classList.add('nav-btn-active-feedback');
        setTimeout(() => { button.classList.remove('nav-btn-active-feedback'); }, 100);
    }
}

// ========================================
// EVENT LISTENERS & INITIALIZATION ( 그대로 유지 // Same as before )
// ========================================
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
    console.log(`Unified Perspective SVG Space V5 Initialized. Player: (${WORLD.player.x}, ${WORLD.player.y})`);
}

document.addEventListener('DOMContentLoaded', initializeApp);