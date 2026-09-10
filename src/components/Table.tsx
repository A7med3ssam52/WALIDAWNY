import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  dense?: boolean;
}

export function Table({ dense = false, className, children, ...rest }: TableProps) {
  return (
    <div className="glass-card spotlight-card relative overflow-hidden p-0">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="overflow-x-auto">
        <table
          data-density={dense ? 'dense' : 'normal'}
          className={`w-full text-sm ${className ?? ''}`}
          {...rest}
        >
          {children}
        </table>
      </div>
    </div>
  );
}

type TableHeadProps = HTMLAttributes<HTMLTableSectionElement>;

export function TableHead({ className, children, ...rest }: TableHeadProps) {
  return (
    <thead
      className={`border-b border-white/8 bg-gradient-to-r from-white/5 via-white/3 to-transparent text-start backdrop-blur ${className ?? ''}`}
      {...rest}
    >
      {children}
    </thead>
  );
}

type TableBodyProps = HTMLAttributes<HTMLTableSectionElement>;

export function TableBody({ className, children, ...rest }: TableBodyProps) {
  return (
    <tbody className={className ?? ''} {...rest}>
      {children}
    </tbody>
  );
}

type TableRowProps = HTMLAttributes<HTMLTableRowElement>;

export function TableRow({ className, children, ...rest }: TableRowProps) {
  return (
    <tr
      className={`group/row border-b border-white/5 transition-all duration-200 last:border-0 hover:bg-gradient-to-r hover:from-indigo-500/[0.07] hover:via-purple-500/[0.04] hover:to-transparent hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className ?? ''}`}
      {...rest}
    >
      {children}
    </tr>
  );
}

type TableHeadCellProps = ThHTMLAttributes<HTMLTableCellElement>;

export function TableHeadCell({ className, children, ...rest }: TableHeadCellProps) {
  return (
    <th
      className={`px-4 py-3 text-start text-xs font-bold tracking-wider text-foreground-subtle uppercase ${className ?? ''}`}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  label?: string;
}

export function TableCell({ label = '', className, children, ...rest }: TableCellProps) {
  return (
    <td
      data-label={label}
      className={`px-4 py-3 text-foreground-muted ${className ?? ''}`}
      {...rest}
    >
      {children}
    </td>
  );
}
