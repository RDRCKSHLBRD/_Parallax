// ========================================
// GLOBALS - Arrays and Objects
// ========================================

const WORLD = {
    size: 11,
    center: 5,
    player: {
        x: 5,
        y: 5,
        facing: 0 // 0=north, 1=east, 2=south, 3=west
    }
};

const VIEWPORT = {
    width: 800,
    height: 600,
    centerX: 400,
    centerY: 300,
    horizon: 250
};

const PERSPECTIVE = {
    vanishingPoint: { x: 400, y: 250 },
    floorDepth: 400,
    ceilingHeight: 200,
    wallWidth: 500,
    wallHeight: 500,
    depthScale: 0.8 // How much forward/back movement affects depth
};

const ROOM_GEOMETRY = {
    corners: [],
    walls: [],
    floor: [],
    ceiling: []
};

// ========================================
// DOM ELEMENTS
// ========================================

let svgElement;
let positionText;
let navButtons;

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    // Navigation button listeners
    navButtons.forward.addEventListener('click', () => movePlayer('forward'));
    navButtons.left.addEventListener('click', () => movePlayer('left'));
    navButtons.right.addEventListener('click', () => movePlayer('right'));
    navButtons.back.addEventListener('click', () => movePlayer('back'));
    
    // Keyboard listeners
    document.addEventListener('keydown', handleKeyDown);
    
    // Window resize listener
    window.addEventListener('resize', debounce(handleResize, 250));
}

function handleKeyDown(event) {
    switch(event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            event.preventDefault();
            movePlayer('forward');
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            event.preventDefault();
            movePlayer('back');
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            event.preventDefault();
            movePlayer('left');
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            event.preventDefault();
            movePlayer('right');
            break;
    }
}

function handleResize() {
    calculateRoomGeometry();
    renderRoom();
}

// ========================================
// UTILITIES - Math Functions
// ========================================

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function createSVGElement(tag, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });
    return element;
}

function getRelativePosition() {
    const distanceFromCenter = calculateDistance(
        WORLD.player.x, 
        WORLD.player.y, 
        WORLD.center, 
        WORLD.center
    );
    const maxDistance = calculateDistance(0, 0, WORLD.center, WORLD.center);
    return {
        x: WORLD.player.x,
        y: WORLD.player.y,
        centerDistance: distanceFromCenter,
        normalizedDistance: distanceFromCenter / maxDistance
    };
}

// ========================================
// GEOMETRY CALCULATIONS
// ========================================

function calculateRoomGeometry() {
    const pos = getRelativePosition();
    
    // Calculate perspective shifts based on position
    const lateralOffset = (pos.x - WORLD.center) * 20; // Left/right movement
    const depthOffset = (pos.y - WORLD.center) * 15;   // Forward/back movement
    
    // Vanishing point shifts based on player position
    PERSPECTIVE.vanishingPoint.x = VIEWPORT.centerX + lateralOffset;
    PERSPECTIVE.vanishingPoint.y = VIEWPORT.horizon + (depthOffset * 0.5);
    
    // Room dimensions adjust based on depth position
    const depthFactor = 1 + (depthOffset * 0.01);
    const roomWidth = PERSPECTIVE.wallWidth * depthFactor;
    const roomHeight = PERSPECTIVE.wallHeight * depthFactor;
    
    // Front corners (closer to viewer) - these represent the "room opening"
    const frontLeft = {
        x: VIEWPORT.centerX - roomWidth / 2,
        y: VIEWPORT.centerY + roomHeight / 2
    };
    const frontRight = {
        x: VIEWPORT.centerX + roomWidth / 2,
        y: VIEWPORT.centerY + roomHeight / 2
    };
    const frontTopLeft = {
        x: VIEWPORT.centerX - roomWidth / 2,
        y: VIEWPORT.centerY - roomHeight / 2
    };
    const frontTopRight = {
        x: VIEWPORT.centerX + roomWidth / 2,
        y: VIEWPORT.centerY - roomHeight / 2
    };
    
    // Back corners - perspective creates depth illusion
    const perspectiveFactor = 0.7 + (depthOffset * 0.005); // Depth affects perspective
    const backLeft = {
        x: lerp(frontLeft.x, PERSPECTIVE.vanishingPoint.x, perspectiveFactor),
        y: lerp(frontLeft.y, PERSPECTIVE.vanishingPoint.y, perspectiveFactor)
    };
    const backRight = {
        x: lerp(frontRight.x, PERSPECTIVE.vanishingPoint.x, perspectiveFactor),
        y: lerp(frontRight.y, PERSPECTIVE.vanishingPoint.y, perspectiveFactor)
    };
    const backTopLeft = {
        x: lerp(frontTopLeft.x, PERSPECTIVE.vanishingPoint.x, perspectiveFactor),
        y: lerp(frontTopLeft.y, PERSPECTIVE.vanishingPoint.y, perspectiveFactor)
    };
    const backTopRight = {
        x: lerp(frontTopRight.x, PERSPECTIVE.vanishingPoint.x, perspectiveFactor),
        y: lerp(frontTopRight.y, PERSPECTIVE.vanishingPoint.y, perspectiveFactor)
    };
    
    // Store calculated geometry
    ROOM_GEOMETRY.corners = {
        frontLeft, frontRight, frontTopLeft, frontTopRight,
        backLeft, backRight, backTopLeft, backTopRight
    };
    
    // Calculate wall polygons
    ROOM_GEOMETRY.walls = {
        left: [frontLeft, backLeft, backTopLeft, frontTopLeft],
        right: [frontRight, frontTopRight, backTopRight, backRight],
        back: [backLeft, backRight, backTopRight, backTopLeft]
    };
    
    // Floor and ceiling
    ROOM_GEOMETRY.floor = [frontLeft, frontRight, backRight, backLeft];
    ROOM_GEOMETRY.ceiling = [frontTopLeft, backTopLeft, backTopRight, frontTopRight];
}

function pointsToPath(points) {
    if (points.length === 0) return '';
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x} ${points[i].y}`;
    }
    path += ' Z';
    return path;
}

// ========================================
// UI FUNCTIONS
// ========================================

function updatePositionDisplay() {
    positionText.textContent = `${WORLD.player.x},${WORLD.player.y}`;
}

function clearSVG() {
    while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
    }
}

function renderRoom() {
    clearSVG();
    
    // Render floor
    const floor = createSVGElement('path', {
        d: pointsToPath(ROOM_GEOMETRY.floor),
        class: 'room-floor'
    });
    svgElement.appendChild(floor);
    
    // Add floor measurement line (horizontal line across the floor)
    const floorMeasureLine = createSVGElement('line', {
        x1: ROOM_GEOMETRY.floor[0].x,
        y1: lerp(ROOM_GEOMETRY.floor[0].y, ROOM_GEOMETRY.floor[3].y, 0.7),
        x2: ROOM_GEOMETRY.floor[1].x,
        y2: lerp(ROOM_GEOMETRY.floor[1].y, ROOM_GEOMETRY.floor[2].y, 0.7),
        class: 'floor-measurement-line'
    });
    svgElement.appendChild(floorMeasureLine);
    
    // Render walls (back first for proper layering)
    const backWall = createSVGElement('path', {
        d: pointsToPath(ROOM_GEOMETRY.walls.back),
        class: 'room-wall-back'
    });
    svgElement.appendChild(backWall);
    
    const leftWall = createSVGElement('path', {
        d: pointsToPath(ROOM_GEOMETRY.walls.left),
        class: 'room-wall-left'
    });
    svgElement.appendChild(leftWall);
    
    const rightWall = createSVGElement('path', {
        d: pointsToPath(ROOM_GEOMETRY.walls.right),
        class: 'room-wall-right'
    });
    svgElement.appendChild(rightWall);
    
    // Render ceiling
    const ceiling = createSVGElement('path', {
        d: pointsToPath(ROOM_GEOMETRY.ceiling),
        class: 'room-ceiling'
    });
    svgElement.appendChild(ceiling);
    
    // Render perspective lines (optional - for debugging)
    // renderPerspectiveLines();
    
    // Render horizon line (optional - for debugging)
    // const horizonLine = createSVGElement('line', {
    //     x1: '0',
    //     y1: PERSPECTIVE.vanishingPoint.y,
    //     x2: VIEWPORT.width,
    //     y2: PERSPECTIVE.vanishingPoint.y,
    //     class: 'horizon-line'
    // });
    // svgElement.appendChild(horizonLine);
}

function renderPerspectiveLines() {
    const { corners } = ROOM_GEOMETRY;
    
    // Vanishing lines from front corners to back corners
    const lines = [
        [corners.frontLeft, corners.backLeft],
        [corners.frontRight, corners.backRight],
        [corners.frontTopLeft, corners.backTopLeft],
        [corners.frontTopRight, corners.backTopRight]
    ];
    
    lines.forEach(([start, end]) => {
        const line = createSVGElement('line', {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            class: 'vanishing-line'
        });
        svgElement.appendChild(line);
    });
}

function movePlayer(direction) {
    let newX = WORLD.player.x;
    let newY = WORLD.player.y;
    
    switch(direction) {
        case 'forward':
            newY = Math.max(0, WORLD.player.y - 1);
            break;
        case 'back':
            newY = Math.min(WORLD.size - 1, WORLD.player.y + 1);
            break;
        case 'left':
            newX = Math.max(0, WORLD.player.x - 1);
            break;
        case 'right':
            newX = Math.min(WORLD.size - 1, WORLD.player.x + 1);
            break;
    }
    
    // Update player position if movement is valid
    if (newX !== WORLD.player.x || newY !== WORLD.player.y) {
        WORLD.player.x = newX;
        WORLD.player.y = newY;
        
        // Recalculate and re-render
        calculateRoomGeometry();
        renderRoom();
        updatePositionDisplay();
        
        // Add visual feedback
        addMovementFeedback(direction);
    }
}

function addMovementFeedback(direction) {
    const button = navButtons[direction];
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
        button.style.transform = '';
    }, 100);
}

// ========================================
// INITIALIZATION
// ========================================

function initializeDOM() {
    svgElement = document.getElementById('space-svg');
    positionText = document.getElementById('position-text');
    
    navButtons = {
        forward: document.getElementById('nav-forward'),
        left: document.getElementById('nav-left'),
        right: document.getElementById('nav-right'),
        back: document.getElementById('nav-back')
    };
}

function initializeWorld() {
    // Set initial player position to center
    WORLD.player.x = WORLD.center;
    WORLD.player.y = WORLD.center;
    
    // Calculate initial room geometry
    calculateRoomGeometry();
}

function initializeApp() {
    initializeDOM();
    initializeWorld();
    setupEventListeners();
    updatePositionDisplay();
    renderRoom();
    
    console.log('SVG 3D Space initialized');
    console.log('Use arrow keys or navigation buttons to move around the 11x11 world');
    console.log('Current position:', WORLD.player.x, WORLD.player.y);
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);