"use client";

import { useId } from "react";
import {
  BrickWall,
  Cable,
  Check,
  CookingPot,
  Droplets,
  Flag,
  Flame,
  Flower2,
  Gem,
  Hammer,
  LayoutGrid,
  Layers,
  Lightbulb,
  Mountain,
  Sprout,
  TreePine,
  Umbrella,
  type LucideIcon,
} from "lucide-react";

export type ServiceCard = {
  label: string;
  selected: boolean;
  /** What is inside this service, shown as a preview when the card is hovered or focused. */
  includes?: string[];
};

const icons: Record<string, LucideIcon> = {
  Demolition: Hammer,
  "Artificial Grass": Sprout,
  "Putting Green": Flag,
  Underground: Cable,
  "Low Voltage Lighting": Lightbulb,
  SOD: Layers,
  "Patio Covers": Umbrella,
  Concrete: BrickWall,
  "Retaining Walls": BrickWall,
  "Planter Walls": Flower2,
  Pavers: LayoutGrid,
  "Bar & Bbq": CookingPot,
  "Fire Pits": Flame,
  "Decomposite Granite": Mountain,
  "Decorative Rock": Gem,
  Irrigation: Droplets,
  Planting: TreePine,
};

function ServiceOption({
  card,
  onToggle,
}: {
  card: ServiceCard;
  onToggle: () => void;
}) {
  const peekId = useId();
  const Icon = icons[card.label] ?? Sprout;
  const includes = card.includes ?? [];
  return (
    <div className="service-item">
      <button
        type="button"
        className={card.selected ? "service-card is-selected" : "service-card"}
        aria-pressed={card.selected}
        aria-describedby={includes.length > 0 ? peekId : undefined}
        onClick={onToggle}
      >
        <span className="service-card__icon">
          <Icon strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="service-card__name">{card.label}</span>
        <span className="service-card__mark" aria-hidden="true">
          {card.selected ? <Check strokeWidth={3} /> : null}
        </span>
      </button>
      {includes.length > 0 ? (
        <div id={peekId} role="tooltip" className="service-peek">
          <p className="service-peek__title">Includes</p>
          <ul className={includes.length > 8 ? "service-peek__list is-long" : "service-peek__list"}>
            {includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

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
        <ServiceOption key={card.label} card={card} onToggle={() => onToggle(index)} />
      ))}
    </div>
  );
}
