interface KonesansLogoProps {
  /** Size in pixels (applied to both width and height). Default: 48 */
  size?: number
  /** Show the brand name next to the icon. Default: false */
  showName?: boolean
  /** Class applied to the outer wrapper */
  className?: string
}

/**
 * Official Konesans+ logo — student reaching for a star above an open book.
 * Colors: navy #0D1B2A · gold #C9A227 · cream white #F5EFE0
 */
export default function KonesansLogo({ size = 48, showName = false, className }: KonesansLogoProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: Math.round(size * 0.25),
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-label="Konesans+ logo"
        role="img"
        style={{ flexShrink: 0 }}
      >
        {/* Background */}
        <rect width="100" height="100" rx="18" fill="#0D1B2A" />

        {/* Open book – left page */}
        <path d="M10 82 Q30 72 50 74 L50 90 Q30 88 10 90 Z" fill="#C9A227" />
        {/* Open book – right page (slightly darker for depth) */}
        <path d="M90 82 Q70 72 50 74 L50 90 Q70 88 90 90 Z" fill="#B8911F" />
        {/* Book spine */}
        <line x1="50" y1="74" x2="50" y2="90" stroke="#0D1B2A" strokeWidth="2" />

        {/* Person – head */}
        <circle cx="44" cy="26" r="7" fill="#F5EFE0" />
        {/* Person – body */}
        <path d="M38 34 Q44 31 50 34 L52 60 L36 60 Z" fill="#F5EFE0" />
        {/* Person – left arm (balance) */}
        <line x1="39" y1="42" x2="22" y2="56" stroke="#F5EFE0" strokeWidth="5" strokeLinecap="round" />
        {/* Person – right arm reaching to star */}
        <line x1="50" y1="37" x2="68" y2="18" stroke="#F5EFE0" strokeWidth="5" strokeLinecap="round" />
        {/* Person – legs */}
        <line x1="40" y1="60" x2="36" y2="74" stroke="#F5EFE0" strokeWidth="4.5" strokeLinecap="round" />
        <line x1="46" y1="60" x2="49" y2="74" stroke="#F5EFE0" strokeWidth="4.5" strokeLinecap="round" />

        {/* Gold star */}
        <polygon
          points="74,8 76.7,15.6 84.8,15.6 78.5,20.3 81.2,27.9 74,23.2 66.8,27.9 69.5,20.3 63.2,15.6 71.3,15.6"
          fill="#C9A227"
        />
      </svg>

      {showName && (
        <span
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontWeight: 700,
            fontSize: Math.round(size * 0.42),
            color: '#F5EFE0',
            letterSpacing: '-0.01em',
            lineHeight: 1,
          }}
        >
          Konesans
          <span style={{ color: '#C9A227' }}>+</span>
        </span>
      )}
    </div>
  )
}
