import { CalendarDays, Handshake, Mail, type LucideIcon } from "lucide-react";

const columns: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: Mail,
    title: "We're reviewing your details",
    detail: "Our team is looking over your request and property information.",
  },
  {
    icon: CalendarDays,
    title: "We'll contact you shortly",
    detail: "A member of our team will reach out to discuss the next steps.",
  },
  {
    icon: Handshake,
    title: "On-site consultation",
    detail:
      "If an on-site visit is needed, we'll arrange a suitable time to review your property and project requirements.",
  },
];

export function ConfirmationStatusCard() {
  return (
    <section className="confirmation-status" aria-label="What we do with your request">
      {columns.map((column) => {
        const Icon = column.icon;
        return (
          <article key={column.title} className="confirmation-status__item">
            <span className="confirmation-status__icon" aria-hidden="true">
              <Icon strokeWidth={1.75} />
            </span>
            <div>
              <h2>{column.title}</h2>
              <p>{column.detail}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
