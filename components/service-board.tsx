"use client";

import { Check } from "lucide-react";
import RetryImage from "@/components/ui/retry-image";

export type ServiceCard = {
  label: string;
  imgUrl?: string;
  selected: boolean;
};

export default function ServiceBoard({
  cards,
  onToggle,
  invalid = false,
  describedBy,
}: {
  cards: ServiceCard[];
  onToggle: (index: number) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      className="service-board"
      role="group"
      aria-label="Services"
      aria-describedby={invalid && describedBy ? describedBy : undefined}
    >
      {cards.map((card, index) => (
        <button
          key={card.label}
          type="button"
          className={card.selected ? "service-tile is-selected" : "service-tile"}
          aria-pressed={card.selected}
          onClick={() => onToggle(index)}
        >
          {card.imgUrl ? (
            <RetryImage
              src={card.imgUrl}
              alt=""
              width={480}
              height={320}
              loading={index < 6 ? "eager" : "lazy"}
              decoding="async"
            />
          ) : null}
          <span className="service-tile__name">{card.label}</span>
          <span className="service-tile__mark" aria-hidden="true">
            {card.selected ? <Check strokeWidth={3} /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
