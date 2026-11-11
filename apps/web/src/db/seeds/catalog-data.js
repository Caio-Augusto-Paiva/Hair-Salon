// Prices are intentionally fictional development fixtures. They remain
// unverified until the administrator supplies the real catalog prices.
export const SERVICE_FIXTURES = Object.freeze([
  { name: "Manicure (unhas das mãos)", category: "NAILS", durationMinutes: 30, priceCents: 101, priceVerifiedAt: null },
  { name: "Pedicure (unhas dos pés)", category: "NAILS", durationMinutes: 30, priceCents: 102, priceVerifiedAt: null },
  { name: "Corte feminino", category: "HAIR", durationMinutes: 60, priceCents: 103, priceVerifiedAt: null },
  { name: "Escova", category: "HAIR", durationMinutes: 60, priceCents: 104, priceVerifiedAt: null },
  { name: "Progressiva", category: "HAIR", durationMinutes: 180, priceCents: 105, priceVerifiedAt: null },
  { name: "Hidratação capilar", category: "HAIR", durationMinutes: 30, priceCents: 106, priceVerifiedAt: null },
  { name: "Design de sobrancelhas", category: "OTHER", durationMinutes: 30, priceCents: 107, priceVerifiedAt: null },
  { name: "Extensão de cílios", category: "OTHER", durationMinutes: 90, priceCents: 108, priceVerifiedAt: null },
  { name: "Manicure + pedicure", category: "NAILS", durationMinutes: 60, priceCents: 109, priceVerifiedAt: null },
]);

export const PORTFOLIO_ITEMS = Object.freeze([
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

export const DEVELOPMENT_USERS = Object.freeze([
  { name: "Administradora Fictícia (desenvolvimento)", email: "admin-demo@example.com", role: "ADMIN" },
  { name: "Funcionária Fictícia 01 (desenvolvimento)", email: "funcionaria-01-demo@example.com", role: "EMPLOYEE", specialty: "Catálogo de desenvolvimento" },
  { name: "Funcionária Fictícia 02 (desenvolvimento)", email: "funcionaria-02-demo@example.com", role: "EMPLOYEE", specialty: "Catálogo de desenvolvimento" },
  { name: "Funcionária Fictícia 03 (desenvolvimento)", email: "funcionaria-03-demo@example.com", role: "EMPLOYEE", specialty: "Catálogo de desenvolvimento" },
  { name: "Cliente Fictícia 01 (desenvolvimento)", email: "cliente-01-demo@example.com", role: "CLIENT" },
  { name: "Cliente Fictícia 02 (desenvolvimento)", email: "cliente-02-demo@example.com", role: "CLIENT" },
]);
