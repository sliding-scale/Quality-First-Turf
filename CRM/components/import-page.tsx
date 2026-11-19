"use client";

/* Settings → Import data (plan 2026-11-20-client-import): bring a Jobber clients CSV into the CRM. The file is read here in the browser; the backend checks
   every row with the client form's rules and skips a client that is already in (same email or phone), so the import can be run again safely. A dry run
   comes first, and every row that is not created is listed with why and can be downloaded. Admins only. */

import { useConvex } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { csvFile } from "@/convex/crm/lib/exportCsv";
import { fileDuplicates, readClientsCsv, SAMPLE_COLUMNS, type ImportClient } from "@/convex/crm/lib/clientImport";
import { useWorkspace } from "@/lib/clients";
import { clock, failure } from "@/lib/pipeline";
import { CatalogueSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Result = { line: number; name: string; status: "new" | "duplicate" | "error"; message: string };
type Loaded = { fileName: string; rows: ImportClient[]; problems: { line: number; name: string; message: string }[]; recognised: string[]; ignored: string[]; repeats: Result[] };

const BATCH = 100;
const LABEL = { new: "New", duplicate: "Already here", error: "Not imported" } as const;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPage() {
  const staff = useStaff();
  const ws = useWorkspace();
  const convex = useConvex();
  const { toast } = useUI();
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [headerProblem, setHeaderProblem] = useState("");
  const [checked, setChecked] = useState<Result[] | null>(null);
  const [done, setDone] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [progress, setProgress] = useState(0);

  if (ws.state !== "ready") return <CatalogueSkeleton />;
  if (!staff.isAdmin) {
    return (
      <div className="empty-state">
        <h2>Only an Admin can import data</h2>
        <Link className="btn primary" href="/home">Back to home</Link>
      </div>
    );
  }
  const business = ws.business;

  async function pick(file: File | undefined) {
    setLoaded(null);
    setChecked(null);
    setDone(null);
    setHeaderProblem("");
    if (!file) return;
    const read = readClientsCsv(await file.text());
    if (read.headerProblem) {
      setHeaderProblem(read.headerProblem);
      return;
    }
    const { keep, repeats } = fileDuplicates(read.rows);
    setLoaded({
      fileName: file.name, rows: keep, problems: read.problems, recognised: read.recognised, ignored: read.ignored,
      repeats: repeats.map((r) => ({ line: r.row.line, name: [r.row.first, r.row.last].filter(Boolean).join(" ") || r.row.company, status: "duplicate" as const, message: r.message })),
    });
  }

  async function go(mode: "check" | "import") {
    if (!loaded) return;
    setBusy(mode);
    setProgress(0);
    const results: Result[] = [];
    try {
      for (let i = 0; i < loaded.rows.length; i += BATCH) {
        const rows = loaded.rows.slice(i, i + BATCH);
        const got: Result[] = mode === "check" ? await convex.query(api.crm.clientImport.preview, { businessId: business._id, rows }) : await convex.mutation(api.crm.clientImport.run, { businessId: business._id, rows, now: clock() });
        results.push(...got);
        setProgress(results.length);
      }
      if (mode === "check") setChecked(results);
      else {
        setDone(results);
        toast(`Imported ${results.filter((r) => r.status === "new").length} clients.`);
      }
    } catch (e) {
      // What was done before the failure stays done; running again skips those clients.
      if (mode === "import") setDone(results);
      toast(failure(e, mode === "import" ? "The import stopped part-way. Run it again: clients already imported are skipped." : "The check did not finish."));
    } finally {
      setBusy(null);
    }
  }

  const shown = done ?? checked;
  const all: Result[] = loaded
    ? [...loaded.problems.map((p) => ({ ...p, status: "error" as const })), ...loaded.repeats, ...(shown ?? [])].sort((a, b) => a.line - b.line)
    : [];
  const count = (s: Result["status"]) => all.filter((r) => r.status === s).length;
  const notCreated = all.filter((r) => r.status !== "new" || r.message.includes("left out"));

  function report() {
    download(`client-import-report-${new Date().toISOString().slice(0, 10)}.csv`, csvFile(["Line", "Name", "Result", "Details"], all.map((r) => [r.line, r.name, LABEL[r.status], r.message])));
  }
  function sample() {
    download("clients-import-sample.csv", csvFile([...SAMPLE_COLUMNS], [["3/5/2024", "FALSE", "Ana", "Ruiz", "", "ana@example.com", "(555) 123-4567", "(555) 987-6543", "12 Oak St", "", "Temecula", "California", "92592", "United States", "FALSE", "0.00", "Gate code 1234", "Homeowner"]]));
  }

  return (
    <div className="fade-in cat">
      <div className="page-head"><h1>Import data</h1></div>
      <p className="au-lead">Bring clients across from a Jobber export (a CSV file) into {business.name}. Check the file first: nothing is saved until you press Import. A client already here (the same email, or the same phone number) is skipped, never doubled or changed, so it is safe to run again with a newer file.</p>

      <section className="card op-card im-card">
        <h2>Clients</h2>
        <div className="cat-actions" style={{ marginTop: 0 }}>
          <input ref={input} type="file" accept=".csv,text/csv" aria-label="Clients CSV file" onChange={(e) => void pick(e.target.files?.[0])} />
          <button type="button" className="btn" onClick={sample}>Download a sample file</button>
        </div>
        {headerProblem && <p className="modal-error" role="alert">{headerProblem}</p>}
        {loaded && (
          <>
            <p className="muted">
              <b>{loaded.fileName}</b>: {loaded.rows.length + loaded.repeats.length + loaded.problems.filter((p) => p.message.startsWith("No name")).length} rows read.
              {" "}Columns understood: {loaded.recognised.join(", ") || "none"}.
              {loaded.ignored.length > 0 && <> Not used: {loaded.ignored.join(", ")}.</>}
            </p>
            <div className="cat-actions">
              <button type="button" className="btn" disabled={busy !== null || loaded.rows.length === 0} onClick={() => void go("check")}>{busy === "check" ? `Checking… ${progress}` : "Check the file"}</button>
              <button type="button" className="btn primary" disabled={busy !== null || checked === null || done !== null || count("new") === 0} onClick={() => void go("import")}>
                {busy === "import" ? `Importing… ${progress}` : checked && !done && count("new") > 0 ? `Import ${count("new")} ${count("new") === 1 ? "client" : "clients"}` : "Import"}
              </button>
              {shown && <button type="button" className="btn" onClick={report}>Download the report</button>}
            </div>
            {shown && (
              <p className="im-sum" role="status">
                {done ? "Done. " : "Checked. "}
                <b>{count("new")}</b> {done ? "imported" : "would be imported"}, <b>{count("duplicate")}</b> already here or repeated, <b>{count("error")}</b> not imported.
              </p>
            )}
            {shown && notCreated.length > 0 && (
              <div className="table-wrap">
                <table className="table cat-table">
                  <colgroup><col style={{ width: 70 }} /><col style={{ width: "26%" }} /><col style={{ width: 130 }} /><col /></colgroup>
                  <thead><tr><th>Line</th><th>Name</th><th>Result</th><th>Why</th></tr></thead>
                  <tbody>
                    {notCreated.slice(0, 200).map((r) => (
                      <tr key={`${r.line}-${r.status}`}><td>{r.line}</td><td>{r.name || <span className="muted">—</span>}</td><td><span className={`po-chip ${r.status === "error" ? "open" : r.status === "duplicate" ? "ordered" : "stock"}`}>{LABEL[r.status]}</span></td><td>{r.message}</td></tr>
                    ))}
                  </tbody>
                </table>
                {notCreated.length > 200 && <p className="muted">Showing the first 200 of {notCreated.length}. The report has them all.</p>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
