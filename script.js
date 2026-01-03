/*
 * MONSTER ROCKS - KING OF ANGA
 *
 * Controls:
 * - Mobile: Tap anywhere or use on-screen buttons to lock angle/power
 * - Desktop: SPACE to lock, R to restart
 *
 * How to Play:
 * 1. Lock the oscillating angle by tapping
 * 2. Lock the oscillating power by tapping again
 * 3. Watch your rock fly and destroy the enemy house!
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
    WORLD_WIDTH: 120, // meters
    WORLD_HEIGHT: 40, // meters
    GRAVITY: 15, // m/s²
    ROCK_RADIUS: 0.6, // meters
    ROCK_MASS: 10, // kg
    BOUNCE_DAMPING: 0.4,
    STOP_VELOCITY_THRESHOLD: 0.5,
    MAX_PARTICLES: 100,
    SCREEN_SHAKE_INTENSITY: 0.3,

    LEVELS: [
        {
            name: "Young Challenger",
            gravity: 12,
            distance: 70,
            obstacleCount: 3,
            oscillationSpeed: 1.5,
            aiAccuracy: 0.3,
            aiSmartness: 0
        },
        {
            name: "Warlord of Stone",
            gravity: 15,
            distance: 90,
            obstacleCount: 6,
            oscillationSpeed: 2.5,
            aiAccuracy: 0.6,
            aiSmartness: 0.5
        },
        {
            name: "King of Anga",
            gravity: 18,
            distance: 100,
            obstacleCount: 8,
            oscillationSpeed: 3.5,
            aiAccuracy: 0.85,
            aiSmartness: 1
        }
    ]
};

// ============================================================================
// GAME STATE
// ============================================================================

const game = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    scale: 1,
    dpr: 1,

    state: 'start', // start, playing, levelComplete, victory, defeat
    currentLevel: 0,

    terrain: [],
    playerHouse: null,
    enemyHouse: null,
    obstacles: [],
    playerMonster: null,
    enemyMonster: null,

    currentTurn: 'player', // player, enemy
    throwPhase: 'angle', // angle, power, thrown, waiting

    angle: 45,
    power: 50,
    angleOscillation: { value: 45, direction: 1, min: 10, max: 80 },
    powerOscillation: { value: 0, direction: 1, min: 0, max: 100 },

    rock: null,
    particles: [],

    screenShake: { x: 0, y: 0, intensity: 0 },

    time: 0,
    deltaTime: 0,
    lastTime: 0,

    audio: {
        context: null,
        enabled: true,
        initialized: false
    }
};

// ============================================================================
// CANVAS SETUP & RESPONSIVE HANDLING
// ============================================================================

function initCanvas() {
    game.canvas = document.getElementById('gameCanvas');
    game.ctx = game.canvas.getContext('2d', { alpha: false });
    game.dpr = window.devicePixelRatio || 1;

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => {
        setTimeout(resizeCanvas, 100);
    });
}

function resizeCanvas() {
    const container = document.getElementById('game-container');
    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;

    game.canvas.width = displayWidth * game.dpr;
    game.canvas.height = displayHeight * game.dpr;
    game.canvas.style.width = displayWidth + 'px';
    game.canvas.style.height = displayHeight + 'px';

    game.width = displayWidth;
    game.height = displayHeight;

    // Calculate scale to fit world
    const scaleX = game.width / CONFIG.WORLD_WIDTH;
    const scaleY = game.height / CONFIG.WORLD_HEIGHT;
    game.scale = Math.min(scaleX, scaleY) * 0.85;
}

function worldToScreen(x, y) {
    const offsetX = (game.width - CONFIG.WORLD_WIDTH * game.scale) / 2;
    const offsetY = (game.height - CONFIG.WORLD_HEIGHT * game.scale) / 2;

    return {
        x: x * game.scale + offsetX + game.screenShake.x,
        y: (CONFIG.WORLD_HEIGHT - y) * game.scale + offsetY + game.screenShake.y
    };
}

// ============================================================================
// TERRAIN GENERATION
// ============================================================================

function generateTerrain() {
    const levelConfig = CONFIG.LEVELS[game.currentLevel];
    game.terrain = [];

    const segments = 200;
    const baseHeight = 5;
    const variance = 2;

    for (let i = 0; i <= segments; i++) {
        const x = (i / segments) * CONFIG.WORLD_WIDTH;
        const noise = Math.sin(i * 0.1) * Math.cos(i * 0.05) * variance;
        const y = baseHeight + noise;
        game.terrain.push({ x, y });
    }
}

function getTerrainHeightAt(x) {
    if (x < 0 || x > CONFIG.WORLD_WIDTH) return 0;

    for (let i = 0; i < game.terrain.length - 1; i++) {
        const p1 = game.terrain[i];
        const p2 = game.terrain[i + 1];

        if (x >= p1.x && x <= p2.x) {
            const t = (x - p1.x) / (p2.x - p1.x);
            return p1.y + (p2.y - p1.y) * t;
        }
    }

    return game.terrain[0].y;
}

// ============================================================================
// DESTRUCTIBLE OBJECTS
// ============================================================================

class Block {
    constructor(x, y, width, height, hp = 100) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.maxHp = hp;
        this.hp = hp;
        this.destroyed = false;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.destroyed = true;
            createExplosion(this.x + this.width / 2, this.y + this.height / 2, 10);
            playSound('explosion', 0.3);
        }
    }

    draw(ctx, color) {
        if (this.destroyed) return;

        const screen = worldToScreen(this.x, this.y);
        const width = this.width * game.scale;
        const height = this.height * game.scale;

        // Health-based color darkening
        const healthPercent = this.hp / this.maxHp;
        ctx.fillStyle = color;
        ctx.fillRect(screen.x, screen.y - height, width, height);

        // Damage cracks
        if (healthPercent < 0.7) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(screen.x, screen.y - height);
            ctx.lineTo(screen.x + width, screen.y);
            ctx.stroke();
        }

        // Border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(screen.x, screen.y - height, width, height);
    }

    getBounds() {
        return {
            left: this.x,
            right: this.x + this.width,
            top: this.y + this.height,
            bottom: this.y
        };
    }
}

class House {
    constructor(x, y, isPlayer = true) {
        this.x = x;
        this.y = y;
        this.isPlayer = isPlayer;
        this.blocks = [];
        this.maxHp = 0;

        // Build house structure
        const blockWidth = 2.5;
        const blockHeight = 2;
        const rows = 3;
        const cols = 3;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const bx = x + col * blockWidth;
                const by = y + row * blockHeight;
                const block = new Block(bx, by, blockWidth, blockHeight, 100);
                this.blocks.push(block);
                this.maxHp += 100;
            }
        }
    }

    takeDamage(amount, impactX, impactY) {
        // Find closest block to impact
        let closestBlock = null;
        let minDist = Infinity;

        for (const block of this.blocks) {
            if (block.destroyed) continue;

            const dx = (block.x + block.width / 2) - impactX;
            const dy = (block.y + block.height / 2) - impactY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDist) {
                minDist = dist;
                closestBlock = block;
            }
        }

        if (closestBlock) {
            closestBlock.takeDamage(amount);
            shakeScreen(amount / 50);
        }
    }

    getHealth() {
        let currentHp = 0;
        for (const block of this.blocks) {
            if (!block.destroyed) {
                currentHp += block.hp;
            }
        }
        return currentHp;
    }

    isDestroyed() {
        return this.blocks.every(b => b.destroyed);
    }

    draw(ctx) {
        const color = this.isPlayer ? '#4ade80' : '#ef4444';
        for (const block of this.blocks) {
            block.draw(ctx, color);
        }
    }
}

class Obstacle {
    constructor(x, y, radius, hp = 150) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.maxHp = hp;
        this.hp = hp;
        this.destroyed = false;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.destroyed = true;
            createExplosion(this.x, this.y, 15);
            playSound('explosion', 0.4);
        }
    }

    draw(ctx) {
        if (this.destroyed) return;

        const screen = worldToScreen(this.x, this.y);
        const r = this.radius * game.scale;

        const healthPercent = this.hp / this.maxHp;
        ctx.fillStyle = `rgb(${100 + healthPercent * 50}, ${100 + healthPercent * 50}, ${100 + healthPercent * 50})`;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// ============================================================================
// MONSTERS
// ============================================================================

class Monster {
    constructor(x, y, isPlayer = true) {
        this.x = x;
        this.y = y;
        this.isPlayer = isPlayer;
        this.size = 3;
    }

    draw(ctx) {
        const screen = worldToScreen(this.x, this.y);
        const size = this.size * game.scale;

        // Body with outline
        ctx.fillStyle = this.isPlayer ? '#22c55e' : '#dc2626';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Eyes
        ctx.fillStyle = 'white';
        const eyeOffset = size * 0.3;
        const eyeSize = size * 0.3;
        ctx.beginPath();
        ctx.arc(screen.x - eyeOffset, screen.y - eyeOffset, eyeSize, 0, Math.PI * 2);
        ctx.arc(screen.x + eyeOffset, screen.y - eyeOffset, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'black';
        const pupilSize = eyeSize * 0.5;
        ctx.beginPath();
        ctx.arc(screen.x - eyeOffset, screen.y - eyeOffset, pupilSize, 0, Math.PI * 2);
        ctx.arc(screen.x + eyeOffset, screen.y - eyeOffset, pupilSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw aiming arm if it's this monster's turn
        if (game.state === 'playing' &&
            ((game.currentTurn === 'player' && this.isPlayer) ||
             (game.currentTurn === 'enemy' && !this.isPlayer))) {

            if (game.throwPhase === 'angle' || game.throwPhase === 'power') {
                const angle = this.isPlayer ? game.angle : (180 - game.angle);
                const angleRad = angle * Math.PI / 180;
                const armLength = size * 3;

                // Aiming arm with glow effect
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(screen.x, screen.y);
                ctx.lineTo(
                    screen.x + Math.cos(angleRad) * armLength,
                    screen.y - Math.sin(angleRad) * armLength
                );
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Power indicator
                if (game.throwPhase === 'power') {
                    const powerPercent = game.power / 100;
                    const barWidth = size * 4;
                    const barHeight = size * 0.8;
                    const barX = screen.x - barWidth / 2;
                    const barY = screen.y + size * 2.5;

                    // Background
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

                    ctx.fillStyle = 'rgba(50, 50, 50, 0.9)';
                    ctx.fillRect(barX, barY, barWidth, barHeight);

                    // Power fill with glow
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = `hsl(${powerPercent * 120}, 100%, 50%)`;
                    ctx.fillStyle = `hsl(${powerPercent * 120}, 100%, 50%)`;
                    ctx.fillRect(barX, barY, barWidth * powerPercent, barHeight);
                    ctx.shadowBlur = 0;

                    // Border
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(barX, barY, barWidth, barHeight);
                }
            }
        }
    }
}

// ============================================================================
// ROCK (PROJECTILE)
// ============================================================================

class Rock {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = CONFIG.ROCK_RADIUS;
        this.active = true;
        this.hasCollided = false;
    }

    update(dt) {
        if (!this.active) return;

        const levelConfig = CONFIG.LEVELS[game.currentLevel];
        const gravity = levelConfig.gravity;

        // Physics
        this.vy -= gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Trail particles
        if (Math.random() < 0.3) {
            createParticle(this.x, this.y, 0, 0, '#888', 0.3);
        }

        // Check collisions
        this.checkCollisions();

        // Out of bounds
        if (this.x < -10 || this.x > CONFIG.WORLD_WIDTH + 10 || this.y < -10) {
            this.active = false;
        }

        // Stop if velocity is low
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed < CONFIG.STOP_VELOCITY_THRESHOLD && this.y <= getTerrainHeightAt(this.x) + this.radius) {
            this.active = false;
        }
    }

    checkCollisions() {
        // Terrain collision
        const terrainHeight = getTerrainHeightAt(this.x);
        if (this.y - this.radius <= terrainHeight) {
            this.y = terrainHeight + this.radius;
            this.vy = -this.vy * CONFIG.BOUNCE_DAMPING;
            this.vx *= CONFIG.BOUNCE_DAMPING;

            if (!this.hasCollided) {
                createExplosion(this.x, this.y, 5);
                playSound('impact', 0.2);
                this.hasCollided = true;
            }
        }

        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const damage = speed * 10;

        // House collisions
        this.checkHouseCollision(game.playerHouse, damage);
        this.checkHouseCollision(game.enemyHouse, damage);

        // Obstacle collisions
        for (const obstacle of game.obstacles) {
            if (obstacle.destroyed) continue;

            const dx = this.x - obstacle.x;
            const dy = this.y - obstacle.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.radius + obstacle.radius) {
                // Bounce
                const nx = dx / dist;
                const ny = dy / dist;
                const dot = this.vx * nx + this.vy * ny;
                this.vx = (this.vx - 2 * dot * nx) * CONFIG.BOUNCE_DAMPING;
                this.vy = (this.vy - 2 * dot * ny) * CONFIG.BOUNCE_DAMPING;

                // Push out
                const overlap = this.radius + obstacle.radius - dist;
                this.x += nx * overlap;
                this.y += ny * overlap;

                obstacle.takeDamage(damage);
                shakeScreen(damage / 100);

                if (!this.hasCollided) {
                    playSound('impact', 0.3);
                    this.hasCollided = true;
                }
            }
        }
    }

    checkHouseCollision(house, damage) {
        for (const block of house.blocks) {
            if (block.destroyed) continue;

            const bounds = block.getBounds();

            // Circle-rectangle collision
            const closestX = Math.max(bounds.left, Math.min(this.x, bounds.right));
            const closestY = Math.max(bounds.bottom, Math.min(this.y, bounds.top));

            const dx = this.x - closestX;
            const dy = this.y - closestY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.radius) {
                // Collision!
                house.takeDamage(damage, this.x, this.y);

                // Bounce
                if (dist > 0) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const dot = this.vx * nx + this.vy * ny;
                    this.vx = (this.vx - 2 * dot * nx) * CONFIG.BOUNCE_DAMPING;
                    this.vy = (this.vy - 2 * dot * ny) * CONFIG.BOUNCE_DAMPING;

                    // Push out
                    const overlap = this.radius - dist;
                    this.x += nx * overlap;
                    this.y += ny * overlap;
                }

                if (!this.hasCollided) {
                    playSound('impact', 0.4);
                    this.hasCollided = true;
                }

                return;
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;

        const screen = worldToScreen(this.x, this.y);
        const r = this.radius * game.scale;

        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// ============================================================================
// PARTICLES & EFFECTS
// ============================================================================

class Particle {
    constructor(x, y, vx, vy, color, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = 0.2 + Math.random() * 0.3;
    }

    update(dt) {
        this.vy -= 5 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw(ctx) {
        const screen = worldToScreen(this.x, this.y);
        const alpha = this.life / this.maxLife;
        const size = this.size * game.scale;

        ctx.fillStyle = this.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
        ctx.fillRect(screen.x - size / 2, screen.y - size / 2, size, size);
    }
}

function createParticle(x, y, vx, vy, color, life) {
    if (game.particles.length >= CONFIG.MAX_PARTICLES) {
        game.particles.shift();
    }
    game.particles.push(new Particle(x, y, vx, vy, color, life));
}

function createExplosion(x, y, count) {
    const colors = ['#ff6b35', '#f7931e', '#fdc830', '#999'];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 10;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const color = colors[Math.floor(Math.random() * colors.length)];
        createParticle(x, y, vx, vy, color, 0.5 + Math.random() * 0.5);
    }
}

function shakeScreen(intensity) {
    game.screenShake.intensity = Math.min(intensity, 1);
}

function updateScreenShake(dt) {
    if (game.screenShake.intensity > 0) {
        const amount = game.screenShake.intensity * CONFIG.SCREEN_SHAKE_INTENSITY * game.scale;
        game.screenShake.x = (Math.random() - 0.5) * amount;
        game.screenShake.y = (Math.random() - 0.5) * amount;
        game.screenShake.intensity -= dt * 3;
    } else {
        game.screenShake.x = 0;
        game.screenShake.y = 0;
        game.screenShake.intensity = 0;
    }
}

// ============================================================================
// AUDIO SYSTEM
// ============================================================================

function initAudio() {
    if (!game.audio.initialized) {
        try {
            game.audio.context = new (window.AudioContext || window.webkitAudioContext)();
            game.audio.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }
}

function playSound(type, volume = 0.3) {
    if (!game.audio.enabled || !game.audio.context) return;

    try {
        const ctx = game.audio.context;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        gainNode.gain.value = volume;

        switch (type) {
            case 'throw':
                oscillator.frequency.value = 200;
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
                oscillator.start();
                oscillator.stop(ctx.currentTime + 0.2);
                break;

            case 'impact':
                oscillator.frequency.value = 100;
                oscillator.type = 'square';
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                oscillator.start();
                oscillator.stop(ctx.currentTime + 0.1);
                break;

            case 'explosion':
                oscillator.frequency.value = 50;
                oscillator.type = 'sawtooth';
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                oscillator.start();
                oscillator.stop(ctx.currentTime + 0.3);
                break;

            case 'lock':
                oscillator.frequency.value = 440;
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                oscillator.start();
                oscillator.stop(ctx.currentTime + 0.1);
                break;
        }
    } catch (e) {
        console.warn('Audio playback failed:', e);
    }
}

function vibrate(duration = 10) {
    if (navigator.vibrate) {
        navigator.vibrate(duration);
    }
}

// ============================================================================
// LEVEL SETUP
// ============================================================================

function setupLevel() {
    const levelConfig = CONFIG.LEVELS[game.currentLevel];

    generateTerrain();

    // Place houses
    const playerX = 10;
    const enemyX = CONFIG.WORLD_WIDTH - 20;
    const houseY = 5;

    game.playerHouse = new House(playerX, houseY, true);
    game.enemyHouse = new House(enemyX, houseY, false);

    // Place monsters
    game.playerMonster = new Monster(playerX + 3.5, houseY + 7);
    game.enemyMonster = new Monster(enemyX + 3.5, houseY + 7);

    // Place obstacles
    game.obstacles = [];
    const obstacleCount = levelConfig.obstacleCount;
    const minX = 30;
    const maxX = CONFIG.WORLD_WIDTH - 30;

    for (let i = 0; i < obstacleCount; i++) {
        const x = minX + (maxX - minX) * (i / (obstacleCount - 1));
        const y = getTerrainHeightAt(x) + 2 + Math.random() * 3;
        const radius = 1.5 + Math.random() * 1;
        game.obstacles.push(new Obstacle(x, y, radius));
    }

    // Reset state
    game.currentTurn = 'player';
    game.throwPhase = 'angle';
    game.angle = 45;
    game.power = 50;
    game.rock = null;
    game.particles = [];

    updateAngleOscillation();
    updatePowerOscillation();
    updateUI();
}

function updateAngleOscillation() {
    const levelConfig = CONFIG.LEVELS[game.currentLevel];
    game.angleOscillation = {
        value: 45,
        direction: 1,
        min: 10,
        max: 80,
        speed: levelConfig.oscillationSpeed
    };
}

function updatePowerOscillation() {
    const levelConfig = CONFIG.LEVELS[game.currentLevel];
    game.powerOscillation = {
        value: 0,
        direction: 1,
        min: 0,
        max: 100,
        speed: levelConfig.oscillationSpeed
    };
}

// ============================================================================
// THROW MECHANIC
// ============================================================================

function lockAngle() {
    if (game.throwPhase !== 'angle') return;

    game.angle = game.angleOscillation.value;
    game.throwPhase = 'power';
    playSound('lock', 0.2);
    vibrate(10);
    updateUI();
}

function lockPower() {
    if (game.throwPhase !== 'power') return;

    game.power = game.powerOscillation.value;
    throwRock();
    game.throwPhase = 'thrown';
    updateUI();
}

function throwRock() {
    const isPlayer = game.currentTurn === 'player';
    const monster = isPlayer ? game.playerMonster : game.enemyMonster;

    const angle = isPlayer ? game.angle : (180 - game.angle);
    const angleRad = angle * Math.PI / 180;

    const maxSpeed = 30;
    const speed = (game.power / 100) * maxSpeed;

    const vx = Math.cos(angleRad) * speed;
    const vy = Math.sin(angleRad) * speed;

    game.rock = new Rock(monster.x, monster.y, vx, vy);

    playSound('throw', 0.3);
    vibrate(20);
}

// ============================================================================
// AI
// ============================================================================

function doAITurn() {
    const levelConfig = CONFIG.LEVELS[game.currentLevel];

    // Simple AI: try a few shots and pick the best
    const simulations = 5;
    let bestShot = null;
    let bestScore = -Infinity;

    for (let i = 0; i < simulations; i++) {
        const angle = 30 + Math.random() * 50; // 30-80 degrees
        const power = 50 + Math.random() * 50; // 50-100 power

        const score = simulateShot(angle, power, levelConfig);

        if (score > bestScore) {
            bestScore = score;
            bestShot = { angle, power };
        }
    }

    // Add inaccuracy based on difficulty
    const error = (1 - levelConfig.aiAccuracy) * 20;
    game.angle = bestShot.angle + (Math.random() - 0.5) * error;
    game.power = bestShot.power + (Math.random() - 0.5) * error * 2;

    game.angle = Math.max(10, Math.min(80, game.angle));
    game.power = Math.max(20, Math.min(100, game.power));

    // Delay for dramatic effect
    setTimeout(() => {
        if (game.state === 'playing' && game.currentTurn === 'enemy') {
            throwRock();
            game.throwPhase = 'thrown';
        }
    }, 1000);
}

function simulateShot(angle, power, levelConfig) {
    const angleRad = (180 - angle) * Math.PI / 180;
    const maxSpeed = 30;
    const speed = (power / 100) * maxSpeed;

    let x = game.enemyMonster.x;
    let y = game.enemyMonster.y;
    let vx = Math.cos(angleRad) * speed;
    let vy = Math.sin(angleRad) * speed;

    const dt = 0.05;
    const maxSteps = 200;

    const targetX = game.playerHouse.x + 3.5;
    const targetY = game.playerHouse.y + 3;

    let closestDist = Infinity;

    for (let step = 0; step < maxSteps; step++) {
        vy -= levelConfig.gravity * dt;
        x += vx * dt;
        y += vy * dt;

        const dist = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
        closestDist = Math.min(closestDist, dist);

        if (y < 0 || x < 0 || x > CONFIG.WORLD_WIDTH) break;
    }

    return -closestDist;
}

// ============================================================================
// GAME LOOP
// ============================================================================

function update(time) {
    game.deltaTime = (time - game.lastTime) / 1000;
    game.deltaTime = Math.min(game.deltaTime, 0.1); // Cap delta time
    game.lastTime = time;

    if (game.state !== 'playing') {
        requestAnimationFrame(update);
        return;
    }

    // Update oscillations
    if (game.throwPhase === 'angle' && game.currentTurn === 'player') {
        const osc = game.angleOscillation;
        osc.value += osc.direction * osc.speed * game.deltaTime * 60;
        if (osc.value >= osc.max || osc.value <= osc.min) {
            osc.direction *= -1;
            osc.value = Math.max(osc.min, Math.min(osc.max, osc.value));
        }
        game.angle = osc.value;
    }

    if (game.throwPhase === 'power' && game.currentTurn === 'player') {
        const osc = game.powerOscillation;
        osc.value += osc.direction * osc.speed * game.deltaTime * 60;
        if (osc.value >= osc.max || osc.value <= osc.min) {
            osc.direction *= -1;
            osc.value = Math.max(osc.min, Math.min(osc.max, osc.value));
        }
        game.power = osc.value;
    }

    // Update rock
    if (game.rock && game.rock.active) {
        game.rock.update(game.deltaTime);
    } else if (game.rock && !game.rock.active) {
        // Turn over
        game.rock = null;

        // Check win/lose conditions
        if (game.playerHouse.isDestroyed()) {
            endGame(false);
            return;
        }
        if (game.enemyHouse.isDestroyed()) {
            endGame(true);
            return;
        }

        // Switch turns
        if (game.currentTurn === 'player') {
            game.currentTurn = 'enemy';
            game.throwPhase = 'angle';
            updateAngleOscillation();
            updatePowerOscillation();
            updateUI();

            // AI takes turn
            setTimeout(() => {
                if (game.state === 'playing' && game.currentTurn === 'enemy') {
                    doAITurn();
                }
            }, 500);
        } else {
            game.currentTurn = 'player';
            game.throwPhase = 'angle';
            updateAngleOscillation();
            updatePowerOscillation();
            updateUI();
        }
    }

    // Update particles
    for (let i = game.particles.length - 1; i >= 0; i--) {
        game.particles[i].update(game.deltaTime);
        if (game.particles[i].life <= 0) {
            game.particles.splice(i, 1);
        }
    }

    // Update screen shake
    updateScreenShake(game.deltaTime);

    render();
    requestAnimationFrame(update);
}

function render() {
    const ctx = game.ctx;
    const w = game.width;
    const h = game.height;

    // Scale context for high DPI displays
    ctx.save();
    ctx.scale(game.dpr, game.dpr);

    // Clear
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, w, h);

    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#87ceeb');
    gradient.addColorStop(0.5, '#e0f6ff');
    gradient.addColorStop(1, '#c4a070');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Terrain
    ctx.fillStyle = '#8b7355';
    ctx.beginPath();
    const firstPoint = worldToScreen(game.terrain[0].x, game.terrain[0].y);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (const point of game.terrain) {
        const screen = worldToScreen(point.x, point.y);
        ctx.lineTo(screen.x, screen.y);
    }

    const lastPoint = worldToScreen(game.terrain[game.terrain.length - 1].x, 0);
    ctx.lineTo(lastPoint.x, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Terrain outline
    ctx.strokeStyle = '#6b5d4f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(firstPoint.x, firstPoint.y);
    for (const point of game.terrain) {
        const screen = worldToScreen(point.x, point.y);
        ctx.lineTo(screen.x, screen.y);
    }
    ctx.stroke();

    // Draw game objects
    game.playerHouse.draw(ctx);
    game.enemyHouse.draw(ctx);

    for (const obstacle of game.obstacles) {
        obstacle.draw(ctx);
    }

    game.playerMonster.draw(ctx);
    game.enemyMonster.draw(ctx);

    if (game.rock) {
        game.rock.draw(ctx);
    }

    // Particles
    for (const particle of game.particles) {
        particle.draw(ctx);
    }

    ctx.restore();
}

// ============================================================================
// UI MANAGEMENT
// ============================================================================

function updateUI() {
    // Level number
    document.getElementById('level-number').textContent = game.currentLevel + 1;

    // Health bars
    const playerHealth = (game.playerHouse.getHealth() / game.playerHouse.maxHp) * 100;
    const enemyHealth = (game.enemyHouse.getHealth() / game.enemyHouse.maxHp) * 100;
    document.getElementById('player-health').style.width = playerHealth + '%';
    document.getElementById('enemy-health').style.width = enemyHealth + '%';

    // Turn indicator
    const turnText = game.currentTurn === 'player' ? 'Your Turn' : 'Enemy Turn';
    document.getElementById('turn-indicator').textContent = turnText;

    // Phase indicator and button
    const lockBtn = document.getElementById('lock-btn');
    const phaseIndicator = document.getElementById('phase-indicator');

    if (game.currentTurn === 'player') {
        if (game.throwPhase === 'angle') {
            lockBtn.textContent = 'LOCK ANGLE';
            phaseIndicator.textContent = 'Tap to Lock Angle';
            lockBtn.style.display = 'block';
        } else if (game.throwPhase === 'power') {
            lockBtn.textContent = 'LOCK POWER / THROW';
            phaseIndicator.textContent = 'Tap to Lock Power';
            lockBtn.style.display = 'block';
        } else {
            lockBtn.style.display = 'none';
            phaseIndicator.textContent = 'Watch the rock!';
        }
    } else {
        lockBtn.style.display = 'none';
        phaseIndicator.textContent = 'Enemy is thinking...';
    }
}

function showScreen(screenId) {
    const screens = ['start-screen', 'level-complete-screen', 'victory-screen', 'defeat-screen'];
    screens.forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });

    if (screenId) {
        document.getElementById(screenId).classList.remove('hidden');
    }

    const hud = document.getElementById('hud');
    const controls = document.getElementById('controls');

    if (game.state === 'playing') {
        hud.classList.remove('hidden');
        controls.classList.remove('hidden');
    } else {
        hud.classList.add('hidden');
        controls.classList.add('hidden');
    }
}

function startGame() {
    initAudio(); // Initialize audio on first interaction
    game.currentLevel = 0;
    game.state = 'playing';
    setupLevel();
    showScreen(null);
}

function nextLevel() {
    game.currentLevel++;
    if (game.currentLevel >= CONFIG.LEVELS.length) {
        game.state = 'victory';
        showScreen('victory-screen');
    } else {
        game.state = 'playing';
        setupLevel();
        showScreen(null);
    }
}

function endGame(victory) {
    if (victory) {
        if (game.currentLevel === CONFIG.LEVELS.length - 1) {
            game.state = 'victory';
            showScreen('victory-screen');
        } else {
            game.state = 'levelComplete';
            const levelConfig = CONFIG.LEVELS[game.currentLevel];
            document.getElementById('level-complete-message').textContent =
                `You defeated the ${levelConfig.name}!`;
            showScreen('level-complete-screen');
        }
    } else {
        game.state = 'defeat';
        showScreen('defeat-screen');
    }
}

function restartLevel() {
    game.state = 'playing';
    setupLevel();
    showScreen(null);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleLockAction() {
    if (game.state !== 'playing' || game.currentTurn !== 'player') return;

    if (game.throwPhase === 'angle') {
        lockAngle();
    } else if (game.throwPhase === 'power') {
        lockPower();
    }
}

function setupEventListeners() {
    // Touch/Click on canvas
    game.canvas.addEventListener('click', handleLockAction);

    // Buttons
    document.getElementById('lock-btn').addEventListener('click', handleLockAction);
    document.getElementById('restart-btn').addEventListener('click', restartLevel);
    document.getElementById('play-btn').addEventListener('click', startGame);
    document.getElementById('next-level-btn').addEventListener('click', nextLevel);
    document.getElementById('play-again-btn').addEventListener('click', startGame);
    document.getElementById('try-again-btn').addEventListener('click', restartLevel);

    // Mute button
    document.getElementById('mute-btn').addEventListener('click', () => {
        game.audio.enabled = !game.audio.enabled;
        document.getElementById('mute-btn').textContent = game.audio.enabled ? '🔊' : '🔇';
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            handleLockAction();
        } else if (e.code === 'KeyR') {
            e.preventDefault();
            restartLevel();
        }
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    initCanvas();
    setupEventListeners();
    showScreen('start-screen');

    game.lastTime = performance.now();
    requestAnimationFrame(update);
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
