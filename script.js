// ========================================
// GLOBALS - Fixed Perspective System
// ========================================

const WORLD = {
    size: 11,
    center: 5,
    player: {
        x: 5,
        y: 5,
        facing: 0
    }
};

const VIEWPORT = {
    width: 800,
    height: 600,
    centerX: 400,
    centerY: 300,
    horizonY: 280
};

const PERSPECTIVE = {
    vanishingPoint: { x: VIEWPORT.centerX, y: VIEWPORT.horizonY },
    baseConvergence: 0.7,
    convergenceSensitivity: 0.25,
    baseFontSize: 14,
    fontPerspectiveFactor: 0.8,
    labelOffsetFromLine: 20,
    worldXPanScale: 60,
    // New: Proper perspective parameters
    focalLength: 400,
    eyeHeight: 1.6
};

const ROOM_GEOMETRY = {
    corners: {},
    walls: [],
    floor: [],
    ceiling: [],
    gridLines: []
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
function lerp(start, end, factor) { return start + (end - start) * factor; }

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

function getPlayerOffsets() {
    return {
        x: (WORLD.player.x - WORLD.center),
        y: (WORLD.player.y - WORLD.center)
    };
}

// ========================================
// PROPER PERSPECTIVE PROJECTION FOR GRID
// ========================================

/**
 * Calculate the screen Y position for a horizontal grid line using proper perspective
 * @param {number} worldY - World Y coordinate of the grid line
 * @param {number} playerY - Current player Y position
 * @returns {number} Screen Y coordinate
 */
function calculateGridLineY(worldY, playerY) {
    // Distance from player to this grid line
    const distance = Math.abs(worldY - playerY);
    
    // Prevent division by zero for the line the player is standing on
    if (distance < 0.1) {
        return VIEWPORT.height - 50; // Very close to bottom of screen
    }
    
    // Perspective projection: closer lines appear lower on screen
    // Lines in front of player (smaller worldY) appear higher (smaller screenY)
    const relativeDepth = worldY - playerY;
    
    if (relativeDepth <= 0) {
        // Line is in front of or at player position
        const screenY = VIEWPORT.horizonY + (PERSPECTIVE.focalLength / Math.abs(relativeDepth + 0.1)) * 0.5;
        return Math.min(screenY, VIEWPORT.height - 20);
    } else {
        // Line is behind player - should not be visible in forward view
        return null;
    }
}

// ========================================
// ROOM GEOMETRY CALCULATIONS (RESTORED FROM PASTE.TXT)
// ========================================
function calculateRoomGeometry() {
    const playerOffsets = getPlayerOffsets();

    // Keep your original room convergence system
    const convergenceFactor = clamp(
        PERSPECTIVE.baseConvergence + (playerOffsets.y / WORLD.center) * PERSPECTIVE.convergenceSensitivity,
        0.2,
        0.95
    );

    // Keep your original room panning system
    const screenShiftX = playerOffsets.x * PERSPECTIVE.worldXPanScale;

    const frontLeftBase = { x: 0 - screenShiftX, y: VIEWPORT.height };
    const frontRightBase = { x: VIEWPORT.width - screenShiftX, y: VIEWPORT.height };
    const frontTopLeftBase = { x: 0 - screenShiftX, y: 0 };
    const frontTopRightBase = { x: VIEWPORT.width - screenShiftX, y: 0 };

    const vp = PERSPECTIVE.vanishingPoint;

    // Restore your working room corners
    ROOM_GEOMETRY.corners = {
        frontLeft: frontLeftBase,
        frontRight: frontRightBase,
        frontTopLeft: frontTopLeftBase,
        frontTopRight: frontTopRightBase,
        backLeft: {
            x: lerp(frontLeftBase.x, vp.x, convergenceFactor),
            y: lerp(frontLeftBase.y, vp.y, convergenceFactor)
        },
        backRight: {
            x: lerp(frontRightBase.x, vp.x, convergenceFactor),
            y: lerp(frontRightBase.y, vp.y, convergenceFactor)
        },
        backTopLeft: {
            x: lerp(frontTopLeftBase.x, vp.x, convergenceFactor),
            y: lerp(frontTopLeftBase.y, vp.y, convergenceFactor)
        },
        backTopRight: {
            x: lerp(frontTopRightBase.x, vp.x, convergenceFactor),
            y: lerp(frontTopRightBase.y, vp.y, convergenceFactor)
        }
    };

    const c = ROOM_GEOMETRY.corners;
    ROOM_GEOMETRY.floor = [c.frontLeft, c.frontRight, c.backRight, c.backLeft];
    ROOM_GEOMETRY.ceiling = [c.frontTopLeft, c.frontTopRight, c.backTopRight, c.backTopLeft];
    ROOM_GEOMETRY.walls = {
        left: [c.frontLeft, c.backLeft, c.backTopLeft, c.frontTopLeft],
        right: [c.frontRight, c.frontTopRight, c.backTopRight, c.backRight],
        back: [c.backLeft, c.backRight, c.backTopRight, c.backTopLeft]
    };

    // Now calculate grid lines - IMPROVED for square room
    calculateGridLines();
}

/**
 * Calculate grid lines - IMPROVED to represent actual 11x11 square floor tiles
 */
function calculateGridLines() {
    ROOM_GEOMETRY.gridLines = [];
    const { frontLeft, frontRight, backLeft, backRight } = ROOM_GEOMETRY.corners;
    const numGridLines = WORLD.size;

    // Horizontal lines (depth lines) - WITH PROPER PERSPECTIVE
    // These represent the boundaries between rows of floor tiles
    for (let i = 0; i < numGridLines; i++) {
        const worldY = i; // World Y coordinates from 0 to 10
        
        // Use proper perspective calculation for Y position
        const perspectiveY = calculateGridLineY(worldY, WORLD.player.y);
        
        if (perspectiveY !== null && perspectiveY >= VIEWPORT.horizonY && perspectiveY <= VIEWPORT.height) {
            // Calculate X positions based on perspective Y
            const depthFactor = (perspectiveY - VIEWPORT.horizonY) / (VIEWPORT.height - VIEWPORT.horizonY);
            
            const x_start = lerp(backLeft.x, frontLeft.x, depthFactor);
            const x_end = lerp(backRight.x, frontRight.x, depthFactor);

            ROOM_GEOMETRY.gridLines.push({
                type: 'horizontal',
                start: { x: x_start, y: perspectiveY },
                end: { x: x_end, y: perspectiveY },
                worldValue: worldY,
                depth: WORLD.player.y - worldY
            });
        }
    }

    // Vertical lines (width lines) - IMPROVED to represent actual tile columns
    // These represent the boundaries between columns of floor tiles
    for (let i = 0; i < numGridLines; i++) {
        const worldX = i; // World X coordinates from 0 to 10
        
        // Calculate the lateral offset based on player's X position
        // This makes the grid actually correspond to the 11x11 floor tiles
        const playerXOffset = (WORLD.player.x - WORLD.center) * PERSPECTIVE.worldXPanScale;
        const tileXOffset = (worldX - WORLD.center) * PERSPECTIVE.worldXPanScale;
        const relativeXOffset = tileXOffset - playerXOffset;
        
        // Calculate the screen X position for this grid line
        const w_norm = (worldX) / (numGridLines - 1);
        const x_front = lerp(frontLeft.x, frontRight.x, w_norm) + relativeXOffset;
        const x_back = lerp(backLeft.x, backRight.x, w_norm) + relativeXOffset;
        
        // Only draw lines that are visible on screen
        if (x_front > -100 && x_front < VIEWPORT.width + 100) {
            ROOM_GEOMETRY.gridLines.push({
                type: 'vertical',
                start: { x: x_front, y: frontLeft.y },
                end: { x: x_back, y: backLeft.y },
                worldValue: worldX,
                depth: 5 // Average depth
            });
        }
    }
}

// ========================================
// RENDERING FUNCTIONS (RESTORED FROM PASTE.TXT)
// ========================================

function pointsToPath(points) {
    if (!points || points.length === 0) return '';
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
    }
    path += ' Z';
    return path;
}

function clearSVG() {
    while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
    }
}

function renderRoom() {
    clearSVG();

    // Draw floor first
    svgElement.appendChild(createSVGElement('path', { 
        d: pointsToPath(ROOM_GEOMETRY.floor), 
        class: 'room-floor' 
    }));

    // Draw grid lines
    ROOM_GEOMETRY.gridLines.forEach(line => {
        svgElement.appendChild(createSVGElement('line', {
            x1: line.start.x,
            y1: line.start.y,
            x2: line.end.x,
            y2: line.end.y,
            class: 'grid-line'
        }));

        // Add labels with improved positioning
        if (line.type === 'horizontal') {
            const fontSize = Math.max(6, PERSPECTIVE.baseFontSize * (0.3 + (VIEWPORT.height - line.start.y) / VIEWPORT.height * PERSPECTIVE.fontPerspectiveFactor));
            
            if (line.start.x > PERSPECTIVE.labelOffsetFromLine) {
                svgElement.appendChild(createSVGElement('text', {
                    x: line.start.x - PERSPECTIVE.labelOffsetFromLine,
                    y: line.start.y,
                    class: 'grid-label',
                    style: `font-size: ${clamp(fontSize, 6, PERSPECTIVE.baseFontSize * 1.8).toFixed(1)}px;`
                })).textContent = String(line.worldValue);
            }
        } else if (line.type === 'vertical') {
            const fontSize = PERSPECTIVE.baseFontSize * 1.1;
            
            // Only show labels for lines that are reasonably positioned on screen
            if (line.start.x > PERSPECTIVE.labelOffsetFromLine && line.start.x < VIEWPORT.width - PERSPECTIVE.labelOffsetFromLine) {
                svgElement.appendChild(createSVGElement('text', {
                    x: line.start.x,
                    y: line.start.y - PERSPECTIVE.labelOffsetFromLine * 0.8,
                    class: 'grid-label',
                    style: `font-size: ${fontSize.toFixed(1)}px;`
                })).textContent = String(line.worldValue);
            }
        }
    });

    const c = ROOM_GEOMETRY.corners;

    // Draw walls
    svgElement.appendChild(createSVGElement('path', { 
        d: pointsToPath(ROOM_GEOMETRY.walls.back), 
        class: 'room-wall-back' 
    }));
    
    if (c.frontLeft.x < c.backLeft.x || c.frontRight.x > c.backRight.x) {
        svgElement.appendChild(createSVGElement('path', { 
            d: pointsToPath(ROOM_GEOMETRY.walls.left), 
            class: 'room-wall-left' 
        }));
        svgElement.appendChild(createSVGElement('path', { 
            d: pointsToPath(ROOM_GEOMETRY.walls.right), 
            class: 'room-wall-right' 
        }));
    }

    // Draw ceiling
    svgElement.appendChild(createSVGElement('path', { 
        d: pointsToPath(ROOM_GEOMETRY.ceiling), 
        class: 'room-ceiling' 
    }));

    // Optional horizon line
    svgElement.appendChild(createSVGElement('line', {
        x1: 0, y1: PERSPECTIVE.vanishingPoint.y,
        x2: VIEWPORT.width, y2: PERSPECTIVE.vanishingPoint.y,
        class: 'horizon-line'
    }));

    updateDebugInfo();
}

function updateDebugInfo() {
    const visibleLines = ROOM_GEOMETRY.gridLines.length;
    const playerPos = `(${WORLD.player.x}, ${WORLD.player.y})`;
    const horizontalLines = ROOM_GEOMETRY.gridLines.filter(l => l.type === 'horizontal').length;
    const verticalLines = ROOM_GEOMETRY.gridLines.filter(l => l.type === 'vertical').length;
    
    debugInfo.innerHTML = `
        Player: ${playerPos}<br>
        H-Lines: ${horizontalLines} | V-Lines: ${verticalLines}<br>
        Total: ${visibleLines}<br>
        At wall: X=${WORLD.player.x === 0 || WORLD.player.x === 10 ? 'YES' : 'NO'} Y=${WORLD.player.y === 0 || WORLD.player.y === 10 ? 'YES' : 'NO'}
    `;
}

// ========================================
// MOVEMENT AND INTERACTION (RESTORED)
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
        calculateRoomGeometry();
        renderRoom();
        updatePositionDisplay();
        addMovementFeedback(direction);
    }
}

function addMovementFeedback(direction) {
    const button = navButtons[direction];
    if (button) {
        button.classList.add('nav-btn-active-feedback');
        setTimeout(() => {
            button.classList.remove('nav-btn-active-feedback');
        }, 100);
    }
}

function updatePositionDisplay() {
    positionText.textContent = `${WORLD.player.x},${WORLD.player.y}`;
}

// ========================================
// EVENT LISTENERS (RESTORED)
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
    calculateRoomGeometry();
    renderRoom();
}

// ========================================
// INITIALIZATION (RESTORED)
// ========================================

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
    calculateRoomGeometry();
}

function initializeApp() {
    initializeDOM();
    initializeWorld();
    setupEventListeners();
    updatePositionDisplay();
    renderRoom();
    console.log(`Square Room Grid Initialized. Player: (${WORLD.player.x}, ${WORLD.player.y})`);
}

document.addEventListener('DOMContentLoaded', initializeApp);