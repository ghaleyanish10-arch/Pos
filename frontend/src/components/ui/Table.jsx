export function TableWrap({
  children,
  className = ''
}) {
  return (
    <div
      className={`scroll-thin overflow-x-auto rounded-card border border-line bg-surface ${className}`}>
      
      {children}
    </div>);

}

export function Table({ children }) {
  return <table className="w-full min-w-[720px] border-collapse text-sm">{children}</table>;
}

export function Th({
  children,
  className = ''
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap bg-surface px-4 py-3 text-left text-caption font-semibold text-meta ${className}`}>
      
      {children}
    </th>);

}

export function Td({
  children,
  className = '',
  colSpan
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3.5 align-middle text-ink ${className}`}>
      {children}
    </td>);

}

export function Tr({ children, className = '', ...rest }) {
  return (
    <tr
      {...rest}
      className={`border-t border-line transition-colors duration-150 ease-soft ${rest.onClick ? 'cursor-pointer hover:bg-canvas' : ''} ${className}`}>
      {children}
    </tr>);
}
