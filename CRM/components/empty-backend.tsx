/* Shown when the backend answers but holds no businesses yet, which is the state of a fresh dev deployment. */
export function EmptyBackend() {
  return (
    <div className="empty-state">
      <h2>No CRM data yet</h2>
      <p>
        The backend is connected, but the dev deployment has no businesses or clients. Load the sample data by running{" "}
        <code>npx convex run crm/seed:run</code> from the <b>repo root</b>, then reload.
      </p>
    </div>
  );
}
