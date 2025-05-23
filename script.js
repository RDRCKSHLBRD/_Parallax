// ========================================
// GLOBALS - Unified Perspective System
// ========================================

const WORLD = {
    size: 11,
    center: 5,
    player: {
        x: 0, // Will be set in initializeWorld
        y: 0  // Will be set in initializeWorld
    },
    roomHeight: 5.0,  // As per your preference
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
    focalLength: 270,   // From your script that produced the (0.5, 5.0) screenshot
    eyeHeight: 1.25,    // From your script
    nearClipZ: 0.2,     // From your script
    baseFontSize: 12,
    fontPerspectiveFactor: 0.8,
    labelOffsetFromLine: 15
};

const ROOM_GEOMETRY = {
    floor: [],
    ceiling: [],
    walls: { north: [], east: [], west: [] },
    projectedGridLines: []
};

// ========================================
// DOM ELEMENTS
// ========================================
let svgElement;
let positionText;
let debugInfo;
let navButtons;

// ========================================
// UTILITIES
// ========================================
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function createSVGElement(tag, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null) {
            element.setAttribute(key, String(value));
        }
    }
    return element;
}

// ========================================
// PERSPECTIVE PROJECTION
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
    const zNearEffective = WORLD.player.y - (PERSPECTIVE.nearClipZ + 0.01); // Plane just beyond nearClipZ

    // Define 3D corner points
    const worldPoints3D = {
        // Far plane (Z=0)
        far_fl_l: { x: 0,    y: fLevel,           z: 0 },
        far_fl_r: { x: wMax, y: fLevel,           z: 0 },
        far_cl_l: { x: 0,    y: fLevel + rHeight, z: 0 },
        far_cl_r: { x: wMax, y: fLevel + rHeight, z: 0 },
        // Near plane (at zNearEffective - ensure it's in front of far plane)
        near_fl_l: zNearEffective > 0 ? { x: 0,    y: fLevel,           z: zNearEffective } : null,
        near_fl_r: zNearEffective > 0 ? { x: wMax, y: fLevel,           z: zNearEffective } : null,
        near_cl_l: zNearEffective > 0 ? { x: 0,    y: fLevel + rHeight, z: zNearEffective } : null,
        near_cl_r: zNearEffective > 0 ? { x: wMax, y: fLevel + rHeight, z: zNearEffective } : null,
    };

    // Project all defined 3D points
    const p = {}; // Projected points
    for (const id in worldPoints3D) {
        if (worldPoints3D[id]) { // If the 3D point definition exists (near points might be null)
            p[id] = projectToScreen(worldPoints3D[id].x, worldPoints3D[id].y, worldPoints3D[id].z);
        } else {
            p[id] = null;
        }
    }

    // Define polygons based on these projected points
    // Order: FarLeft, FarRight, NearRight, NearLeft (clockwise from top-down view of floor)
    ROOM_GEOMETRY.floor   = [p.far_fl_l, p.far_fl_r, p.near_fl_r, p.near_fl_l];
    ROOM_GEOMETRY.ceiling = [p.far_cl_l, p.far_cl_r, p.near_cl_r, p.near_cl_l];

    // Walls - ensure correct vertex order for visible faces
    ROOM_GEOMETRY.walls.north = [p.far_fl_l, p.far_fl_r, p.far_cl_r, p.far_cl_l];
    ROOM_GEOMETRY.walls.west  = [p.near_fl_l, p.far_fl_l, p.far_cl_l, p.near_cl_l]; // Order: NearBottom, FarBottom, FarTop, NearTop
    ROOM_GEOMETRY.walls.east  = [p.near_fl_r, p.far_fl_r, p.far_cl_r, p.near_cl_r]; // Order: NearBottom, FarBottom, FarTop, NearTop


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
        const p_far_v = projectToScreen(worldX, fLevel, 0);
        let p_near_v = null;
        
        // Try projecting near end to zNearEffective first, if valid
        if (zNearEffective > 0 && zNearEffective < wMax) { // Ensure zNearEffective is within world grid depth (not beyond far or original near)
             p_near_v = projectToScreen(worldX, fLevel, zNearEffective);
        }
        // Fallback: If zNearEffective didn't yield a point OR wasn't applicable, try projecting to actual world near edge Z=wMax
        // This is important if player is very far back, making zNearEffective also very far back or even behind Z=0.
        if (!p_near_v) {
            p_near_v = projectToScreen(worldX, fLevel, wMax); 
        }

        if (p_far_v && p_near_v) {
            ROOM_GEOMETRY.projectedGridLines.push({ start: p_far_v, end: p_near_v, worldValue: i, type: 'vertical', avgDepth: (p_far_v.depth + p_near_v.depth) / 2 });
        }
    }
    ROOM_GEOMETRY.projectedGridLines.sort((a, b) => b.avgDepth - a.avgDepth);
}


function pointsToPathString(pointsArray, closePath = false) {
    const validPoints = pointsArray.filter(p => p !== null);
    const minPointsNeeded = closePath ? 3 : 2;
    if (validPoints.length < minPointsNeeded) return '';

    let path = `M ${validPoints[0].x.toFixed(2)} ${validPoints[0].y.toFixed(2)}`;
    for (let i = 1; i < validPoints.length; i++) {
        path += ` L ${validPoints[i].x.toFixed(2)} ${validPoints[i].y.toFixed(2)}`;
    }
    if (closePath) {
        path += ' Z';
    }
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
        const pathData = pointsToPathString(points, isClosed);
        if (pathData) {
            drawOrder.push({ type: 'path', d: pathData, class: cssClass, depth: depth });
        }
    };
    
    const wMax = WORLD.size -1;
    const zNearForSort = Math.max(0, WORLD.player.y - PERSPECTIVE.nearClipZ - 0.01);
    const avgSideWallDepth = WORLD.player.y - ( (0 + zNearForSort) / 2 );

    addShapeToDrawOrder(ROOM_GEOMETRY.floor, 'room-floor', Infinity, true);
    addShapeToDrawOrder(ROOM_GEOMETRY.walls.north, 'room-wall-back', WORLD.player.y - 0 + 100, true);
    addShapeToDrawOrder(ROOM_GEOMETRY.walls.west, 'room-wall-left', avgSideWallDepth + Math.abs(WORLD.player.x - 0), true);
    addShapeToDrawOrder(ROOM_GEOMETRY.walls.east, 'room-wall-right', avgSideWallDepth + Math.abs(WORLD.player.x - wMax), true);
    
    ROOM_GEOMETRY.projectedGridLines.forEach(line => {
        if (line.start && line.end) {
            drawOrder.push({
                type: 'line',
                x1: line.start.x, y1: line.start.y, x2: line.end.x, y2: line.end.y,
                class: 'grid-line', depth: line.avgDepth,
                labelInfo: { worldValue: line.worldValue, type: line.type, line: line }
            });
        }
    });
    
    addShapeToDrawOrder(ROOM_GEOMETRY.ceiling, 'room-ceiling', -Infinity, true);

    drawOrder.sort((a, b) => b.depth - a.depth);

    drawOrder.forEach(item => {
        let element = null;
        const itemClass = (typeof item.class === 'string' && item.class) ? item.class : 'unknown-svg-element';

        if (item.type === 'path') {
            if (item.d) {
                element = createSVGElement('path', { d: item.d, class: itemClass });
            }
        } else if (item.type === 'line') {
            element = createSVGElement('line', {
                x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2, class: itemClass
            });
            if (element && item.labelInfo) {
                labelsToDraw.push(item.labelInfo);
            }
        }

        if (element) {
            try {
                 svgElement.appendChild(element);
            } catch (e) {
                console.error("Error appending element in drawOrder loop:", element, "Item:", item, "Error:", e);
            }
        }
    });

    // Draw labels
    labelsToDraw.forEach(info => {
        const {worldValue, type, line} = info;
        if (!line || !line.start || !line.end) return;
        let fontSize, labelX, labelY, pointForLabel;

        if (type === 'horizontal') {
            const depthForFontScale = Math.max(PERSPECTIVE.nearClipZ + 0.05, line.avgDepth);
            fontSize = PERSPECTIVE.baseFontSize * (PERSPECTIVE.focalLength / (PERSPECTIVE.focalLength + depthForFontScale * 1.5));
            fontSize = clamp(fontSize, 5.5, PERSPECTIVE.baseFontSize * 1.6);
            
            const lineMidXProjected = (line.start.x + line.end.x) / 2;
            const anchorLeft = line.start.x < VIEWPORT.centerX || lineMidXProjected < VIEWPORT.centerX - 30;
            
            pointForLabel = anchorLeft ? line.start : line.end;
             if (!pointForLabel) pointForLabel = line.start || line.end; 
             if (!pointForLabel) return; 

            labelX = pointForLabel.x + (anchorLeft ? -PERSPECTIVE.labelOffsetFromLine : PERSPECTIVE.labelOffsetFromLine);
            labelY = (line.start.y + line.end.y) / 2;

            const showLabelHorizontal = worldValue % Math.max(1, Math.floor((WORLD.size-1)/10)) === 0 ||
                                      worldValue === 0 || worldValue === (WORLD.size -1) || fontSize > 7.0;

            if (showLabelHorizontal && (labelX > 5 && labelX < VIEWPORT.width - 5 && labelY > 20 && labelY < VIEWPORT.height - 20)) {
                svgElement.appendChild(createSVGElement('text', {
                    x: labelX, y: labelY, class: 'grid-label',
                    style: `font-size: ${fontSize.toFixed(1)}px; text-anchor: ${anchorLeft ? 'end' : 'start'};`
                })).textContent = String(worldValue);
            }
        } else { // Vertical
            pointForLabel = line.start.y > line.end.y ? line.start : line.end; 
            if (!pointForLabel || (pointForLabel.y < PERSPECTIVE.baseFontSize * 2 && (line.start.y < line.end.y ? line.start : line.end).y > pointForLabel.y)) {
                pointForLabel = line.start.y < line.end.y ? line.start : line.end;
            }
            if (!pointForLabel) return;

            fontSize = PERSPECTIVE.baseFontSize * 0.95;
            labelX = pointForLabel.x;
            labelY = Math.max(line.start.y, line.end.y) + PERSPECTIVE.labelOffsetFromLine; 
            
            if (labelY > VIEWPORT.height - PERSPECTIVE.baseFontSize / 2 || pointForLabel.y > VIEWPORT.height - PERSPECTIVE.labelOffsetFromLine * 1.5) {
                 labelY = Math.min(line.start.y, line.end.y) - PERSPECTIVE.labelOffsetFromLine;
            }
            labelY = clamp(labelY, PERSPECTIVE.baseFontSize, VIEWPORT.height - PERSPECTIVE.baseFontSize / 2);

            const showLabelVertical = worldValue % Math.max(1, Math.floor((WORLD.size-1)/10)) === 0 ||
                                      worldValue === 0 || worldValue === (WORLD.size -1) ||
                                      Math.abs(WORLD.player.x - worldValue) <=2;

            if (showLabelVertical &&
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
        GridLines Drawn: ${ROOM_GEOMETRY.projectedGridLines.filter(l => l.start && l.end).length}
    `;
}

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

    if (Math.abs(newX - WORLD.player.x) > 0.001 || Math.abs(newY - WORLD.player.y) > 0.001) {
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
    const wMax = WORLD.size - 1; // This is 10 for WORLD.size = 11
    const WPO = WORLD.wallProximityOffset;

    // Start at Cell 120: worldX = 9, worldZ = 10 (wMax)
    // Player's logical X can be centered in the cell, or offset if preferred.
    // For now, center of X=9 cell column.
    WORLD.player.x = 9.0;
    // Player's logical Y (depth) is offset from the Z=10 wall.
    WORLD.player.y = wMax - WPO; // e.g., 10 - 0.5 = 9.5

    calculateProjectedGeometry();
}

function initializeApp() {
    initializeDOM();
    initializeWorld();
    setupEventListeners();
    updatePositionDisplay();
    renderScene();
    console.log(`Unified Perspective SVG Space (V11 - Start at Cell 120) Initialized. Player: (${WORLD.player.x}, ${WORLD.player.y})`);
}
document.addEventListener('DOMContentLoaded', initializeApp);