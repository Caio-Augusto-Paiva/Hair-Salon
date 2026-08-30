import { describe, expect, it } from "vitest";
import { PORTFOLIO_ITEMS, SERVICE_FIXTURES } from "./catalog-data.js";

describe("approved development catalog", () => {
  it("freezes the nine source services and their initial durations", () => {
    expect(SERVICE_FIXTURES).toHaveLength(9);
    expect(SERVICE_FIXTURES.map(({ name, durationMinutes }) => [name, durationMinutes])).toEqual([
      ["Manicure (unhas das mãos)", 30],
      ["Pedicure (unhas dos pés)", 30],
      ["Corte feminino", 60],
      ["Escova", 60],
      ["Progressiva", 180],
      ["Hidratação capilar", 30],
      ["Design de sobrancelhas", 30],
      ["Extensão de cílios", 90],
      ["Manicure + pedicure", 60],
    ]);
    expect(SERVICE_FIXTURES.every(({ priceVerifiedAt }) => priceVerifiedAt === null)).toBe(true);
  });

  it("freezes the twelve supplied portfolio paths and alternative texts", () => {
    expect(PORTFOLIO_ITEMS).toEqual([
      { assetPath: "/images/portfolio/ProtifolioUnhas.png", category: "NAILS", alternativeText: "Trabalho de unhas do Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/ProtifolioTransas2.png", category: "HAIR", alternativeText: "Tranças realizadas no Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/ProtifolioSobrancelhas2.png", category: "OTHER", alternativeText: "Design de sobrancelhas do Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/ProtifolioSobrancelha.png", category: "OTHER", alternativeText: "Design de sobrancelhas do Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/PortifolioTransas.png", category: "HAIR", alternativeText: "Tranças realizadas no Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/PortifolioOndulado3.png", category: "HAIR", alternativeText: "Cabelo ondulado finalizado no Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/PortifolioOndulado2.png", category: "HAIR", alternativeText: "Cabelo ondulado finalizado no Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/PortifolioOndulado.png", category: "HAIR", alternativeText: "Cabelo ondulado finalizado no Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/PortifolioLiso3.png", category: "HAIR", alternativeText: "Cabelo liso finalizado no Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/PortifolioLiso2.png", category: "HAIR", alternativeText: "Cabelo liso finalizado no Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/PortifolioLiso.png", category: "HAIR", alternativeText: "Cabelo liso finalizado no Angelica's Beauty Salon." },
      { assetPath: "/images/portfolio/PortifolioBocas.png", category: "MAKEUP", alternativeText: "Maquiagem labial realizada no Angelica's Beauty Salon." },
    ]);
  });
});
