const variants = {
  outline:
  'bg-white text-ink border border-line hover:border-ink/40 hover:bg-canvas disabled:text-meta',
  dark: 'bg-ink text-white border border-ink hover:bg-black',
  green:
  'bg-status-green text-white border border-status-green hover:bg-[#116330]',
  red: 'bg-status-red text-white border border-status-red hover:bg-[#B32A23]',
  quiet: 'bg-transparent text-meta border border-transparent hover:text-ink'
};

const sizes = {
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2'
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
      className={`inline-flex items-center justify-center font-semibold transition-colors duration-150 ease-soft disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}>
      
      {icon}
      {children}
    </button>);

}
