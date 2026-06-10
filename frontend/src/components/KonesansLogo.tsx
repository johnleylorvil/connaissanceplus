interface KonesansLogoProps {
  /** Size in pixels (applied to both width and height). Default: 48 */
  size?: number
  /** Show the brand name next to the icon. Default: false */
  showName?: boolean
  /** Class applied to the outer wrapper */
  className?: string
}

/**
 * Official Konesans+ logo — uses the official SVG asset.
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
      <img
        src="/favicon.svg"
        alt="Konesans+ logo"
        width={size}
        height={size}
        style={{ flexShrink: 0, borderRadius: Math.round(size * 0.18) }}
      />

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
