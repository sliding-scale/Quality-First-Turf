"use client";

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
      {cards.map((card, index) => {
        const Icon = icons[card.label] ?? Sprout;
        return (
          <button
            key={card.label}
            type="button"
            className={card.selected ? "service-card is-selected" : "service-card"}
            aria-pressed={card.selected}
            onClick={() => onToggle(index)}
          >
            <span className="service-card__icon">
              <Icon strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="service-card__name">{card.label}</span>
            <span className="service-card__mark" aria-hidden="true">
              {card.selected ? <Check strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
