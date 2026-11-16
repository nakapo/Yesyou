export function Avatar({
  variant = 0,
  large = false,
}: {
  variant?: number;
  large?: boolean;
}) {
  const colors = ["#F39B8D", "#F5BF32", "#BED0B3", "#F46A16"];
  return (
    <svg
      className={large ? "avatar large" : "avatar"}
      viewBox="0 0 100 110"
      role="img"
      aria-label={`คาแรกเตอร์ ${variant + 1}`}
    >
      <rect
        x="2"
        y="2"
        width="96"
        height="106"
        rx="25"
        fill={colors[variant % 4]}
      />
      <path d="M12 110V84Q50 65 88 84V110" fill="#216B45" />
      <path d="M24 88h52m-58 12h64" stroke="#FFF0CF" strokeWidth="7" />
      <path
        d={
          variant % 2
            ? "M24 26Q30 8 65 18L79 73 52 89 25 70Z"
            : "M20 25Q55 5 78 27L73 72Q50 99 28 72Z"
        }
        fill="#FFF0CF"
        stroke="#174D33"
        strokeWidth="2"
      />
      <path
        d={
          variant % 3
            ? "M18 40Q8 4 56 10Q91 9 84 43L68 30 42 29 25 44Z"
            : "M17 43V22Q50-8 83 22V45L66 26 25 27Z"
        }
        fill="#182B23"
      />
      <path d="M28 48h18m12 0h17" stroke="#174D33" strokeWidth="3" />
      <path d="M35 49v7m30-7v7" stroke="#174D33" strokeWidth="5" />
      <path
        d="M51 48l-4 16 9 2M40 72q12 10 23-3"
        fill="none"
        stroke="#174D33"
        strokeWidth="2.5"
      />
      <circle cx="31" cy="65" r="6" fill="#F46A16" />
      <circle cx="70" cy="64" r="6" fill="#F46A16" />
      {variant % 2 === 1 && (
        <path
          d="M33 72q11-13 20-3 10-12 21 1-13 10-21 3-9 10-20-1"
          fill="#182B23"
        />
      )}
      {variant > 3 && (
        <g fill="none" stroke="#174D33" strokeWidth="2">
          <circle cx="36" cy="51" r="12" />
          <circle cx="66" cy="51" r="12" />
          <path d="M48 51h6" />
        </g>
      )}
    </svg>
  );
}
