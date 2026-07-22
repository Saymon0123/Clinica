let audioCtx: AudioContext | null = null

function getContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// Desbloqueia o AudioContext no primeiro toque/clique do usuário
// (navegadores bloqueiam áudio automático sem interação prévia).
if (typeof window !== 'undefined') {
  const unlock = () => {
    getContext()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

function beep(frequency: number, startTime: number, duration: number, volume = 0.2) {
  const ctx = getContext()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(volume, ctx.currentTime + startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(ctx.currentTime + startTime)
  oscillator.stop(ctx.currentTime + startTime + duration)
}

export function playAppointmentSound() {
  try {
    beep(880, 0, 0.15)
    beep(1174, 0.15, 0.2)
  } catch (err) {
    console.error('Erro ao tocar som de agendamento:', err)
  }
}

export function playMessageSound() {
  try {
    beep(660, 0, 0.12)
    beep(660, 0.18, 0.12)
  } catch (err) {
    console.error('Erro ao tocar som de mensagem:', err)
  }
}
