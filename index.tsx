import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from '@google/genai';

// --- Constants 🎮 ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_RADIUS = 12;
const SHADOW_DELAY = 75; // Slightly longer for more dramatic stalking
const GEM_SIZE = 10;
const PLAYER_SPEED = 4.0;
const HIDE_DISTANCE = 45;
const START_GRACE_FRAMES = 60;
const TILE_SIZE = 50;

// --- Audio Engine (Enhanced Synthesized SFX) 🔊 ---
class GameAudio {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    }
  }

  playCollect() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(1046.50, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playGameOver() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(20, this.ctx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.8);
  }

  playStep() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playStealthPulse() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }
}

const audio = new GameAudio();

// --- Types 🛠️ ---
type Point = { x: number; y: number };
type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

interface Barrier {
  x: number;
  y: number;
  emoji: string;
}

interface Gem {
  x: number;
  y: number;
  id: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const getDist = (p1: Point, p2: Point) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

const SelfStalker: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem('selfstalker_highscore')) || 0);
  const [shadowMessage, setShadowMessage] = useState<string>('');
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // Game Refs 🧠
  const playerPos = useRef<Point>({ x: 400, y: 300 });
  const playerHistory = useRef<Point[]>([]);
  const barriers = useRef<Barrier[]>([]);
  const gem = useRef<Gem | null>(null);
  const particles = useRef<Particle[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const requestRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>('MENU');
  const frameCount = useRef<number>(0);
  const screenShake = useRef<number>(0);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const generateRandomMaze = useCallback(() => {
    const newBarriers: Barrier[] = [];
    const treeEmojis = ['🌲', '🌳', '🌴', '🌵', '🎄'];
    const spawnPoint = { x: 400, y: 300 };
    
    // Fill with random density but maintain a grid-like corridor feel
    for (let row = 1; row < (CANVAS_HEIGHT / TILE_SIZE) - 1; row++) {
      for (let col = 1; col < (CANVAS_WIDTH / TILE_SIZE) - 1; col++) {
        const x = col * TILE_SIZE + TILE_SIZE / 2;
        const y = row * TILE_SIZE + TILE_SIZE / 2;
        
        // Skip spawn area
        if (getDist({ x, y }, spawnPoint) < 140) continue;

        // Randomized density check
        if (Math.random() < 0.28) {
          newBarriers.push({
            x: x + (Math.random() - 0.5) * 10, // Slight jitter
            y: y + (Math.random() - 0.5) * 10,
            emoji: treeEmojis[Math.floor(Math.random() * treeEmojis.length)]
          });
        }
      }
    }
    barriers.current = newBarriers;
  }, []);

  const initGame = useCallback(() => {
    audio.init();
    playerPos.current = { x: 400, y: 300 };
    playerHistory.current = [];
    setScore(0);
    setShadowMessage('');
    setIsHidden(false);
    particles.current = [];
    frameCount.current = 0;
    screenShake.current = 0;
    
    generateRandomMaze();
    spawnGem();
  }, [generateRandomMaze]);

  const spawnGem = useCallback(() => {
    let gx, gy, tooClose;
    let attempts = 0;
    do {
      gx = Math.random() * (CANVAS_WIDTH - 120) + 60;
      gy = Math.random() * (CANVAS_HEIGHT - 120) + 60;
      tooClose = barriers.current.some(b => getDist({ x: gx, y: gy }, b) < 45);
      attempts++;
    } while (tooClose && attempts < 100);
    gem.current = { x: gx, y: gy, id: Date.now() };
  }, []);

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 25; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color
      });
    }
  };

  const fetchShadowMessage = async (finalScore: number) => {
    setIsLoadingMessage(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Player was caught by their ghost in 'Stalker Maze'. Score: ${finalScore}. Give a cryptic, eerie 1-sentence message. Max 10 words. 1 emoji.`,
      });
      setShadowMessage(response.text || "You are simply a loop in time. 👣");
    } catch (e) {
      setShadowMessage("I was always the faster one. 🌑");
    } finally {
      setIsLoadingMessage(false);
    }
  };

  const gameOver = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    audio.playGameOver();
    screenShake.current = 30;
    setGameState('GAMEOVER');
    setScore(currentScore => {
      const prevHigh = Number(localStorage.getItem('selfstalker_highscore') || 0);
      if (currentScore > prevHigh) {
        localStorage.setItem('selfstalker_highscore', currentScore.toString());
        setHighScore(currentScore);
      }
      fetchShadowMessage(currentScore);
      return currentScore;
    });
  }, []);

  const togglePause = useCallback(() => {
    setGameState(prev => {
      if (prev === 'PLAYING') return 'PAUSED';
      if (prev === 'PAUSED') return 'PLAYING';
      return prev;
    });
  }, []);

  const update = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    frameCount.current++;
    if (screenShake.current > 0) screenShake.current *= 0.85;

    const move = { x: 0, y: 0 };
    if (keys.current['ArrowUp'] || keys.current['w']) move.y -= 1;
    if (keys.current['ArrowDown'] || keys.current['s']) move.y += 1;
    if (keys.current['ArrowLeft'] || keys.current['a']) move.x -= 1;
    if (keys.current['ArrowRight'] || keys.current['d']) move.x += 1;

    if (move.x !== 0 || move.y !== 0) {
      if (frameCount.current % 14 === 0) audio.playStep();
      const length = Math.sqrt(move.x * move.x + move.y * move.y);
      playerPos.current.x += (move.x / length) * PLAYER_SPEED;
      playerPos.current.y += (move.y / length) * PLAYER_SPEED;
    }

    playerPos.current.x = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, playerPos.current.x));
    playerPos.current.y = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, playerPos.current.y));

    playerHistory.current.push({ ...playerPos.current });
    if (playerHistory.current.length > SHADOW_DELAY + 1) {
      playerHistory.current.shift();
    }

    let hiding = false;
    barriers.current.forEach(b => {
      const dist = getDist(playerPos.current, b);
      if (dist < HIDE_DISTANCE) hiding = true;
      if (dist < 22) gameOver();
    });
    
    if (hiding && !isHidden) audio.playStealthPulse();
    setIsHidden(hiding);

    if (!hiding && frameCount.current > START_GRACE_FRAMES && playerHistory.current.length >= SHADOW_DELAY) {
      const shadowPos = playerHistory.current[0];
      if (getDist(playerPos.current, shadowPos) < PLAYER_RADIUS * 1.6) {
        gameOver();
      }
    }

    if (gem.current && getDist(playerPos.current, gem.current) < PLAYER_RADIUS + GEM_SIZE) {
      audio.playCollect();
      screenShake.current = 12;
      setScore(s => s + 1);
      createExplosion(gem.current.x, gem.current.y, '#00f7ff');
      spawnGem();
    }

    particles.current = particles.current.filter(p => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      return p.life > 0;
    });
  }, [gameOver, spawnGem, isHidden]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.save();
    
    if (screenShake.current > 0.5) {
      ctx.translate((Math.random() - 0.5) * screenShake.current, (Math.random() - 0.5) * screenShake.current);
    }

    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid System 🗺️
    ctx.strokeStyle = '#101025';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CANVAS_WIDTH; x += TILE_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y += TILE_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    // Stealth Aura Pre-draw
    barriers.current.forEach(b => {
      const grad = ctx.createRadialGradient(b.x, b.y, 5, b.x, b.y, HIDE_DISTANCE);
      grad.addColorStop(0, 'rgba(0, 247, 255, 0.08)');
      grad.addColorStop(1, 'rgba(0, 247, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(b.x, b.y, HIDE_DISTANCE, 0, Math.PI * 2); ctx.fill();
    });

    // Draw Random Barriers 🌲
    barriers.current.forEach(b => {
      ctx.font = '34px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.emoji, b.x, b.y);
    });

    // Particles ✨
    particles.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Gem 💎
    if (gem.current) {
      const floatY = Math.sin(Date.now() * 0.006) * 7;
      ctx.shadowBlur = 25; ctx.shadowColor = '#00f7ff';
      ctx.font = '30px serif';
      ctx.textAlign = 'center';
      ctx.fillText('💎', gem.current.x, gem.current.y + 10 + floatY);
      ctx.shadowBlur = 0;
    }

    // --- ENHANCED SHADOW (The "Best" One) 👣 ---
    if (playerHistory.current.length >= SHADOW_DELAY) {
      const shadowPos = playerHistory.current[0];
      const time = Date.now();
      
      // Pulsating aura layers
      for (let i = 1; i <= 3; i++) {
        const pulse = Math.sin(time * 0.01 - i) * 5;
        ctx.beginPath();
        ctx.arc(shadowPos.x, shadowPos.y, PLAYER_RADIUS * (1.2 + i * 0.4) + pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 0, 85, ${0.4 / i})`;
        ctx.fill();
      }

      // Glitch Chromatic Aberration Effect
      const glitchX = (Math.random() - 0.5) * 4;
      const glitchY = (Math.random() - 0.5) * 4;
      
      ctx.font = '28px serif';
      ctx.textAlign = 'center';
      
      // Cyan Glitch
      ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.fillText('👣', shadowPos.x + glitchX, shadowPos.y + 10 + glitchY);
      
      // Magenta Glitch
      ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
      ctx.fillText('👣', shadowPos.x - glitchX, shadowPos.y + 10 - glitchY);

      // Main Shadow Icon
      ctx.shadowBlur = 30; ctx.shadowColor = '#ff0055';
      ctx.fillStyle = '#ff0055';
      ctx.fillText('👣', shadowPos.x, shadowPos.y + 10);
      ctx.shadowBlur = 0;

      // Digital Noise/Sparks around shadow
      if (Math.random() > 0.7) {
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(shadowPos.x + (Math.random()-0.5)*40, shadowPos.y + (Math.random()-0.5)*40, 2, 2);
      }
    }

    // Player 🕵️‍♂️
    const p = playerPos.current;
    ctx.save();
    if (isHidden) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#00f7ff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_RADIUS + 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (frameCount.current < START_GRACE_FRAMES && Math.floor(Date.now() / 80) % 2 === 0) ctx.globalAlpha = 0.4;
    
    ctx.shadowBlur = 20; ctx.shadowColor = '#00f7ff';
    ctx.fillStyle = isHidden ? '#fff' : '#00f7ff';
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.font = '26px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🕵️‍♂️', p.x, p.y + 10);
    ctx.restore();

    ctx.restore(); // End shake

    // --- Post Processing ---
    // Scanlines
    ctx.fillStyle = 'rgba(10, 10, 30, 0.12)';
    for(let i=0; i<CANVAS_HEIGHT; i+=3) {
      ctx.fillRect(0, i, CANVAS_WIDTH, 1);
    }
    
    // Vignette
    const vignette = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 250, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 550);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, [isHidden]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    update();
    draw(ctx);
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [update, draw]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.key] = true;
      if (e.key === 'Escape') togglePause();
    };
    const handleKeyUp = (e: KeyboardEvent) => keys.current[e.key] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(requestRef.current);
    };
  }, [gameLoop, togglePause]);

  return (
    <div style={containerStyle}>
      <div style={hudStyle}>
        <div style={hudBoxStyle}>
          <span style={{color: '#666', fontSize: '11px', display: 'block', letterSpacing: '1px'}}>DATA_FRAGS</span>
          💎 {score}
        </div>
        <div style={{...hudBoxStyle, borderRight: 'none', borderLeft: '3px solid #00f7ff'}}>
          <span style={{color: '#666', fontSize: '11px', display: 'block', letterSpacing: '1px'}}>PEAK_LEVEL</span>
          🏆 {highScore}
        </div>
      </div>

      <div style={gameWrapperStyle}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={canvasStyle} />

        {isHidden && gameState === 'PLAYING' && (
          <div style={stealthIndicatorStyle}>ENCRYPTION ACTIVE 🌫️</div>
        )}

        {gameState === 'MENU' && (
          <div style={overlayStyle}>
            <h1 style={titleStyle}>STALKER_MAZE</h1>
            <p style={taglineStyle}>THE ECHO IS GETTING CLOSER.</p>
            <div style={instructionsStyle}>
              [WASD] Traversal Sequence<br/>
              Recover [💎] Data Packets<br/>
              Proximity to [🌲] Assets triggers Cloaking<br/>
              Do not touch the [👣] Glitch Trace.
            </div>
            <button onClick={() => { initGame(); setGameState('PLAYING'); }} style={buttonStyle}>
              MOUNT SYSTEM ⚡
            </button>
          </div>
        )}

        {gameState === 'PAUSED' && (
          <div style={overlayStyle}>
            <h2 style={{...titleStyle, fontSize: '42px'}}>LINK_SUSPENDED</h2>
            <button onClick={togglePause} style={buttonStyle}>RESUME_LINK ⏯️</button>
            <button onClick={() => setGameState('MENU')} style={secondaryButtonStyle}>TERMINATE ❌</button>
          </div>
        )}

        {gameState === 'GAMEOVER' && (
          <div style={overlayStyle}>
            <h2 style={gameOverHeaderStyle}>TRACE_COLLISION 💀</h2>
            <div style={finalScoreStyle}>DATA RECOVERED: {score} UNITS</div>
            
            <div style={shadowBoxStyle}>
              {isLoadingMessage ? 'Decoding terminal logs... 📡' : `"${shadowMessage}"`}
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
              <button onClick={() => { initGame(); setGameState('PLAYING'); }} style={buttonStyle}>
                RE-INITIALIZE 🔄
              </button>
              <button onClick={() => setGameState('MENU')} style={secondaryButtonStyle}>
                EXIT_STREAM 🚪
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={footerStyle}>
        STALKER_OS_v1.4 // RANDOM_GEN_MAP // GLITCH_SHADOW_LOADED
      </div>
    </div>
  );
};

// --- Styles 🎨 ---
const containerStyle: React.CSSProperties = {
  width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', backgroundColor: '#010103',
  color: '#e0e0e0', fontFamily: '"Courier New", Courier, monospace',
  overflow: 'hidden', userSelect: 'none'
};

const hudStyle: React.CSSProperties = {
  position: 'absolute', top: '25px', width: '800px',
  display: 'flex', justifyContent: 'space-between',
  zIndex: 10
};

const hudBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(0, 10, 15, 0.9)',
  borderRight: '3px solid #00f7ff',
  padding: '10px 22px',
  fontSize: '30px',
  fontWeight: 'bold',
  color: '#00f7ff',
  textShadow: '0 0 10px rgba(0,247,255,0.5)',
  boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
};

const gameWrapperStyle: React.CSSProperties = {
  position: 'relative', border: '1px solid #1a1a2e',
  borderRadius: '4px', boxShadow: '0 0 120px rgba(0,247,255,0.08)',
  backgroundColor: '#000'
};

const canvasStyle: React.CSSProperties = { display: 'block', borderRadius: '2px' };

const overlayStyle: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
  backgroundColor: 'rgba(0, 0, 5, 0.96)',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', zIndex: 20, backdropFilter: 'blur(12px)',
  textAlign: 'center'
};

const titleStyle: React.CSSProperties = {
  fontSize: '64px', margin: '0 0 10px 0', color: '#00f7ff',
  textShadow: '0 0 30px rgba(0,247,255,0.8)',
  letterSpacing: '10px', fontWeight: '900'
};

const taglineStyle: React.CSSProperties = {
  color: '#ff0055', fontSize: '15px', fontWeight: 'bold',
  marginBottom: '45px', letterSpacing: '3px'
};

const instructionsStyle: React.CSSProperties = {
  marginBottom: '45px', lineHeight: '2', color: '#888',
  fontSize: '17px', background: 'rgba(0,247,255,0.02)',
  padding: '20px 35px', border: '1px solid rgba(0,247,255,0.1)'
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#00f7ff', color: '#000', border: 'none',
  padding: '16px 40px', fontSize: '20px', fontWeight: '900',
  cursor: 'pointer', borderRadius: '0', transition: 'all 0.1s',
  boxShadow: '5px 5px 0px #ff0055', fontFamily: 'inherit',
  margin: '10px'
};

const secondaryButtonStyle: React.CSSProperties = {
  backgroundColor: 'transparent', color: '#00f7ff', border: '1px solid #00f7ff',
  padding: '15px 39px', fontSize: '20px', fontWeight: 'bold',
  cursor: 'pointer', borderRadius: '0', fontFamily: 'inherit',
  margin: '10px'
};

const gameOverHeaderStyle: React.CSSProperties = {
  fontSize: '50px', color: '#ff0055', margin: '0 0 20px 0',
  textShadow: '0 0 25px #ff0055', letterSpacing: '4px'
};

const finalScoreStyle: React.CSSProperties = {
  fontSize: '24px', marginBottom: '35px', color: '#ffd700',
  letterSpacing: '5px'
};

const shadowBoxStyle: React.CSSProperties = {
  maxWidth: '520px', padding: '25px', border: '1px solid rgba(255, 0, 85, 0.3)',
  backgroundColor: 'rgba(255, 0, 85, 0.05)', fontSize: '19px',
  fontStyle: 'italic', color: '#00f7ff', marginBottom: '45px'
};

const stealthIndicatorStyle: React.CSSProperties = {
  position: 'absolute', bottom: '30px', left: '50%',
  transform: 'translateX(-50%)', border: '1px solid #00f7ff',
  color: '#00f7ff', padding: '6px 20px', borderRadius: '0',
  fontSize: '14px', fontWeight: 'bold', background: 'rgba(0,0,0,0.8)'
};

const footerStyle: React.CSSProperties = {
  position: 'absolute', bottom: '20px', fontSize: '10px',
  opacity: 0.25, letterSpacing: '4px'
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<SelfStalker />);
}
