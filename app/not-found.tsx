import Link from "next/link";

export default function NotFound() {
  return (
    <main className="sales-list">
      <div className="sales-list__main">
        <h1>Page not found</h1>
        <p className="sales-list__lead">That page does not exist.</p>
        <p className="sales-list__note">
          <Link className="sales-list__back" href="/">
            Back to the start
          </Link>
        </p>
      </div>
    </main>
  );
}
