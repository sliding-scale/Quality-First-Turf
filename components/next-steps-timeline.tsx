import { ArrowRight, Leaf } from "lucide-react";

const stages = [
  {
    title: "We reach out",
    detail: "A team member contacts you to discuss your project.",
  },
  {
    title: "We schedule a visit",
    detail: "If a site visit is required, we'll arrange a convenient time.",
  },
  {
    title: "You get a quote",
    detail:
      "Our team prepares an estimate based on your project requirements and any necessary site assessment.",
  },
];

export function NextStepsTimeline() {
  return (
    <section className="confirmation-next" aria-labelledby="confirmation-next-title">
      <div className="confirmation-divider" aria-hidden="true">
        <Leaf strokeWidth={1.75} />
      </div>
      <h2 id="confirmation-next-title">What happens next?</h2>
      <ol className="next-steps">
        {stages.map((stage, index) => (
          <li key={stage.title}>
            <span className="next-steps__num" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <h3>{stage.title}</h3>
              <p>{stage.detail}</p>
            </div>
            {index < stages.length - 1 ? (
              <ArrowRight className="next-steps__arrow" strokeWidth={1.75} aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
