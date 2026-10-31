// The app icon: a time control board, a clock face on board yellow. The face
// sits well inside the safe zone, so the same art works as a maskable icon.
export function IconArt({ size }: { size: number }) {
  const face = Math.round(size * 0.56);
  const stroke = Math.max(2, Math.round(size * 0.07));
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffd100",
      }}
    >
      <svg width={face} height={face} viewBox="0 0 100 100" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={50 - (stroke * 50) / face}
          fill="none"
          stroke="#000000"
          strokeWidth={(stroke * 100) / face}
        />
        <path
          d="M50 22 V50 H72"
          fill="none"
          stroke="#000000"
          strokeWidth={(stroke * 100) / face}
          strokeLinecap="square"
        />
      </svg>
    </div>
  );
}
