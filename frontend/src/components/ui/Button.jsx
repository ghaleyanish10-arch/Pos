// Canonical variants: primary, success, danger, ghost, outline.
// dark/red/green/quiet are legacy aliases kept so existing pages keep working.
const variants = {
  outline: 'bg-white text-ink border border-line hover:border-ink/40 hover:bg-canvas',
  primary: 'bg-ink text-white border border-ink hover:bg-ink/90',
  dark: 'bg-ink text-white border border-ink hover:bg-ink/90',
  success: 'bg-status-green text-white border border-status-green hover:bg-status-green/90',
  green: 'bg-status-green text-white border border-status-green hover:bg-status-green/90',
  danger: 'bg-status-red text-white border border-status-red hover:bg-status-red/90',
  red: 'bg-status-red text-white border border-status-red hover:bg-status-red/90',
  ghost: 'bg-transparent text-meta border border-transparent hover:text-ink',
  quiet: 'bg-transparent text-meta border border-transparent hover:text-ink'
};

const sizes = {
  sm: 'h-8 px-3 text-13 rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-11 px-5 text-sm rounded-xl gap-2'
};

export function Button({
  variant = 'outline',
  size = 'md',
  icon,
  full,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center font-semibold transition-colors duration-150 ease-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}>

      {icon}
      {children}
    </button>);

}