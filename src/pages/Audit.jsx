import React, { useState } from 'react';
import { ChevronDownIcon, LockIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { FilterChips, SearchInput } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { auditEvents } from '../data/admin';

const typeTone = {
  Void: 'red',
  Comp: 'amber',
  'Manual adjustment': 'blue',
  'Refund approval': 'purple'
};

export function Audit() {
  const [type, setType] = useState('All');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);

  const rows = auditEvents.filter(
    (e) =>
      (type === 'All' || e.type === type) &&
      (e.actor.toLowerCase().includes(query.toLowerCase()) ||
        e.summary.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Audit Trail" descriptor="1,940 events · immutable">
        <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-meta">
          <LockIcon className="h-3.5 w-3.5" />
          Read only
        </span>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterChips
          ariaLabel="Action type"
          options={['All', 'Void', 'Comp', 'Manual adjustment', 'Refund approval']}
          value={type}
          onChange={setType}
        />

        <SearchInput
          className="ml-auto w-full max-w-[260px]"
          placeholder="Search actor or action"
          value={query}
          onChange={setQuery}
        />
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Timestamp</Th>
              <Th>Actor</Th>
              <Th>Action type</Th>
              <Th>Summary</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const open = expanded === e.time;
              return (
                <React.Fragment key={e.time}>
                  <Tr onClick={() => setExpanded(open ? null : e.time)}>
                    <Td className="whitespace-nowrap font-mono text-sm text-meta">{e.time}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{e.actor}</span>
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-meta">
                          {e.role}
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <Pill tone={typeTone[e.type]} dot>
                        {e.type}
                      </Pill>
                    </Td>
                    <Td className="text-sm">{e.summary}</Td>
                    <Td className="text-right">
                      <ChevronDownIcon
                        className={`ml-auto h-4 w-4 text-meta transition-transform duration-150 ease-soft ${open ? 'rotate-180' : ''}`}
                      />
                    </Td>
                  </Tr>
                  {open && (
                    <tr className="border-t border-line bg-canvas">
                      <Td colSpan={5} className="px-4 py-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-line bg-surface p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                              Before
                            </p>
                            <p className="mt-1.5 font-mono text-sm text-ink">{e.before}</p>
                          </div>
                          <div className="rounded-xl border border-line bg-surface p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                              After
                            </p>
                            <p className="mt-1.5 font-mono text-sm text-ink">{e.after}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-meta">
                          <span className="rounded-full bg-canvas px-2 py-0.5 font-semibold text-ink">
                            {e.role}
                          </span>
                          {e.ip && (
                            <span>
                              IP: <span className="font-mono text-ink">{e.ip}</span>
                            </span>
                          )}
                          {e.device && (
                            <span>
                              Device: <span className="font-semibold text-ink">{e.device}</span>
                            </span>
                          )}
                        </div>
                      </Td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      <p className="mt-3 text-xs text-meta">
        Audit entries cannot be edited or deleted by any role, including Corporate Admin.
      </p>
    </div>
  );
}
