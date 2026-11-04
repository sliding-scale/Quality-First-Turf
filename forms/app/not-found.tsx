import Link from "next/link";

export default function NotFound() {
  return (
    <main className="sales-list status-page">
      <div className="status-page__body">
        <h1>Page not found</h1>
        <p className="status-page__lead">That page does not exist.</p>
        <Link className="status-page__action" href="/">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
