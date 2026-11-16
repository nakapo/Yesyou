import { avatars } from "./avatars";
export function Avatar({
  variant = 0,
  large = false,
}: {
  variant?: number;
  large?: boolean;
}) {
  const a =
    avatars[((variant % avatars.length) + avatars.length) % avatars.length];
  const woman = a.gender === "woman",
    dark = "#182B23";
  const long = ["bob", "long", "waves", "braids"].includes(a.style);
  return (
    <svg
      className={large ? "avatar large" : "avatar"}
      viewBox="0 0 100 110"
      role="img"
      aria-label={a.name}
    >
      <rect x="1" y="1" width="98" height="108" rx="23" fill={a.bg} />
      {long && (
        <path
          d={
            a.style === "waves"
              ? "M19 35Q5 10 40 8Q81-2 86 39L91 90 10 91 14 55Z"
              : "M15 87V33Q13 7 51 9Q85 9 84 38V88Z"
          }
          fill={a.hair}
        />
      )}
      {a.style === "bun" && <circle cx="50" cy="16" r="15" fill={a.hair} />}
      <path d="M7 110V94Q14 78 41 78H61Q86 78 94 95V110Z" fill={a.shirt} />
      <path d="M15 96h70M10 107h80" stroke="#FFF0CF" strokeWidth="5" />
      <path d="M40 72h20v18L50 96 40 88Z" fill={a.skin} />
      <ellipse cx="23" cy="55" rx="7" ry="10" fill={a.skin} />
      <ellipse cx="77" cy="55" rx="7" ry="10" fill={a.skin} />
      <path
        d={
          woman
            ? "M25 31Q50 12 75 32L71 67Q68 78 50 84Q30 80 27 65Z"
            : "M26 27Q50 14 75 30L73 69 53 85 29 72Z"
        }
        fill={a.skin}
        stroke={dark}
        strokeWidth="1.5"
      />
      <path
        d={
          a.style === "bob"
            ? "M21 45V25Q47 1 79 25V45L68 31H33L28 46Z"
            : a.style === "quiff"
              ? "M22 43Q9 20 28 22Q30-1 47 15Q68-4 77 19Q88 21 78 43L67 29 36 31Z"
              : a.style === "waves"
                ? "M20 45Q8 27 29 16Q45-4 70 15Q95 25 78 47L64 25Q43 44 26 33Z"
                : a.style === "long" || a.style === "braids"
                  ? "M21 49V26Q48-1 79 23V48L63 25 40 31 29 52Z"
                  : "M23 41V26Q44 7 74 25L79 42 65 30 35 32Z"
        }
        fill={a.hair}
      />
      {a.style === "curly" && (
        <g fill={a.hair}>
          {[25, 37, 50, 63, 76].map((x, i) => (
            <circle key={x} cx={x} cy={24 - (i % 2) * 6} r="12" />
          ))}
        </g>
      )}
      {a.style === "braids" && (
        <g stroke={a.hair} strokeWidth="11" fill="none">
          <path d="M23 45l-4 42M77 45l5 42" />
        </g>
      )}
      <path
        d={woman ? "M29 47q9-6 16-1M57 45q10-6 17-1" : "M28 44l18 2M57 44l17-3"}
        fill="none"
        stroke={dark}
        strokeWidth="2.5"
      />
      <path d="M30 51h15m13 0h14" stroke={dark} strokeWidth="2" />
      <path d="M38 51v5m27-5v5" stroke={dark} strokeWidth="4" />
      <path d="M51 48l-3 14 9 1" fill="none" stroke={dark} strokeWidth="2" />
      <circle cx="31" cy="65" r="5" fill="#E87451" />
      <circle cx="70" cy="65" r="5" fill="#E87451" />
      <path
        d={woman ? "M42 71q10 7 20-3-10 14-20 3" : "M40 72q10 6 22-2"}
        fill={woman ? "#B74337" : "none"}
        stroke={dark}
        strokeWidth="1.5"
      />
      {a.accessory === "cap" && (
        <g>
          <path d="M21 28Q23 3 53 8Q78 10 77 30Z" fill="#174D33" />
          <path
            d="M16 29h71q4 9-11 9H23Z"
            fill="#FFF0CF"
            stroke={dark}
            strokeWidth="2"
          />
          <path
            d="M36 73q10-13 17-3 10-13 22 1-15 8-22 3-12 8-17-1"
            fill={dark}
          />
        </g>
      )}
      {a.accessory === "beret" && (
        <g fill="#E79B40" stroke={dark} strokeWidth="2">
          <path d="M16 29Q12 11 43 9Q88 0 84 24L66 34 20 34Z" />
          <path d="M50 9V3" />
        </g>
      )}
      {a.accessory === "bucket" && (
        <g fill="#FFF0CF" stroke={dark} strokeWidth="2">
          <path d="M29 10h41l4 21H25Z" />
          <path d="M24 29h52l10 12H15Z" />
        </g>
      )}
      {a.accessory === "fedora" && (
        <g stroke={dark} strokeWidth="2">
          <path d="M23 31l6-23 21 8 22-8 7 25Z" fill="#A5613E" />
          <path d="M25 25h51v9H25Z" fill="#174D33" />
          <path d="M11 34q40-10 79 0l-6 8H17Z" fill="#E8BD75" />
        </g>
      )}
      {a.accessory === "sunhat" && (
        <g stroke={dark} strokeWidth="2">
          <path d="M27 28Q24 3 50 6Q76 2 75 29Z" fill="#E9C371" />
          <ellipse cx="50" cy="32" rx="46" ry="9" fill="#FFF0CF" />
          <path d="M26 22h49v7H26Z" fill="#B94F41" />
        </g>
      )}
      {a.accessory === "beanie" && (
        <g>
          <path d="M21 28Q20 2 50 4Q80 3 80 30Z" fill="#B8513D" />
          <path
            d="M20 24h60v14H20Z"
            fill="#EAA268"
            stroke={dark}
            strokeWidth="2"
          />
          <circle cx="50" cy="4" r="5" fill="#FFF0CF" />
        </g>
      )}
      {["round", "square", "catglasses", "aviator"].includes(a.accessory) && (
        <g
          fill="none"
          stroke={a.accessory === "catglasses" ? "#FFF0CF" : dark}
          strokeWidth="3"
        >
          {a.accessory === "round" ? (
            <>
              <circle cx="36" cy="53" r="11" />
              <circle cx="66" cy="53" r="11" />
            </>
          ) : a.accessory === "catglasses" ? (
            <>
              <path d="M23 44l25 3q0 20-18 15Z" />
              <path d="M54 47l25-3-7 18q-18 5-18-15Z" />
            </>
          ) : (
            <>
              <rect
                x="24"
                y="45"
                width="23"
                height="17"
                rx={a.accessory === "aviator" ? 8 : 2}
              />
              <rect
                x="55"
                y="45"
                width="23"
                height="17"
                rx={a.accessory === "aviator" ? 8 : 2}
              />
            </>
          )}
          <path d="M47 51h8M19 48l7 2m52 0 5-2" />
        </g>
      )}
      {a.accessory === "shades" && (
        <g fill={dark}>
          <path d="M22 45h26l-3 17H27ZM54 45h26l-5 17H58Z" />
          <path d="M44 49h14v4H44Z" />
          <path d="M29 47l9 9m23-9 9 9" stroke="#FFF0CF" strokeWidth="2" />
        </g>
      )}
      {a.accessory === "heart" && (
        <g fill="#A7314F" stroke="#FFF0CF" strokeWidth="2">
          <path d="M37 64L24 51q-4-15 12-7 15-9 14 6Z" />
          <path d="M66 64L53 51q-4-15 12-7 15-9 14 6Z" />
          <path d="M49 51h5" />
        </g>
      )}
      {a.accessory === "headphones" && (
        <g fill="#E5B345" stroke={dark} strokeWidth="3">
          <path
            d="M18 51V34Q19 8 51 8Q83 9 83 35V51"
            fill="none"
            strokeWidth="7"
          />
          <rect x="13" y="42" width="12" height="23" rx="5" />
          <rect x="77" y="42" width="12" height="23" rx="5" />
        </g>
      )}
      {a.accessory === "hoops" && (
        <g fill="none" stroke="#E5AE31" strokeWidth="4">
          <ellipse cx="20" cy="69" rx="6" ry="10" />
          <ellipse cx="81" cy="69" rx="6" ry="10" />
        </g>
      )}
      {a.accessory === "headband" && (
        <path
          d="M23 29q28-15 55 0"
          stroke="#FFF0CF"
          strokeWidth="8"
          fill="none"
        />
      )}
      {a.accessory === "bandana" && (
        <g fill="#D77D51">
          <path d="M21 27q29-10 59 0v9q-30-10-59 0Z" />
          <path d="M78 29l18 17-18-5 10 15-15-15Z" />
        </g>
      )}
      {a.accessory === "scarf" && (
        <path
          d="M35 84l16 8 16-8-2 15-13-3-2 14H35l8-17Z"
          fill="#EEC253"
          stroke={dark}
          strokeWidth="1.5"
        />
      )}
      {a.accessory === "bow" && (
        <path
          d="M61 24L54 7q18-5 19 9Q82 2 94 11l-9 17-12-8Z"
          fill="#B04C64"
          stroke={dark}
          strokeWidth="1.5"
        />
      )}
      {a.accessory === "star" && (
        <path
          d="M73 23l3-8 3 8h8l-6 5 2 8-7-4-7 4 2-8-6-5Z"
          fill="#EFC14F"
          stroke={dark}
          strokeWidth="1"
        />
      )}
      {a.accessory === "bolt" && (
        <path
          d="M81 61l-7 13h7l-4 14 13-19h-8l5-8Z"
          fill="#E8B638"
          stroke={dark}
          strokeWidth="1"
        />
      )}
      {a.accessory === "aviator" && (
        <path d="M29 65q4 24 23 22 20-4 22-22l-9 12-13 4-14-5Z" fill={a.hair} />
      )}
    </svg>
  );
}
