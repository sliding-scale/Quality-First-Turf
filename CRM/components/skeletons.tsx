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

      <div className="list-head"><h2>Filtered clients</h2></div>
      <div className="toolbar">
        <div className="chips"><Sk w={139} h={38} r={999} /><Sk w={190} h={38} r={999} /></div>
        <Sk w={280} h={44} r={8} style={{ maxWidth: "100%" }} />
      </div>

      <div className="table-wrap">
        <table className="table single uniform jb" id="tbl">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr><th><div className="name-cell"><Sk w={22} h={22} r={4} />Name</div></th><th>Address</th><th>Tags</th><th>Status</th><th>Last Activity</th></tr>
          </thead>
          <tbody>
            {range(10).map((i) => (
              <tr key={i}>
                <td><div className="name-cell"><Sk w={22} h={22} r={4} /><Sk w="60%" h={16} /></div></td>
                <td><Sk w="85%" h={16} /></td>
                <td><Sk w={80} h={24} r={16} /></td>
                <td><Sk w={64} h={24} r={12} /></td>
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
      <div className="cj cj-cols">
        <div className="cj-main">
        <div className="cj-top">
          <div className="cj-who"><Sk w={22} h={22} r={11} /><Sk w={70} h={24} r={12} /></div>
          <div className="cj-actions"><Sk w={40} h={40} r={8} /><Sk w={40} h={40} r={8} /><Sk w={98} h={40} r={8} /></div>
        </div>
        <div className="cj-name"><Sk w={420} h={38} /></div>
        <div className="cj-fields">
          <dl>{range(2).map((i) => <div className="f" key={i}><dt><Sk w={90} h={16} /></dt><dd><Sk w="55%" h={16} /></dd></div>)}</dl>
          <dl>{range(3).map((i) => <div className="f" key={i}><dt><Sk w={100} h={16} /></dt><dd><Sk w="50%" h={16} /></dd></div>)}</dl>
        </div>
            <div className="cj-tabs">
              <span className="cj-tab"><Sk w={120} h={18} /></span>
              <span className="cj-tab"><Sk w={100} h={18} /></span>
              <span className="cj-tab"><Sk w={110} h={18} /></span>
            </div>
            <div className="cj-stack">
              {range(3).map((i) => (
                <section className="cj-card" key={i}>
                  <div className="cj-card-head"><Sk w={160} h={24} /><Sk w={40} h={40} r={8} /></div>
                  <div style={{ padding: "0 16px 16px" }}><Sk w="60%" h={16} /><Sk w="30%" h={14} style={{ marginTop: 8 }} /></div>
                </section>
              ))}
            </div>
          </div>
          <aside className="cj-aside">
            <section className="cj-side"><Sk w={90} h={20} /><Sk w={110} h={26} style={{ marginTop: 14 }} /><Sk w={110} h={26} style={{ marginTop: 14 }} /></section>
            <section className="cj-side"><Sk w={60} h={20} /><Sk w={90} h={24} r={12} style={{ marginTop: 14 }} /></section>
            <section className="cj-side"><Sk w={60} h={20} /><Sk h={120} r={8} style={{ marginTop: 14 }} /></section>
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

/** The Quotes list (D-056): the same layout as the page, with the four figure cards. */
export function QuotesSkeleton() {
  return (
    <Busy>
      <div className="page-head">
        <h1>Quotes</h1>
        <div className="actions">
          <Sk w={110} h={38} r={8} />
          <Sk w={152} h={38} r={8} />
        </div>
      </div>

      <div className="kpis compact four">
        <div className="card kpi">
          <div className="h"><Sk w={90} h={18} /></div>
          <div style={{ display: "grid", gap: 9, marginTop: 16 }}>
            {range(4).map((i) => (<Sk key={i} w={`${72 - i * 6}%`} h={14} />))}
          </div>
        </div>
        {range(3).map((i) => (
          <div className="card kpi" key={i}>
            <div className="h"><Sk w={130} h={18} /></div>
            <div className="s"><Sk w={80} h={13} /></div>
            <div className="n"><Sk w={64} h={30} /></div>
          </div>
        ))}
      </div>

      <div className="list-head"><h2>All quotes</h2></div>
      <div className="toolbar">
        <div className="chips"><Sk w={118} h={38} r={999} /><Sk w={150} h={38} r={999} /><Sk w={170} h={38} r={999} /></div>
        <Sk w={280} h={44} r={8} style={{ maxWidth: "100%" }} />
      </div>

      <div className="table-wrap">
        <table className="table single" id="tbl">
          <colgroup>
            <col style={{ width: 250 }} />
            <col style={{ width: 260 }} />
            <col style={{ width: 280 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr><th>Client</th><th>Quote number</th><th>Property</th><th>Created</th><th>Status</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {range(8).map((i) => (
              <tr key={i}>
                <td><Sk w="70%" h={16} /></td>
                <td><Sk w="65%" h={16} /></td>
                <td><Sk w="85%" h={16} /></td>
                <td><Sk w={80} h={16} /></td>
                <td><Sk w={96} h={24} r={999} /></td>
                <td className="num"><Sk w={70} h={16} style={{ marginLeft: "auto" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Busy>
  );
}

/** One quote (D-056): the head, the client and facts, a few sections and the notes column. */
export function QuoteSkeleton() {
  return (
    <Busy>
      <div className="quote-shell">
        <div className="quote-scroll">
          <div className="quote-head">
            <div className="qh-row">
              <div className="who"><Sk w={96} h={22} r={999} /></div>
              <div className="qh-actions"><Sk w={40} h={40} r={8} /><Sk w={92} h={40} r={8} /><Sk w={210} h={40} r={8} /></div>
            </div>
            <div className="quote-title-row"><h1><Sk w={420} h={36} /></h1></div>
          </div>
          <div className="main-col">
          <div className="quote-top">
            <section className="card quote-client">
              <Sk w="70%" h={22} />
              <Sk w={110} h={14} style={{ marginTop: 18 }} />
              <Sk w="60%" h={16} style={{ marginTop: 8 }} />
              <Sk w="50%" h={16} style={{ marginTop: 6 }} />
              <Sk w="45%" h={16} style={{ marginTop: 18 }} />
            </section>
            <dl className="quote-facts">
              {range(7).map((i) => (
                <div className="f" key={i}><dt><Sk w={90} h={16} /></dt><dd><Sk w="45%" h={16} /></dd></div>
              ))}
            </dl>
          </div>
          {range(2).map((i) => (
            <section className="card panel quote-section" key={i}>
              <div className="ph"><Sk w={190} h={24} /></div>
              <div className="qs-body">
                <Sk h={i === 0 ? 220 : 90} r={10} />
                <Sk w="40%" h={18} style={{ marginTop: 16 }} />
                <Sk w="70%" h={14} style={{ marginTop: 8 }} />
              </div>
            </section>
          ))}
          </div>
        </div>
        <aside className="quote-side" aria-hidden="true">
          <div className="quote-side-inner">
            <section className="card quote-notes">
              <Sk w={80} h={24} />
              <Sk w="60%" h={16} style={{ marginTop: 18 }} />
              <Sk w="85%" h={14} style={{ marginTop: 10 }} />
              <Sk w={64} h={64} r={8} style={{ marginTop: 12 }} />
            </section>
          </div>
        </aside>
      </div>
    </Busy>
  );
}

/* Pipeline (D-061): shaped from the real board's own classes so nothing jumps when the data arrives. */
export function PipelineBoardSkeleton() {
  return (
    <Busy>
      <div className="pl-tab">
        <div className="pl-bar">
          <div className="chips">
            {[150, 44, 140, 150, 130].map((w, i) => (<Sk key={i} w={w} h={38} r={999} />))}
          </div>
          <Sk w={280} h={44} r={8} />
        </div>
        <div className="pl-boardwrap">
          <div className="pl-board">
            {[3, 4, 2].map((cols, g) => (
              <section key={g} className="pl-group">
                <div className="pl-rail"><Sk w={22} h={22} r={999} /><Sk w={16} h={90} /></div>
                <div className="pl-cols">
                  {range(cols).map((i) => (
                    <div key={i} className="pl-col">
                      <div className="pl-colhead"><Sk w="70%" h={16} /><div className="pl-colstat"><Sk w={26} h={22} r={999} /><Sk w={36} h={14} /></div></div>
                      <div className="pl-colbody">
                        {i < 2 && (
                          <div className="pl-card" style={{ cursor: "default" }}>
                            <Sk w="80%" h={14} />
                            <div style={{ height: 8 }} />
                            <Sk w="55%" h={13} />
                            <div style={{ height: 8 }} />
                            <Sk w="65%" h={13} />
                            <div style={{ height: 12 }} />
                            <div className="pl-cardfoot"><Sk w={34} h={20} r={999} /><Sk w={50} h={14} /></div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </Busy>
  );
}

export function PipelineSkeleton() {
  return (
    <Busy>
      <div className="pl">
        <div className="pl-top">
          <div className="pl-tabs"><Sk w={70} h={20} /><Sk w={110} h={20} /></div>
        </div>
        <div className="pl-actionrow"><div className="pl-actions"><Sk w={110} h={38} r={8} /><Sk w={130} h={38} r={8} /></div></div>
        <div className="pl-content"><PipelineBoardSkeleton /></div>
      </div>
    </Busy>
  );
}

export function PipelineTasksSkeleton() {
  return (
    <Busy>
      <div className="pl-taskspage">
        <Sk w={110} h={24} />
        <div className="pl-taskbar">
          <div className="chips">{[70, 100, 90, 110].map((w, i) => (<Sk key={i} w={w} h={38} r={999} />))}</div>
          <Sk w={150} h={38} r={999} />
        </div>
        {range(3).map((i) => (<Sk key={i} w="100%" h={44} style={{ marginBottom: 8 }} />))}
      </div>
    </Busy>
  );
}

export function PipelineOutcomesSkeleton() {
  return (
    <Busy>
      <div className="pl-outcomes">
        <div className="chips" style={{ marginBottom: 16 }}><Sk w={130} h={38} r={999} /><Sk w={210} h={38} r={999} /></div>
        <div className="table-wrap">
          <table className="table single">
            <colgroup><col style={{ width: "34%" }} /><col style={{ width: "26%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /></colgroup>
            <thead><tr><th>Title</th><th>Name</th><th>Created On</th><th>Won On</th><th className="num">Total</th></tr></thead>
            <tbody>
              {range(3).map((i) => (
                <tr key={i}><td><Sk w="70%" h={14} /></td><td><Sk w="60%" h={14} /></td><td><Sk w={80} h={14} /></td><td><Sk w={80} h={14} /></td><td className="num"><Sk w={64} h={14} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Busy>
  );
}

export function PipelineEditSkeleton() {
  return (
    <Busy>
      <div className="pl-edit">
        <div className="pl-editbar"><Sk w={120} h={18} /></div>
        <Sk w={220} h={36} style={{ margin: "14px 0 20px" }} />
        <div className="pl-editgroups">
          {[4, 4].map((n, g) => (
            <section key={g} className="pl-editgroup">
              <header><Sk w={100} h={22} /></header>
              <div className="pl-editcols">{range(n).map((i) => (<div key={i} className="pl-editcol"><Sk w="60%" h={16} /><div style={{ height: 14 }} /><Sk w="100%" h={80} /></div>))}</div>
            </section>
          ))}
        </div>
      </div>
    </Busy>
  );
}

export function TasksSkeleton() {
  return (
    <Busy>
      <div className="tasks-route">
        <div className="page-head"><h1>Tasks</h1></div>
        <PipelineTasksSkeleton />
      </div>
    </Busy>
  );
}

/* Schedule (D-062): the header and a week grid, from the real calendar's own classes. */
export function ScheduleSkeleton() {
  return (
    <Busy>
      <div className="sc">
        <div className="sc-bar">
          <div className="sc-nav">
            <Sk w={150} h={30} />
            <Sk w={36} h={38} r={8} />
            <Sk w={36} h={38} r={8} />
            <Sk w={64} h={38} r={8} />
            <Sk w={110} h={38} r={8} />
            {[100, 110, 120].map((w, i) => (<Sk key={i} w={w} h={38} r={999} />))}
          </div>
          <div className="sc-tools"><Sk w={190} h={38} r={8} /><Sk w={64} h={38} r={8} /><Sk w={80} h={38} r={8} /></div>
        </div>
        <div className="sc-main">
          <div className="sc-grid week">
            <div className="sc-headrow"><div className="sc-gutter" />{range(7).map((i) => (<div key={i} className="sc-colhead"><Sk w={64} h={24} r={999} /></div>))}</div>
            <div className="sc-scroll">
              <div className="sc-body" style={{ height: 560 }}>
                <div className="sc-gutter sc-hours" />
                {range(7).map((i) => (<div key={i} className="sc-colbody">{i % 2 === 0 && <Sk w="88%" h={52} style={{ margin: "120px 6px 0" }} />}</div>))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Busy>
  );
}

/* The quote builder (D-063): the header, the introduction and a line or two, from the builder's own classes. */
export function QuoteBuilderSkeleton() {
  return (
    <Busy>
      <div className="qb">
        <div className="qb-top"><Sk w={190} h={32} /></div>
        <section className="qb-card"><Sk w="100%" h={46} /><div style={{ height: 14 }} /><Sk w="55%" h={46} /></section>
        <section className="qb-card"><Sk w={140} h={22} /><div style={{ height: 14 }} /><Sk w="100%" h={90} /></section>
        <section className="qb-card"><Sk w={160} h={22} /><div style={{ height: 14 }} /><Sk w="100%" h={46} /><div style={{ height: 10 }} /><Sk w="100%" h={90} /></section>
      </div>
    </Busy>
  );
}

/* The client's quote page (D-063). */
export function ClientQuoteSkeleton() {
  return (
    <Busy>
      <main className="cq">
        <header className="cq-head"><Sk w={140} h={16} /><div style={{ height: 8 }} /><Sk w="70%" h={30} /><div style={{ height: 8 }} /><Sk w={120} h={14} /></header>
        <section className="cq-card"><Sk w="40%" h={18} /><Sk w="100%" h={14} /><Sk w="90%" h={14} /></section>
        <section className="cq-card"><Sk w="50%" h={20} /><Sk w="100%" h={56} /><Sk w="100%" h={56} /></section>
      </main>
    </Busy>
  );
}
