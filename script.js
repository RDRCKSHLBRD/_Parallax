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
    roomHeight: 4.0,  // Slightly increased again for a bit more vertical space
    floorLevelY: 0,
    wallProximityOffset: 0.5 // <<< NEW: Player stops this far from the actual wall coordinate
};

const VIEWPORT = {
    width: 800,
    height: 600,
    centerX: 400,
    centerY: 300
};

const PERSPECTIVE = {
    focalLength: 300,   // Maintained from good visual
    eyeHeight: 1.2,     // Maintained
    nearClipZ: 0.25,    // Maintained
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

    // Define 3D corner points with consistent IDs
    const floorCorners3D = [
        { id: 'fl_far_l', x: 0, y: fLevel, z: 0 }, { id: 'fl_far_r', x: wMax, y: fLevel, z: 0 },
        { id: 'fl_near_r', x: wMax, y: fLevel, z: wMax }, { id: 'fl_near_l', x: 0, y: fLevel, z: wMax }
    ];
    const ceilingCorners3D = [
        { id: 'cl_far_l', x: 0, y: fLevel + rHeight, z: 0 }, { id: 'cl_far_r', x: wMax, y: fLevel + rHeight, z: 0 },
        { id: 'cl_near_r', x: wMax, y: fLevel + rHeight, z: wMax }, { id: 'cl_near_l', x: 0, y: fLevel + rHeight, z: wMax }
    ];

    // Store all projected points, even if null, mapping by ID for easier wall construction
    const allProjectedPoints = {};
    floorCorners3D.forEach(p => allProjectedPoints[p.id] = projectToScreen(p.x, p.y, p.z));
    ceilingCorners3D.forEach(p => allProjectedPoints[p.id] = projectToScreen(p.x, p.y, p.z));

    ROOM_GEOMETRY.projectedFloorCorners = [
        allProjectedPoints['fl_far_l'], allProjectedPoints['fl_far_r'],
        allProjectedPoints['fl_near_r'], allProjectedPoints['fl_near_l']
    ];
    ROOM_GEOMETRY.projectedCeilingCorners = [
        allProjectedPoints['cl_far_l'], allProjectedPoints['cl_far_r'],
        allProjectedPoints['cl_near_r'], allProjectedPoints['cl_near_l']
    ];

    // Define Walls using the consistently ordered projected points
    ROOM_GEOMETRY.projectedWalls.north = [
        allProjectedPoints['fl_far_l'], allProjectedPoints['fl_far_r'],
        allProjectedPoints['cl_far_r'], allProjectedPoints['cl_far_l']
    ];
    ROOM_GEOMETRY.projectedWalls.west = [ // Near-Left Floor, Far-Left Floor, Far-Left Ceiling, Near-Left Ceiling
        allProjectedPoints['fl_near_l'], allProjectedPoints['fl_far_l'],
        allProjectedPoints['cl_far_l'], allProjectedPoints['cl_near_l']
    ];
    ROOM_GEOMETRY.projectedWalls.east = [ // Near-Right Floor, Far-Right Floor, Far-Right Ceiling, Near-Right Ceiling
        allProjectedPoints['fl_near_r'], allProjectedPoints['fl_far_r'],
        allProjectedPoints['cl_far_r'], allProjectedPoints['cl_near_r']
    ];

    // Calculate 2D Grid Lines
    ROOM_GEOMETRY.projectedGridLines = [];
    const numGridLines = WORLD.size;

    for (let i = 0; i < numGridLines; i++) { // Horizontal lines (Z-depth)
        const worldZ = i;
        const p1_h = projectToScreen(0, fLevel, worldZ);
        const p2_h = projectToScreen(wMax, fLevel, worldZ);
        if (p1_h && p2_h) {
            ROOM_GEOMETRY.projectedGridLines.push({ start: p1_h, end: p2_h, worldValue: i, type: 'horizontal', avgDepth: (p1_h.depth + p2_h.depth) / 2 });
        }
    }
    for (let i = 0; i < numGridLines; i++) { // Vertical lines (X-width)
        const worldX = i;
        const p1_v = projectToScreen(worldX, fLevel, 0);    // Far end
        const p2_v = projectToScreen(worldX, fLevel, wMax); // Near end
        
        if (p1_v && p2_v) { // Strict: Both ends must be visible
            ROOM_GEOMETRY.projectedGridLines.push({ start: p1_v, end: p2_v, worldValue: i, type: 'vertical', avgDepth: (p1_v.depth + p2_v.depth) / 2 });
        }
        // More lenient: if far end is visible, try to draw towards near clip plane
        else if (p1_v && !p2_v) {
            // Project a point just in front of the near clip plane along the line's intended path
            const nearClipWorldZ = WORLD.player.y - (PERSPECTIVE.nearClipZ + 0.01);
            if (nearClipWorldZ < wMax && nearClipWorldZ > 0) { // Check if this Z is within world bounds
                 const p2_v_clipped = projectToScreen(worldX, fLevel, nearClipWorldZ);
                 if (p2_v_clipped) {
                    ROOM_GEOMETRY.projectedGridLines.push({ start: p1_v, end: p2_v_clipped, worldValue: i, type: 'vertical', avgDepth: (p1_v.depth + p2_v_clipped.depth) / 2 });
                 }
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
    positionText.textContent = `${WORLD.player.x.toFixed(1)},${WORLD.player.y.toFixed(1)}`; // Show decimals for proximity
}

function clearSVG() {
    while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);
}

function renderScene() {
    clearSVG();
    const drawOrder = [];
    const labelsToDraw = [];

    const addShapeToDrawOrder = (shapeType, points, cssClass, depth, isClosed = true) => {
        const validPoints = points.filter(p => p !== null);
        if (validPoints.length >= (isClosed ? 3 : 2)) {
            drawOrder.push({
                type: 'path',
                d: pointsToPathString(points, isClosed),
                class: cssClass,
                depth: depth
            });
        }
    };
    
    // Add shapes to draw order
    addShapeToDrawOrder('floor', ROOM_GEOMETRY.projectedFloorCorners, 'room-floor', Infinity, true);
    addShapeToDrawOrder('northWall', ROOM_GEOMETRY.projectedWalls.north, 'room-wall-back', WORLD.player.y - 0, true); // Depth to Z=0
    addShapeToDrawOrder('westWall', ROOM_GEOMETRY.projectedWalls.west, 'room-wall-left', Math.abs(WORLD.player.x - 0) + Math.abs(WORLD.player.y - (WORLD.size-1)/2), true);
    addShapeToDrawOrder('eastWall', ROOM_GEOMETRY.projectedWalls.east, 'room-wall-right', Math.abs(WORLD.player.x - (WORLD.size-1)) + Math.abs(WORLD.player.y - (WORLD.size-1)/2), true);
    addShapeToDrawOrder('ceiling', ROOM_GEOMETRY.projectedCeilingCorners, 'room-ceiling', -Infinity, true);


    ROOM_GEOMETRY.projectedGridLines.forEach(line => {
        drawOrder.push({ type: 'line', x1: line.start.x, y1: line.start.y, x2: line.end.x, y2: line.end.y, class: 'grid-line', depth: line.avgDepth, labelInfo: { worldValue: line.worldValue, type: line.type, line: line } });
    });
    
    drawOrder.sort((a, b) => b.depth - a.depth); // Furthest first

    drawOrder.forEach(item => {
        if (item.type === 'path') {
            svgElement.appendChild(createSVGElement('path', { d: item.d, class: item.class }));
        } else if (item.type === 'line') {
            svgElement.appendChild(createSVGElement('line', { x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2, class: item.class }));
            if (item.labelInfo) labelsToDraw.push(item.labelInfo);
        }
    });

    // Draw labels on top
    labelsToDraw.forEach(info => {
        const {worldValue, type, line} = info;
        // Ensure line start/end points are valid before trying to use them
        if (!line.start || !line.end) return;

        let fontSize, labelX, labelY, pointForLabel;

        if (type === 'horizontal') {
            const depthForFontScale = Math.max(PERSPECTIVE.nearClipZ + 0.1, line.avgDepth);
            fontSize = PERSPECTIVE.baseFontSize * (PERSPECTIVE.focalLength / (PERSPECTIVE.focalLength + depthForFontScale * 1.3));
            fontSize = clamp(fontSize, 5, PERSPECTIVE.baseFontSize * 1.5);
            
            const lineMidXProjected = (line.start.x + line.end.x) / 2;
            const lineOnLeft = lineMidXProjected < VIEWPORT.centerX;

            if(lineOnLeft) {
                 labelX = line.start.x - PERSPECTIVE.labelOffsetFromLine;
            } else {
                 labelX = line.end.x + PERSPECTIVE.labelOffsetFromLine;
            }
            labelY = (line.start.y + line.end.y) / 2; // Center Y of the line

            if ((worldValue === 0 || worldValue === (WORLD.size - 1) || fontSize > 6) &&
                (labelX > 5 && labelX < VIEWPORT.width - 5 && labelY > 20 && labelY < VIEWPORT.height - 20)) {
                svgElement.appendChild(createSVGElement('text', {
                    x: labelX, y: labelY, class: 'grid-label',
                    style: `font-size: ${fontSize.toFixed(1)}px; text-anchor: ${lineOnLeft ? 'end' : 'start'};`
                })).textContent = String(worldValue);
            }
        } else { // Vertical
            pointForLabel = line.start.y > line.end.y ? line.start : line.end; // Closer (larger Y) end
            if (pointForLabel.y < PERSPECTIVE.baseFontSize * 2 && (line.start.y < line.end.y ? line.start : line.end).y > pointForLabel.y) {
                pointForLabel = line.start.y < line.end.y ? line.start : line.end;
            }

            fontSize = PERSPECTIVE.baseFontSize * 0.9;
            labelX = pointForLabel.x;
            // Place label below the "closest" screen point of the vertical line
            labelY = Math.max(pointForLabel.y, line.end.y) + PERSPECTIVE.labelOffsetFromLine; 
            
            if (labelY > VIEWPORT.height - PERSPECTIVE.baseFontSize / 2) labelY = Math.max(pointForLabel.y, line.end.y) - PERSPECTIVE.labelOffsetFromLine;
            if (labelY < PERSPECTIVE.baseFontSize) labelY = PERSPECTIVE.baseFontSize;

            if ((worldValue === 0 || worldValue === (WORLD.size - 1) || Math.abs(WORLD.player.x - worldValue) <=2 ||
               (labelX > PERSPECTIVE.labelOffsetFromLine && labelX < VIEWPORT.width - PERSPECTIVE.labelOffsetFromLine))) {
                // Only draw if label is reasonably on screen
                if (labelY > PERSPECTIVE.baseFontSize && labelY < VIEWPORT.height - PERSPECTIVE.baseFontSize/2 &&
                    labelX > 0 && labelX < VIEWPORT.width) {
                     svgElement.appendChild(createSVGElement('text', {
                        x: labelX, y: labelY, class: 'grid-label',
                        style: `font-size: ${fontSize.toFixed(1)}px;`
                    })).textContent = String(worldValue);
                }
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
// MOVEMENT AND INTERACTION
// ========================================
function movePlayer(direction) {
    let newX = WORLD.player.x;
    let newY = WORLD.player.y;
    const WPO = WORLD.wallProximityOffset; // Wall Proximity Offset
    const wMax = WORLD.size - 1;

    switch(direction) {
        case 'forward': newY -= 1; break;
        case 'back':    newY += 1; break;
        case 'left':    newX -= 1; break;
        case 'right':   newX += 1; break;
    }

    // Apply wall proximity clamping
    newX = clamp(newX, WPO, wMax - WPO);
    newY = clamp(newY, WPO, wMax - WPO);

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
    console.log(`Unified Perspective SVG Space V6 Initialized. Player: (${WORLD.player.x}, ${WORLD.player.y})`);
}

document.addEventListener('DOMContentLoaded', initializeApp);