import { MagnifyingGlassIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { Card } from '../../components/ui';
import { SALARY_FLOORS, salaryCompact } from '../../lib/salary';

export interface FilterState {
  kw: string; loc: string; remote: boolean; savedOnly: boolean;
  sort: 'match' | 'new'; salaryMin: number | null; salaryMax: number | null;
}
export const EMPTY_FILTERS: FilterState = {
  kw: '', loc: '', remote: true, savedOnly: false,
  sort: 'match', salaryMin: null, salaryMax: null,
};

function IconField({ icon, children, label }: {
  icon: React.ReactNode; children: React.ReactNode; label: string;
}) {
  return (
    <div>
      <label className="lbl">{label}</label>
      <span className="icon-field">
        <span aria-hidden="true" className="icon-field-ic">{icon}</span>
        {children}
      </span>
    </div>
  );
}

export function Filters({ value, onChange, onClear }: {
  value: FilterState;
  onChange: (patch: Partial<FilterState>, resetPage?: boolean) => void;
  onClear: () => void;
}) {
  const set = (patch: Partial<FilterState>) => onChange(patch, true);
  const num = (v: string) => (v === '' ? null : parseInt(v, 10));
  // An impossible range can't be selected: the max list only offers values
  // at or above the current min, and a min above the current max drops the
  // max. Both holds also repair any inverted pair from a hand-edited URL.
  const setMin = (min: number | null) => {
    const patch: Partial<FilterState> = { salaryMin: min };
    if (min !== null && value.salaryMax !== null && min > value.salaryMax) patch.salaryMax = null;
    set(patch);
  };
  return (
    <Card label="Filters" action={
      <button className="btn btn-ghost btn-sm" onClick={onClear}>Clear all</button>
    }>
      <div className="stack">
      <IconField icon={<MagnifyingGlassIcon width={16} />} label="Skills / keyword">
        <input value={value.kw} onChange={e => set({ kw: e.target.value })} placeholder="react, python..." aria-label="Skills or keyword" />
      </IconField>
      <IconField icon={<MapPinIcon width={16} />} label="Location">
        <input value={value.loc} onChange={e => set({ loc: e.target.value })} placeholder="City, state, or country..." aria-label="Location" />
      </IconField>
      <div>
        <span className="lbl" id="jw-salary">Salary range</span>
        <div className="row" role="group" aria-labelledby="jw-salary">
          <select aria-label="Minimum salary" value={value.salaryMin ?? ''} onChange={e => setMin(num(e.target.value))}>
            <option value="">$ min</option>
            {SALARY_FLOORS.map(s => <option key={s} value={s}>{salaryCompact(s)}</option>)}
          </select>
          <span className="muted" aria-hidden="true">–</span>
          <select aria-label="Maximum salary" value={value.salaryMax ?? ''} onChange={e => set({ salaryMax: num(e.target.value) })}>
            <option value="">$ max</option>
            {SALARY_FLOORS.filter(s => value.salaryMin === null || s >= value.salaryMin).map(s => (
              <option key={s} value={s}>{salaryCompact(s)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flt-remote">
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>
          <span className="t-small" style={{ fontWeight: 500, display: 'block' }}>Include remote / freelancing</span>
          <span className="muted t-caption" style={{ display: 'block' }}>Show remote and freelance opportunities</span>
        </span>
        <button type="button" className="switch" role="switch" aria-checked={value.remote} data-on={value.remote}
          aria-label="Include remote and freelance opportunities" onClick={() => set({ remote: !value.remote })} />
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />
      <div>
        <span className="lbl" id="jw-sort">Sort by</span>
        <div className="seg" role="group" aria-labelledby="jw-sort" style={{ display: 'flex', width: '100%' }}>
          {(['match', 'new'] as const).map(o => (
            <button key={o} type="button" data-on={value.sort === o} onClick={() => set({ sort: o })} style={{ flex: '1 1 auto' }}>
              {o === 'match' ? 'Best match' : 'Newest'}
            </button>
          ))}
        </div>
      </div>
      </div>
    </Card>
  );
}
