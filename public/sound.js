class RetroAudioEngine {
  constructor() {
    this.ctx = null;
    this.bgmInterval = null;
    this.bgmSequence = [];
    this.currentNoteIndex = 0;
    this.tempoBPM = 120;
    this.isFastTempo = false;
    this.currentBgmType = null;
    this.masterVolume = null;
    this.isMuted = false;
  }

  // Inisialisasi AudioContext (Harus dipicu setelah interaksi klik murid)
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterVolume = this.ctx.createGain();
      this.masterVolume.gain.setValueAtTime(0.15, this.ctx.currentTime); // Volume sedang
      this.masterVolume.connect(this.ctx.destination);
      console.log("[AUDIO] Web Audio API Synthesizer initialized successfully.");
    } catch (e) {
      console.error("[AUDIO] Browser Anda tidak mendukung Web Audio API:", e);
    }
  }

  toggleMute() {
    if (!this.masterVolume) return;
    this.isMuted = !this.isMuted;
    this.masterVolume.gain.setValueAtTime(this.isMuted ? 0 : 0.15, this.ctx.currentTime);
    return this.isMuted;
  }

  // Sintesis SFX: UI Klik (Beep)
  playBeep() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square'; // Karakteristik 8-bit
    osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5 note
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  // Sintesis SFX: Serangan Tebasan (Slash)
  playSlash() {
    this.init();
    if (this.isMuted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    // Frekuensi turun dengan cepat (efek tebasan angin/pedang)
    osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  // Sintesis SFX: Karakter Terluka (Hurt)
  playHurt() {
    this.init();
    if (this.isMuted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.setValueAtTime(90, this.ctx.currentTime + 0.15); // Turun drastis
    
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  // Sintesis SFX: Efek Racun (Poison Buzz)
  playPoisonBuzz() {
    this.init();
    if (this.isMuted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.setValueAtTime(100, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  // Sintesis SFX: Penemuan Rune Rahasia (Secret Discovery)
  playSecretRune() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    
    // Arpeggio nada tinggi naik cepat (C5, E5, G5, C6, E6) khas game retro saat menemukan rahasia
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; 
    const noteLen = 0.07;
    const now = this.ctx.currentTime;
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle'; // Karakter suara retro yang lembut & misterius
      osc.frequency.setValueAtTime(freq, now + idx * noteLen);
      
      gain.gain.setValueAtTime(0.08, now + idx * noteLen);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * noteLen + noteLen * 25);
      
      osc.connect(gain);
      gain.connect(this.masterVolume);
      
      osc.start(now + idx * noteLen);
      osc.stop(now + idx * noteLen + noteLen * 2.5);
    });
  }

  // Sintesis SFX: Naik Level (Level Up Fanfare)
  playLevelUp() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    this.stopBGM(); // Stop sementara BGM

    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // Arpeggio C Major C4-C6
    const noteLen = 0.08;
    const now = this.ctx.currentTime;
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + idx * noteLen);
      
      gain.gain.setValueAtTime(0.12, now + idx * noteLen);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * noteLen + noteLen * 2);
      
      osc.connect(gain);
      gain.connect(this.masterVolume);
      
      osc.start(now + idx * noteLen);
      osc.stop(now + idx * noteLen + noteLen * 2);
    });

    // Mainkan BGM kembali setelah 1.5 detik
    setTimeout(() => {
      if (this.currentBgmType) this.playBGM(this.currentBgmType);
    }, 1500);
  }

  // Sintesis SFX: Menang Melawan Boss (Victory Theme JRPG)
  playVictory() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    this.stopBGM();

    const now = this.ctx.currentTime;
    // C Major Fanfare: C C C C Ab Bb C
    const melody = [
      { f: 523.25, d: 0.15 }, // C5
      { f: 523.25, d: 0.15 },
      { f: 523.25, d: 0.15 },
      { f: 523.25, d: 0.45 },
      { f: 415.30, d: 0.3 },  // Ab4
      { f: 466.16, d: 0.3 },  // Bb4
      { f: 523.25, d: 0.8 }   // C5
    ];

    let timeAcc = 0;
    melody.forEach((note) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(note.f, now + timeAcc);
      
      gain.gain.setValueAtTime(0.12, now + timeAcc);
      gain.gain.exponentialRampToValueAtTime(0.01, now + timeAcc + note.d);
      
      osc.connect(gain);
      gain.connect(this.masterVolume);
      
      osc.start(now + timeAcc);
      osc.stop(now + timeAcc + note.d);
      
      timeAcc += note.d;
    });

    setTimeout(() => {
      if (this.currentBgmType === 'battle') {
        this.playBGM('town');
      }
    }, timeAcc * 1000 + 500);
  }

  // Sintesis SFX: Kalah Pertarungan (Defeat Theme)
  playDefeat() {
    this.init();
    if (this.isMuted || !this.ctx) return;
    this.stopBGM();

    const now = this.ctx.currentTime;
    // Descending sad scale: C B Bb A Ab G F# F
    const melody = [
      { f: 392.00, d: 0.25 }, // G4
      { f: 370.00, d: 0.25 }, // F#4
      { f: 349.23, d: 0.25 }, // F4
      { f: 311.13, d: 0.25 }, // Eb4
      { f: 293.66, d: 0.25 }, // D4
      { f: 261.63, d: 0.25 }, // C4
      { f: 196.00, d: 0.8 }   // G3
    ];

    let timeAcc = 0;
    melody.forEach((note) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, now + timeAcc);
      
      gain.gain.setValueAtTime(0.18, now + timeAcc);
      gain.gain.exponentialRampToValueAtTime(0.01, now + timeAcc + note.d);
      
      osc.connect(gain);
      gain.connect(this.masterVolume);
      
      osc.start(now + timeAcc);
      osc.stop(now + timeAcc + note.d);
      
      timeAcc += note.d;
    });

    setTimeout(() => {
      this.playBGM('town');
    }, timeAcc * 1000 + 500);
  }

  // ==================== BGM SEQUENCER ENGINE ====================

  playBGM(type) {
    this.init();
    if (!this.ctx) return;
    
    this.stopBGM();
    this.currentBgmType = type;
    this.currentNoteIndex = 0;
    
    if (type === 'town') {
      this.tempoBPM = 110;
      this.isFastTempo = false;
      // Melodi Kota: Riang dan Santai
      // C4=261.6, D4=293.7, E4=329.6, G4=392.0, A4=440.0
      this.bgmSequence = [
        329.6, 392.0, 440.0, 392.0, 329.6, 261.6, 293.7, 329.6,
        329.6, 392.0, 440.0, 523.3, 440.0, 392.0, 329.6, 392.0,
        293.7, 329.6, 392.0, 329.6, 293.7, 261.6, 220.0, 261.6,
        293.7, 329.6, 293.7, 329.6, 392.0, 440.0, 523.3, 0 // Note 0 adalah rest/diam
      ];
    } else if (type === 'battle') {
      this.tempoBPM = this.isFastTempo ? 200 : 140; // Jika boss HP tipis, tempo melesat!
      // Melodi Battle: Menegangkan dan Bersemangat
      // Bassline + Melodi minor
      this.bgmSequence = [
        146.8, 146.8, 293.7, 146.8, 164.8, 164.8, 329.6, 164.8,
        174.6, 174.6, 349.2, 174.6, 196.0, 196.0, 392.0, 196.0,
        220.0, 220.0, 440.0, 220.0, 261.6, 261.6, 523.3, 261.6,
        293.7, 293.7, 587.3, 293.7, 392.0, 349.2, 329.6, 293.7
      ];
    }

    this.startSequencer();
  }

  startSequencer() {
    if (this.isMuted) return;
    
    const noteDuration = 60 / this.tempoBPM / 2; // Eighth notes
    
    const playNextNote = () => {
      if (!this.ctx || this.isMuted) return;

      const freq = this.bgmSequence[this.currentNoteIndex];
      const now = this.ctx.currentTime;
      
      if (freq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = this.currentBgmType === 'town' ? 'triangle' : 'square';
        osc.frequency.setValueAtTime(freq, now);
        
        gain.gain.setValueAtTime(0.04, now); // Volume BGM halus agar tidak bising
        gain.gain.exponentialRampToValueAtTime(0.001, now + noteDuration - 0.02);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.start(now);
        osc.stop(now + noteDuration);
      }

      this.currentNoteIndex = (this.currentNoteIndex + 1) % this.bgmSequence.length;
    };

    // Mainkan notasi pertama secara instan
    playNextNote();
    
    // Atur interval perulangan sequence
    this.bgmInterval = setInterval(playNextNote, noteDuration * 1000);
  }

  // Ubah tempo secara dinamis (Saran Konsultan: Adrenaline Trigger)
  setFastTempo(fast) {
    if (this.isFastTempo === fast) return;
    this.isFastTempo = fast;
    
    if (this.currentBgmType === 'battle') {
      console.log(`[AUDIO] Adrenaline Trigger! Menyesuaikan tempo battle. Fast: ${fast}`);
      this.playBGM('battle'); // Restart battle BGM dengan tempo baru
    }
  }

  stopBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
}

// Ekspor ke global window agar bisa diakses semua script frontend
window.audioEngine = new RetroAudioEngine();
