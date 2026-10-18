// Projects on the experimental page (/lorem-ipsum). All placeholders for now:
// the titles and texts are lorem ipsum, and the images are borrowed from the case studies.
// `kind` decides the tile shape in the grid: 'app' is a tall phone shape, 'web' a wide one.
import type { ImageMetadata } from 'astro';

import bambooThumb from '../assets/work/bamboo-thumb.png';
import etfServicing from '../content/work/images/calastone/etf-servicing.png';
import moneyMarket from '../content/work/images/calastone/money-market-services.png';
import multiTrading from '../content/work/images/calastone/multi-trading.jpg';
import orderDetail from '../content/work/images/calastone/order-detail-1.png';
import system from '../content/work/images/juicyway/system.webp';
import everywhere from '../content/work/images/juicyway/everywhere.webp';
import role from '../content/work/images/juicyway/role.webp';
import shipped from '../content/work/images/juicyway/shipped.webp';
import patterns from '../content/work/images/juicyway/patterns.webp';
import redesign from '../content/work/images/bamboo/redesign.webp';
import trade from '../content/work/images/bamboo/trade.webp';
import portfolio from '../content/work/images/bamboo/portfolio.webp';
import market from '../content/work/images/bamboo/market.webp';

export type PeekImage = { src: ImageMetadata; title: string; description: string };
export type PeekProject = { title: string; kind: 'app' | 'web'; images: PeekImage[] };

const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
const img = (src: ImageMetadata): PeekImage => ({ src, title: 'dolor sit amet', description: text });

export const projects: PeekProject[] = [
  { title: 'lorem ipsum', kind: 'web', images: [etfServicing, orderDetail, multiTrading].map(img) },
  { title: 'lorem ipsum', kind: 'app', images: [bambooThumb, trade, portfolio].map(img) },
  { title: 'lorem ipsum', kind: 'web', images: [system, everywhere, shipped, patterns].map(img) },
  { title: 'lorem ipsum', kind: 'web', images: [redesign, market, trade].map(img) },
  { title: 'lorem ipsum', kind: 'app', images: [role, shipped, system].map(img) },
  { title: 'lorem ipsum', kind: 'web', images: [moneyMarket, multiTrading, etfServicing].map(img) },
  { title: 'lorem ipsum', kind: 'web', images: [everywhere, system, patterns, role, shipped].map(img) },
  { title: 'lorem ipsum', kind: 'app', images: [portfolio, bambooThumb, market].map(img) },
];
