/* Skeleton loaders (D-034). One per screen, built from the screen's own layout classes so nothing jumps when the
   real content arrives. Use these (or a new one in this file) wherever content is not ready: never a blank screen. */

import type { CSSProperties, ReactNode } from "react";

/** One grey placeholder block. Sizes are in px, or any CSS length. */
export function Sk({ w, h = 16, r, style }: { w?: number | string; h?: number | string; r?: number | string; style?: CSSProperties }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

function Busy({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr">Loading…</span>
      {children}
    </div>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function HomeSkeleton() {
  return (
    <Busy>
      <div className="home-top">
        <div className="eyebrow"><Sk w={200} h={20} /></div>
        <h1 className="greeting"><Sk w={340} h={38} /></h1>
      </div>

      <h2 className="section-title" style={{ marginTop: 0 }}>Workflow</h2>
      <div className="wf-grid">
        {range(4).map((i) => (
          <div className="wf-card" key={i} style={{ "--bar": "var(--line)" } as CSSProperties}>
            <div className="top"><Sk w={90} h={16} /></div>
            <Sk w={70} h={40} />
            <div className="lbl"><Sk w={120} h={17} /></div>
            <div className="ln"><Sk w="60%" h={14} /></div>
            <div className="ln"><Sk w="50%" h={14} /></div>
          </div>
        ))}
      </div>

      <div className="home-grid">
        <div className="col">
          <h2 className="section-title">Today&apos;s appointments</h2>
          <div className="card">
            <div className="stats">
              {range(5).map((i) => (
                <div className="stat" key={i}>
                  <Sk w={50} h={13} />
                  <Sk w={36} h={30} style={{ marginTop: 6 }} />
                </div>
              ))}
            </div>
            {range(3).map((i) => (
              <div className="appt" key={i}>
                <Sk w={84} h={16} />
                <div className="t"><Sk w="55%" h={16} /><Sk w="35%" h={14} style={{ marginTop: 6 }} /></div>
                <Sk w={84} h={24} r={999} />
              </div>
            ))}
          </div>
        </div>
        <div className="col aside">
          <h2 className="section-title">My messages</h2>
          <div className="card list-card">
            {range(4).map((i) => (
              <div className="msgrow" key={i}>
                <span className="dot-u" />
                <div className="m"><Sk w="45%" h={16} /><Sk w="90%" h={14} style={{ margin: "8px 0" }} /><Sk w={56} h={22} r={999} /></div>
              </div>
            ))}
          </div>
          <h2 className="section-title" style={{ marginTop: 0 }}>Upcoming consultations</h2>
          <div className="card list-card">
            {range(3).map((i) => (
              <div className="task" key={i}><div style={{ flex: 1 }}><Sk w="50%" h={16} /><Sk w="75%" h={13} style={{ marginTop: 6 }} /></div></div>
            ))}
          </div>
        </div>
      </div>
    </Busy>
  );
}

export function ClientsSkeleton() {
  return (
    <Busy>
      <div className="page-head">
        <h1>Clients</h1>
        <div className="actions">
          <Sk w={112} h={38} r={8} />
          <Sk w={152} h={38} r={8} />
        </div>
      </div>

      <div className="kpis">
        {range(3).map((i) => (
          <div className="card kpi" key={i}>
            <div className="h"><Sk w={110} h={18} /></div>
            <div className="s"><Sk w={80} h={13} /></div>
            <div className="n"><Sk w={64} h={30} /></div>
          </div>
        ))}
      </div>

      <div className="list-head"><h2>All clients</h2></div>
      <div className="toolbar">
        <Sk w={118} h={38} r={999} />
        <Sk w={280} h={44} r={8} style={{ maxWidth: "100%" }} />
      </div>

      <div className="table-wrap">
        <table className="table single uniform" id="tbl">
          <colgroup>
            <col style={{ width: 240 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 300 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr><th><div className="name-cell"><Sk w={22} h={22} r={4} />Name</div></th><th>Phone</th><th>Email</th><th>Address</th><th>Type</th><th>Last Activity</th></tr>
          </thead>
          <tbody>
            {range(10).map((i) => (
              <tr key={i}>
                <td><div className="name-cell"><Sk w={22} h={22} r={4} /><Sk w="60%" h={16} /></div></td>
                <td><Sk w={110} h={16} /></td>
                <td><Sk w="80%" h={16} /></td>
                <td><Sk w="85%" h={16} /></td>
                <td><Sk w={80} h={22} r={999} /></td>
                <td><Sk w={50} h={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Busy>
  );
}

export function ClientSkeleton() {
  return (
    <Busy>
      <div className="client-head">
        <div className="left">
          <div className="who"><Sk w={88} h={22} r={999} /></div>
          <div className="name-row"><Sk w={320} h={34} /></div>
        </div>
        <Sk w={98} h={38} r={8} />
      </div>

      <dl className="fields">
        {range(6).map((i) => (
          <div className="f" key={i}><dt><Sk w={70} h={16} /></dt><dd><Sk w="65%" h={16} /></dd></div>
        ))}
      </dl>

      <div className="tabs">
        <span className="tab" style={{ padding: "12px 8px" }}><Sk w={130} h={18} /></span>
        <span className="tab" style={{ padding: "12px 8px" }}><Sk w={60} h={18} /></span>
      </div>

      <div className="layout-2col">
        <div className="main-col">
          {range(2).map((i) => (
            <section className="card panel" key={i}>
              <div className="ph"><Sk w={180} h={24} /></div>
              <div className="pad">
                {range(2).map((j) => (
                  <div key={j} style={{ padding: "10px 0" }}><Sk w="60%" h={16} /><Sk w="30%" h={14} style={{ marginTop: 6 }} /></div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="aside">
          <div className="card">
            <Sk w={100} h={20} />
            <Sk w={130} h={28} style={{ marginTop: 14 }} />
            <Sk w={90} h={13} style={{ marginTop: 6 }} />
            <Sk w={130} h={28} style={{ marginTop: 14 }} />
            <Sk w={100} h={13} style={{ marginTop: 6 }} />
          </div>
          <div className="card">
            <Sk w={70} h={20} />
            <Sk h={110} r={10} style={{ marginTop: 12 }} />
          </div>
        </aside>
      </div>
    </Busy>
  );
}

export function FormSkeleton() {
  // One cell of a joined field group: a short label line inside a 50px box, like the real fields.
  const cell = (key: number, w = 90) => (
    <div className="fl" key={key} style={{ height: 50, padding: "16px 16px 0" }}>
      <Sk w={w} h={14} />
    </div>
  );
  const group = (rows: number[][]) => (
    <div className="jgroup">
      {rows.map((r, i) => (
        <div className={`jrow${r.length > 1 ? " two" : ""}`} key={i}>{r.map((w, j) => cell(j, w))}</div>
      ))}
    </div>
  );
  return (
    <Busy>
      <div className="form-wrap">
        <h1><Sk w={220} h={34} /></h1>
        <section className="fsec">
          <div><Sk w={190} h={20} /><Sk w={230} h={13} style={{ marginTop: 10 }} /><Sk w={180} h={13} style={{ marginTop: 6 }} /></div>
          <div className="fields-col">
            <div className="jwrap"><Sk w={70} h={13} /><Sk w={230} h={44} r={8} /></div>
            {group([[80, 80], [110]])}
            <Sk w={110} h={18} />
            {group([[100]])}
            {group([[60]])}
            <Sk w={70} h={18} />
            {group([[70]])}
          </div>
        </section>
        <section className="fsec">
          <div><Sk w={150} h={20} /><Sk w={220} h={13} style={{ marginTop: 10 }} /></div>
          <div className="fields-col">{group([[70], [70], [40, 40], [70]])}</div>
        </section>
        <section className="fsec">
          <div><Sk w={70} h={20} /><Sk w={190} h={13} style={{ marginTop: 10 }} /></div>
          <div className="fields-col"><div className="jgroup"><div className="fl" style={{ height: 110, padding: "16px 16px 0" }}><Sk w={50} h={14} /></div></div></div>
        </section>
      </div>
    </Busy>
  );
}

export function RequestsSkeleton() {
  return (
    <Busy>
      <div className="page-head">
        <h1>Requests</h1>
        <div className="actions">
          <Sk w={124} h={38} r={8} />
          <Sk w={152} h={38} r={8} />
        </div>
      </div>

      <div className="kpis compact">
        <div className="card kpi">
          <div className="h"><Sk w={90} h={18} /></div>
          <div style={{ display: "grid", gap: 9, marginTop: 16 }}>
            {range(5).map((i) => (<Sk key={i} w={`${62 - i * 6}%`} h={14} />))}
          </div>
        </div>
        {range(2).map((i) => (
          <div className="card kpi" key={i}>
            <div className="h"><Sk w={130} h={18} /></div>
            <div className="s"><Sk w={80} h={13} /></div>
            <div className="n"><Sk w={64} h={30} /></div>
          </div>
        ))}
      </div>

      <div className="list-head"><h2>All requests</h2></div>
      <div className="toolbar">
        <div className="chips"><Sk w={118} h={38} r={999} /><Sk w={150} h={38} r={999} /></div>
        <Sk w={280} h={44} r={8} style={{ maxWidth: "100%" }} />
      </div>

      <div className="table-wrap">
        <table className="table single" id="tbl">
          <colgroup>
            <col style={{ width: 240 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 250 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr><th>Client</th><th>Title</th><th>Property</th><th>Contact</th><th>Requested</th><th className="num">Status</th></tr>
          </thead>
          <tbody>
            {range(10).map((i) => (
              <tr key={i}>
                <td><Sk w="70%" h={16} /></td>
                <td><Sk w="65%" h={16} /></td>
                <td><Sk w="85%" h={16} /></td>
                <td><Sk w="75%" h={16} /></td>
                <td><Sk w={50} h={16} /></td>
                <td className="num"><Sk w={80} h={24} r={999} style={{ marginLeft: "auto" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Busy>
  );
}

export function UsersSkeleton() {
  return (
    <Busy>
      <div className="page-head">
        <h1>Manage team</h1>
        <div className="actions">
          <Sk w={110} h={40} r={8} />
          <Sk w={160} h={38} r={8} />
        </div>
      </div>
      <Sk w="70%" h={18} style={{ marginBottom: 22 }} />
      <div className="tabs"><span className="tab" style={{ padding: "12px 8px" }}><Sk w={50} h={18} /></span></div>
      <Sk h={52} r={10} />
      <h3 className="team-count"><Sk w={160} h={18} /></h3>
      <div className="table-card">
        <div className="table-wrap">
          <table className="table team-table">
            <colgroup>
              <col style={{ width: 230 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 230 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr><th>Name</th><th>Role</th><th>Businesses</th><th>Last Active</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {range(4).map((i) => (
                <tr key={i}>
                  <td><div className="member"><Sk w={34} h={34} r={999} /><Sk w="60%" h={16} /></div></td>
                  <td><Sk w="60%" h={16} /></td>
                  <td><Sk w="75%" h={16} /></td>
                  <td><Sk w="80%" h={16} /></td>
                  <td><Sk w={74} h={22} r={999} /></td>
                  <td><Sk w={28} h={28} r={8} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="team-foot"><Sk w={160} h={16} /><Sk w={260} h={42} r={8} /></div>
      </div>
    </Busy>
  );
}
