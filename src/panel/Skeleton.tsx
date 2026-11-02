// Placeholders in the panel while the data loads, shaped like what's coming: Home's cards and lists, a
// surface's list, or a page opened from a link. They shimmer unless motion is reduced.

import type { ReactNode } from 'react';

function Bone({ width, height = 12, className }: { width: string; height?: number; className?: string }) {
  return <span className={`skeleton${className ? ` ${className}` : ''}`} style={{ width, height }} />;
}

function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="skeletons" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}

function Rows({ count, meta = true }: { count: number; meta?: boolean }) {
  return (
    <ul className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <Bone width={`${58 - ((i * 13) % 24)}%`} height={14} />
          {meta && <Bone width={`${34 + ((i * 17) % 22)}%`} height={10} />}
        </li>
      ))}
    </ul>
  );
}

/** Home: the headline, the latest update cards and the lists under them. */
export function HomeSkeleton() {
  return (
    <Loading label="Loading what's happening">
      <section className="section" aria-hidden="true">
        <Bone width="46%" height={20} />
        <Bone width="82%" height={10} className="skeleton--gap" />
        <div className="skeleton-cards">
          <span className="skeleton skeleton-card" />
          <span className="skeleton skeleton-card" />
        </div>
      </section>
      <section className="section" aria-hidden="true">
        <Bone width="30%" height={14} />
        <Rows count={4} />
      </section>
    </Loading>
  );
}

/** A surface's list. */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <Loading label={`Loading ${label.toLowerCase()}`}>
      <section className="section" aria-hidden="true">
        <Bone width="40%" height={20} />
        <Rows count={7} />
      </section>
    </Loading>
  );
}

/** A page opened from a link before its data is in: name, figures and a section. The panel's header names the kind. */
export function DetailSkeleton({ kind }: { kind: string }) {
  return (
    <Loading label={`Loading this ${kind.toLowerCase()}`}>
      <section className="section" aria-hidden="true">
        <Bone width="70%" height={24} />
        <Bone width="45%" height={10} className="skeleton--gap" />
      </section>
      <div className="skeleton-stats" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i}>
            <Bone width="60%" height={10} />
            <Bone width="80%" height={18} />
          </span>
        ))}
      </div>
      <section className="section" aria-hidden="true">
        <Bone width="36%" height={14} />
        <span className="skeleton skeleton-chart" />
        <Rows count={3} meta={false} />
      </section>
    </Loading>
  );
}
