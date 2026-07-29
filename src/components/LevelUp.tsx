// Overlay plein écran de montée de niveau — récompense motivante.

export function LevelUp({ level, onClose }: { level: number; onClose: () => void }) {
  return (
    <div className="levelup" onClick={onClose}>
      <div className="box">
        <div className="ring">{level}</div>
        <h2>Niveau {level} !</h2>
        <p>Tu progresses. Continue sur ta lancée 🚀</p>
        <button className="btn" style={{ maxWidth: 220, margin: '0 auto' }} onClick={onClose}>
          Continuer
        </button>
      </div>
    </div>
  );
}
