// Confettis CSS purs (aucune dépendance) affichés à la réussite.
// Positions/couleurs déterministes pour rester léger et prévisible.

const COLORS = ['#ffd23f', '#2ee6a6', '#4f8cff', '#b26bff', '#ff7a3d', '#ff5c73'];

export function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => {
    const left = (i * 2.5 + (i % 5) * 3) % 100;
    const delay = (i % 10) * 0.06;
    const dur = 1.6 + (i % 6) * 0.18;
    const color = COLORS[i % COLORS.length];
    const size = 7 + (i % 4) * 2;
    return (
      <span
        key={i}
        style={{
          left: `${left}%`,
          background: color,
          width: size,
          height: size,
          animationDelay: `${delay}s`,
          animationDuration: `${dur}s`,
        }}
      />
    );
  });
  return <div className="confetti" aria-hidden>{pieces}</div>;
}
