// ============================================================================
// 1. 초기 설정 및 UI 요소 가져오기
// ============================================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreBoard = document.getElementById('scoreBoard');
const bombBoard = document.getElementById('bombBoard');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseScreen = document.getElementById('pauseScreen');
const finalScore = document.getElementById('finalScore');
const bossHpContainer = document.getElementById('bossHpContainer');
const bossHpBar = document.getElementById('bossHpBar');

ctx.imageSmoothingEnabled = false;

// ============================================================================
// 2. 이미지 자원 로드 시스템
// ============================================================================
const images = {};
function loadImage(key, src) {
    images[key] = new Image();
    images[key].src = src;
}
loadImage('player', 'images/player_ships.png');
loadImage('enemy', 'images/enemy_ships.png');
loadImage('bigEnemy', 'images/BiggerShips.png');
loadImage('bulletPlayer', 'images/bullets_player.png');
loadImage('explosion', 'images/explosion.png');

// ============================================================================
// 3. 게임 상태 및 전역 변수
// ============================================================================
let isGameOver = false;
let isPaused = false;
let pauseStartTime = 0;
let score = 0;
let animationId;
let bombFlashTimer = 0;

// [보스 관련 상태]
let bossThreshold = 500; 
let isBossStage = false;
let boss = null;
let bossLevel = 1; // 몇 번째 보스인지 추적 (레벨에 따라 체력 증가 및 패턴 해금)

const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false };

// ============================================================================
// 4. 게임 내 객체 정의
// ============================================================================
const player = {
    x: canvas.width / 2 - 22, y: canvas.height - 80,
    width: 44, height: 44, speed: 5,
    lastShotTime: 0, shootDelay: 120,
    animFrame: 0, lastAnimTime: 0,
    bombs: 3, weaponLevel: 1, invincibleUntil: 0 
};

let bullets = [];      
let enemies = [];      
let enemyBullets = []; 
let items = [];        
let explosions = [];   

// ============================================================================
// 5. 이벤트 리스너
// ============================================================================
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyZ' && !isGameOver && !isPaused) useBomb();
    if ((e.code === 'KeyP' || e.code === 'Escape') && !isGameOver) togglePause();
});
window.addEventListener('keyup', (e) => keys[e.code] = false);
window.addEventListener('beforeunload', () => saveGameState());

// ============================================================================
// 6. 세이브 & 로드 및 일시정지 시스템
// ============================================================================
function saveGameState() {
    if (isGameOver) {
        localStorage.removeItem('1945_save_state');
        return;
    }
    const state = {
        score, bossThreshold, isBossStage, bossLevel, // 보스 레벨 저장 추가
        player: { x: player.x, y: player.y, bombs: player.bombs, weaponLevel: player.weaponLevel },
        enemies: enemies.map(e => ({ x: e.x, y: e.y, hp: e.hp, isBig: e.isBig, speed: e.speed, spriteRow: e.spriteRow, scoreValue: e.scoreValue, width: e.width, height: e.height })),
        boss: boss ? { x: boss.x, y: boss.y, hp: boss.hp, maxHp: boss.maxHp, speed: boss.speed, dirX: boss.dirX, width: boss.width, height: boss.height, spriteRow: boss.spriteRow, pattern: boss.pattern, attackAngle: boss.attackAngle } : null,
        bullets: bullets.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, width: b.width, height: b.height })),
        enemyBullets: enemyBullets.map(eb => ({ x: eb.x, y: eb.y, vx: eb.vx, vy: eb.vy, width: eb.width, height: eb.height })),
        items: items.map(i => ({ x: i.x, y: i.y, width: i.width, height: i.height, speed: i.speed }))
    };
    localStorage.setItem('1945_save_state', JSON.stringify(state));
}

function loadGameState(savedStr) {
    try {
        const state = JSON.parse(savedStr);
        score = state.score;
        bossThreshold = state.bossThreshold;
        isBossStage = state.isBossStage;
        bossLevel = state.bossLevel || 1; // 기존 세이브 호환성을 위해 기본값 1
        
        player.x = state.player.x; player.y = state.player.y;
        player.bombs = state.player.bombs; player.weaponLevel = state.player.weaponLevel;

        const now = Date.now();
        enemies = state.enemies.map(e => ({ ...e, animFrame: 0, lastAnimTime: now, hitTime: 0, markedForDeletion: false }));
        boss = state.boss ? { ...state.boss, hitTime: 0, lastShotTime: now, animFrame: 0, lastAnimTime: now, patternTimer: now } : null;
        bullets = state.bullets.map(b => ({ ...b, markedForDeletion: false }));
        enemyBullets = state.enemyBullets.map(eb => ({ ...eb, markedForDeletion: false }));
        items = state.items.map(i => ({ ...i, markedForDeletion: false }));
        explosions = []; 

        scoreBoard.innerText = `SCORE: ${score}`;
        bombBoard.innerText = `BOMB (Z키): ${player.bombs}`;
        if (boss) {
            bossHpContainer.style.display = 'block';
            bossHpBar.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
        }
        isPaused = true;
        pauseScreen.style.display = 'block';
    } catch (e) {
        localStorage.removeItem('1945_save_state');
    }
}

function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        pauseStartTime = Date.now();
        pauseScreen.style.display = 'block';
        saveGameState();
    } else {
        adjustTimestamps(Date.now() - pauseStartTime);
        pauseScreen.style.display = 'none';
    }
}

function adjustTimestamps(duration) {
    player.lastShotTime += duration;
    player.lastAnimTime += duration;
    if (player.invincibleUntil > Date.now() - duration) player.invincibleUntil += duration;
    enemies.forEach(e => { e.lastAnimTime += duration; e.hitTime += duration; });
    explosions.forEach(e => { e.lastFrameTime += duration; });
    if (boss) {
        boss.lastAnimTime += duration;
        boss.hitTime += duration;
        boss.lastShotTime += duration;
        boss.patternTimer += duration; // 보스 패턴 타이머도 시간 보정
    }
}

// ============================================================================
// 7. 객체 생성 및 핵심 기능 함수들
// ============================================================================
function spawnEnemy() {
    if (isBossStage) return; 
    const spawnRate = 0.02 + (score * 0.00005);
    if (Math.random() < spawnRate) {
        const isBig = Math.random() < 0.15 && score > 50;
        if (isBig) {
            enemies.push({
                x: Math.random() * (canvas.width - 70), y: -60, width: 70, height: 60, speed: 1.5, hp: 5,
                isBig: true, spriteRow: Math.floor(Math.random() * 2), animFrame: 0, lastAnimTime: Date.now(), hitTime: 0,
                scoreValue: 50, markedForDeletion: false
            });
        } else {
            enemies.push({
                x: Math.random() * (canvas.width - 36), y: -36, width: 36, height: 36, speed: Math.random() * 2 + 2, hp: 1,
                isBig: false, spriteRow: Math.floor(Math.random() * 4), animFrame: 0, lastAnimTime: Date.now(), hitTime: 0,
                scoreValue: 10, markedForDeletion: false
            });
        }
    }
}

function spawnBoss() {
    isBossStage = true;
    bossHpContainer.style.display = 'block';
    const calculatedHp = 150 + ((bossLevel - 1) * 100);

    boss = {
        x: canvas.width / 2 - 70, y: -150, width: 140, height: 120,
        hp: calculatedHp, maxHp: calculatedHp, speed: 1.5, dirX: 1, hitTime: 0, lastShotTime: Date.now(),
        spriteRow: Math.floor(Math.random() * 2), animFrame: 0, lastAnimTime: Date.now(),
        

        pattern: 0, 
        patternTimer: Date.now(),
        attackAngle: 0 // 회전 탄막용 각도 계산기
    };
    bossHpBar.style.width = '100%';
}

function spawnItem(x, y) {
    items.push({ x: x, y: y, width: 20, height: 20, speed: 2, markedForDeletion: false });
}

function useBomb() {
    if (player.bombs > 0) {
        player.bombs--;
        bombBoard.innerText = `BOMB (Z키): ${player.bombs}`;
        bombFlashTimer = 30; 
        player.invincibleUntil = Date.now() + 2000; 
        enemies.forEach(enemy => {
            score += enemy.scoreValue;
            createExplosion(enemy.x, enemy.y, enemy.width, enemy.height);
            enemy.markedForDeletion = true;
        });
        enemyBullets.forEach(eb => eb.markedForDeletion = true);
        if (boss) {
            boss.hp -= 30;
            boss.hitTime = Date.now();
        }
        scoreBoard.innerText = `SCORE: ${score}`;
    }
}

function isColliding(rect1, rect2) {
    // 판정 크기 비율 설정
    const hitRatio = 0.8; 
    const r1w = rect1.width * hitRatio;
    const r1h = rect1.height * hitRatio;
    const r1x = rect1.x + (rect1.width - r1w) / 2;
    const r1y = rect1.y + (rect1.height - r1h) / 2;

    const r2w = rect2.width * hitRatio;
    const r2h = rect2.height * hitRatio;
    const r2x = rect2.x + (rect2.width - r2w) / 2;
    const r2y = rect2.y + (rect2.height - r2h) / 2;

    return r1x < r2x + r2w && r1x + r1w > r2x &&
           r1y < r2y + r2h && r1y + r1h > r2y;
}

function createExplosion(x, y, width, height) {
    explosions.push({
        x: x, y: y, width: width, height: height,
        frame: 0, lastFrameTime: Date.now(), frameDelay: 80, markedForDeletion: false
    });
}

function takeDamage() {
    if (Date.now() > player.invincibleUntil) {
        createExplosion(player.x, player.y, player.width, player.height);
        gameOver();
    }
}

// ============================================================================
// 8. 게임 로직 업데이트 (매 프레임)
// ============================================================================
function update() {
    if (score >= bossThreshold && !isBossStage && !boss) spawnBoss();

    if (keys.ArrowUp && player.y > 0) player.y -= player.speed;
    if (keys.ArrowDown && player.y < canvas.height - player.height) player.y += player.speed;
    if (keys.ArrowLeft && player.x > 0) player.x -= player.speed;
    if (keys.ArrowRight && player.x < canvas.width - player.width) player.x += player.speed;

    const currentTime = Date.now();

    // 플레이어 사격
    if (keys.Space && currentTime - player.lastShotTime > 150) {
        
        // 총알이 출발할 기준 위치 계산
        const cx = player.x + player.width / 2;
        const topY = player.y;

        if (player.weaponLevel === 1) {
            bullets.push({ x: cx - 4, y: topY, width: 8, height: 24, vx: 0, vy: -12, markedForDeletion: false });
        } else if (player.weaponLevel === 2) {
            bullets.push({ x: cx - 14, y: topY, width: 8, height: 24, vx: 0, vy: -12, markedForDeletion: false });
            bullets.push({ x: cx + 6, y: topY, width: 8, height: 24, vx: 0, vy: -12, markedForDeletion: false });
        } else if (player.weaponLevel === 4) {
            bullets.push({ x: cx - 14, y: topY, width: 8, height: 24, vx: 0, vy: -12, markedForDeletion: false });
            bullets.push({ x: cx + 6, y: topY, width: 8, height: 24, vx: 0, vy: -12, markedForDeletion: false });
            bullets.push({ x: cx - 4, y: topY, width: 8, height: 24, vx: -4, vy: -10, markedForDeletion: false });
            bullets.push({ x: cx - 4, y: topY, width: 8, height: 24, vx: 4, vy: -10, markedForDeletion: false });
        } else { 
            // 자동 부채꼴 계산
            let totalBullets = Math.min(player.weaponLevel, 10); 
            let spreadGap = 2.5; 
            let startVx = -((totalBullets - 1) * spreadGap) / 2;

            for (let i = 0; i < totalBullets; i++) {
                let currentVx = startVx + (i * spreadGap);
                let currentVy = -12 + (Math.abs(currentVx) * 0.15); 

                bullets.push({ 
                    x: cx - 4, // 총알 가운데 정렬
                    y: topY, 
                    width: 8, 
                    height: 24, 
                    vx: currentVx, 
                    vy: currentVy, 
                    markedForDeletion: false 
                });
            }
        }
        
        // 총알을 쏜 시간을 기록해서 쿨타임을 초기화
        player.lastShotTime = currentTime;
    }
    

    bullets.forEach(bullet => {
        bullet.x += bullet.vx; bullet.y += bullet.vy;
        if (bullet.y + bullet.height < 0 || bullet.x < 0 || bullet.x > canvas.width) bullet.markedForDeletion = true;
    });

    enemies.forEach(enemy => {
        enemy.y += enemy.speed;
        if (enemy.y > canvas.height) enemy.markedForDeletion = true;
        if (enemy.y > 0 && Math.random() < 0.005) { 
            enemyBullets.push({
                x: enemy.x + enemy.width / 2 - 3, y: enemy.y + enemy.height,
                width: 6, height: 12, vx: 0, vy: 4, markedForDeletion: false
            });
        }
    });

    // --- 보스 로직 (패턴 다양화 적용) ---
    if (boss) {
        if (boss.y < 30) boss.y += boss.speed;
        else {
            boss.x += boss.speed * boss.dirX;
            if (boss.x <= 0 || boss.x + boss.width >= canvas.width) boss.dirX *= -1;
            
            // 3초마다 공격 패턴 무작위 변경
            if (currentTime - boss.patternTimer > 3000) {
                // 보스 레벨 1이면 패턴 0,1 사용 / 레벨 2 이상이면 0,1,2 전부 사용
                const availablePatterns = bossLevel >= 2 ? 3 : 2; 
                boss.pattern = Math.floor(Math.random() * availablePatterns);
                boss.patternTimer = currentTime;
            }

            // 5방향 확산탄
            if (boss.pattern === 0) {
                if (currentTime - boss.lastShotTime > 1000) {
                    for (let i = -2; i <= 2; i++) {
                        enemyBullets.push({
                            x: boss.x + boss.width / 2, y: boss.y + boss.height,
                            width: 8, height: 16, vx: i * 1.5, vy: 5, markedForDeletion: false
                        });
                    }
                    boss.lastShotTime = currentTime;
                }
            }
            // 플레이어 조준탄
            else if (boss.pattern === 1) {
                if (currentTime - boss.lastShotTime > 400) {
                    const dx = (player.x + player.width/2) - (boss.x + boss.width/2);
                    const dy = (player.y + player.height/2) - (boss.y + boss.height);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const speed = 6;

                    enemyBullets.push({
                        x: boss.x + boss.width / 2 - 4, y: boss.y + boss.height,
                        width: 10, height: 10, 
                        vx: (dx / dist) * speed, vy: (dy / dist) * speed, 
                        markedForDeletion: false
                    });
                    boss.lastShotTime = currentTime;
                }
            }
            // 스위핑 탄막
            else if (boss.pattern === 2) {
                if (currentTime - boss.lastShotTime > 150) {
                    boss.attackAngle = (boss.attackAngle + 0.4) % (Math.PI * 2);
                    
                    const vx = Math.cos(boss.attackAngle) * 5;
                    const vy = Math.abs(Math.sin(boss.attackAngle) * 4) + 2; // 무조건 아래 방향으로 휘어짐

                    enemyBullets.push({
                        x: boss.x + boss.width / 2, y: boss.y + boss.height,
                        width: 8, height: 8, vx: vx, vy: vy, markedForDeletion: false
                    });
                    enemyBullets.push({
                        x: boss.x + boss.width / 2, y: boss.y + boss.height,
                        width: 8, height: 8, vx: -vx, vy: vy, markedForDeletion: false // 반대쪽으로도 대칭 발사
                    });
                    
                    boss.lastShotTime = currentTime;
                }
            }
        }
    }

    enemyBullets.forEach(eb => {
        eb.x += eb.vx; eb.y += eb.vy;
        if (eb.y > canvas.height || eb.x < 0 || eb.x > canvas.width) eb.markedForDeletion = true;
    });

    items.forEach(item => {
        item.y += item.speed;
        if (item.y > canvas.height) item.markedForDeletion = true;
    });

    explosions.forEach(exp => {
        if (currentTime - exp.lastFrameTime > exp.frameDelay) {
            exp.frame++;
            exp.lastFrameTime = currentTime;
            if (exp.frame >= 3) exp.markedForDeletion = true;
        }
    });

    // 충돌 처리
    bullets.forEach(bullet => {
        enemies.forEach(enemy => {
            if (!bullet.markedForDeletion && !enemy.markedForDeletion && isColliding(bullet, enemy)) {
                bullet.markedForDeletion = true;
                enemy.hp--;
                enemy.hitTime = currentTime;
                if (enemy.hp <= 0) {
                    enemy.markedForDeletion = true; // 죽을놈 마킹
                    score += enemy.scoreValue;
                    scoreBoard.innerText = `SCORE: ${score}`;
                    createExplosion(enemy.x, enemy.y, enemy.width, enemy.height);
                    if (enemy.isBig&& Math.random() < 0.3) spawnItem(enemy.x + enemy.width/2, enemy.y + enemy.height/2);
                } 
            }
        });

        if (boss && !bullet.markedForDeletion && isColliding(bullet, boss)) {
            bullet.markedForDeletion = true;
            boss.hp--;
            boss.hitTime = currentTime;
            
            bossHpBar.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;

            if (boss.hp <= 0) {
                createExplosion(boss.x + boss.width/2 - 40, boss.y + boss.height/2 - 40, 80, 80);
                createExplosion(boss.x + 20, boss.y + 20, 60, 60);
                createExplosion(boss.x + boss.width - 60, boss.y + boss.height - 60, 60, 60);
                
                score += 1000 * bossLevel; // 보스 렙이 높을수록 클리어 보상도 증가!
                scoreBoard.innerText = `SCORE: ${score}`;
                bossThreshold += 1500  * bossLevel; // 다음 보스 출현 점수 상향
                bossLevel++; // 다음 보스 레벨 업!
                
                
                boss = null;
                isBossStage = false; 
                bossHpContainer.style.display = 'none';
            }
        }
    });

    if (currentTime > player.invincibleUntil) {
        enemies.forEach(enemy => { if (!enemy.markedForDeletion && isColliding(player, enemy)) takeDamage(); });
        if (boss && isColliding(player, boss)) takeDamage();
        enemyBullets.forEach(eb => { if (!eb.markedForDeletion && isColliding(player, eb)) takeDamage(); });
    }

    items.forEach(item => {
        if (!item.markedForDeletion && isColliding(player, item)) {
            item.markedForDeletion = true;
            if (player.weaponLevel < 10) player.weaponLevel++;
            score += 100; 
            scoreBoard.innerText = `SCORE: ${score}`;
        }
    });
    // 마킹해놓은 놈들 빼고 살리기
    bullets = bullets.filter(b => !b.markedForDeletion);
    enemies = enemies.filter(e => !e.markedForDeletion);
    enemyBullets = enemyBullets.filter(eb => !eb.markedForDeletion);
    items = items.filter(i => !i.markedForDeletion);
    explosions = explosions.filter(exp => !exp.markedForDeletion);

    if (bombFlashTimer > 0) bombFlashTimer--;

    spawnEnemy();
}

// ============================================================================
// 9. 화면 렌더링 함수
// ============================================================================
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();

    items.forEach(item => {
        ctx.fillStyle = '#0984e3';
        ctx.fillRect(item.x, item.y, item.width, item.height);
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText('P', item.x + 4, item.y + 15);
    });

    if (images.player.complete) {
        if (now < player.invincibleUntil && !isPaused) {
            ctx.globalAlpha = Math.floor(now / 150) % 2 === 0 ? 0.3 : 1; 
        } else if (now < player.invincibleUntil && isPaused) {
            ctx.globalAlpha = 0.5; 
        }
        if (now - player.lastAnimTime > 100 && !isPaused) {
            player.animFrame = (player.animFrame + 1) % 3;
            player.lastAnimTime = now;
        }
        const sWidth = images.player.width / 3;
        const sHeight = images.player.height / 2;
        ctx.drawImage(images.player, player.animFrame * sWidth, 0, sWidth, sHeight, player.x, player.y, player.width, player.height);
        ctx.globalAlpha = 1; 
    }

    bullets.forEach(bullet => {
        if (images.bulletPlayer.complete) {
            const sWidth = images.bulletPlayer.width / 2;
            ctx.drawImage(images.bulletPlayer, sWidth, 0, sWidth, images.bulletPlayer.height, bullet.x, bullet.y, bullet.width, bullet.height);
        }
    });

    ctx.fillStyle = '#ff7675';
    enemyBullets.forEach(eb => {
        ctx.beginPath();
        ctx.arc(eb.x + eb.width/2, eb.y + eb.height/2, eb.width/2, 0, Math.PI * 2);
        ctx.fill();
    });

    enemies.forEach(enemy => {
        const isHit = (now - enemy.hitTime < 80);
        if (enemy.isBig && images.bigEnemy.complete) {
            if (now - enemy.lastAnimTime > 150 && !isPaused) { enemy.animFrame = (enemy.animFrame + 1) % 2; enemy.lastAnimTime = now; }
            let frame = isHit ? 2 : enemy.animFrame;
            ctx.drawImage(images.bigEnemy, frame * (images.bigEnemy.width / 3), enemy.spriteRow * (images.bigEnemy.height / 2), images.bigEnemy.width / 3, images.bigEnemy.height / 2, enemy.x, enemy.y, enemy.width, enemy.height);
        } else if (!enemy.isBig && images.enemy.complete) {
            if (now - enemy.lastAnimTime > 150 && !isPaused) { enemy.animFrame = (enemy.animFrame + 1) % 2; enemy.lastAnimTime = now; }
            let frame = isHit ? 2 : enemy.animFrame;
            ctx.drawImage(images.enemy, frame * (images.enemy.width / 3), enemy.spriteRow * (images.enemy.height / 4), images.enemy.width / 3, images.enemy.height / 4, enemy.x, enemy.y, enemy.width, enemy.height);
        }
    });

    if (boss && images.bigEnemy.complete) {
        if (now - boss.lastAnimTime > 150 && !isPaused) {
            boss.animFrame = (boss.animFrame + 1) % 2;
            boss.lastAnimTime = now;
        }
        const isHit = (now - boss.hitTime < 80);
        let frameIndex = isHit ? 2 : boss.animFrame;
        const sWidth = images.bigEnemy.width / 3;
        const sHeight = images.bigEnemy.height / 2;
        ctx.drawImage(images.bigEnemy, frameIndex * sWidth, boss.spriteRow * sHeight, sWidth, sHeight, boss.x, boss.y, boss.width, boss.height);
    }

    explosions.forEach(exp => {
        if (images.explosion.complete) {
            const sWidth = images.explosion.width / 3;
            ctx.drawImage(images.explosion, exp.frame * sWidth, 0, sWidth, images.explosion.height, exp.x, exp.y, exp.width, exp.height);
        }
    });

    if (bombFlashTimer > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${bombFlashTimer / 30})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// ============================================================================
// 10. 메인 루프 제어
// ============================================================================
function gameLoop() {
    if (!isPaused && !isGameOver) update();
    draw();
    if (!isGameOver) animationId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    isGameOver = true;
    localStorage.removeItem('1945_save_state'); 
    gameOverScreen.style.display = 'block';
    finalScore.innerText = `최종 점수: ${score}`;
    bossHpContainer.style.display = 'none'; 
    cancelAnimationFrame(animationId);
}

function resetGame() {
    localStorage.removeItem('1945_save_state');
    isGameOver = false;
    isPaused = false;
    score = 0;
    
    // 게임 재시작 시 보스 난이도 초기화
    bossThreshold = 500;
    bossLevel = 1;
    isBossStage = false;
    boss = null;
    
    player.x = canvas.width / 2 - 22;
    player.y = canvas.height - 80;
    player.bombs = 3;
    player.weaponLevel = 1;
    player.invincibleUntil = Date.now() + 2000; 
    
    scoreBoard.innerText = `SCORE: 0`;
    bombBoard.innerText = `BOMB (Z키): 3`;
    bossHpContainer.style.display = 'none';
    gameOverScreen.style.display = 'none';
    pauseScreen.style.display = 'none';
    
    bullets = []; enemies = []; enemyBullets = []; items = []; explosions = [];
    
    gameLoop();
}

const savedData = localStorage.getItem('1945_save_state');
if (savedData) {
    loadGameState(savedData);
}
gameLoop();