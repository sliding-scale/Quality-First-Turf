/* Shown when the backend answers but holds no businesses yet, which is the state of a fresh dev deployment. */
export function EmptyBackend() {
  return (
    <div className="empty-state">
      <h2>No CRM data yet</h2>
      <p>
        The backend is connected, but this deployment has no businesses or clients yet. On dev you can load sample data: run{" "}
        <code>npx convex env set CRM_ALLOW_SAMPLE_DATA true</code>, then <code>npx convex run crm/seed:run</code> (from the <b>repo root</b>), then{" "}
        <code>npx convex env remove CRM_ALLOW_SAMPLE_DATA</code>. The first customer-form submission also creates Quality First Turf.
      </p>
    </div>
  );
}
