import Link from "next/link";

/* A page that does not exist (or a link that has moved). Plain, with a way back. */
export default function NotFound() {
  return (
    <div className="empty-state" style={{ marginTop: 96 }}>
      <h1 style={{ fontSize: 26, margin: "0 0 10px" }}>This page does not exist</h1>
      <p>The address may be mistyped, or the record may have been deleted.</p>
      <Link className="btn primary" href="/home">Back to home</Link>
    </div>
  );
}
