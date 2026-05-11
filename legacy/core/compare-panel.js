// Comparison overlay showing strengths/weaknesses of each code type
import { annotateText } from './text-annotator.js';

const CODE_COMPARE_DATA = {
  qr: {
    name: 'QR Code',
    description: 'A 2D matrix code with three finder patterns in the corners and powerful Reed-Solomon error correction.',
    strengths: [
      'High data capacity (up to 4,296 characters)',
      'Strong error correction — recovers from up to 30% damage',
      'Fast scanning from any angle thanks to finder patterns',
      'Supports binary data, URLs, text, and more',
      'Widely recognized and supported by phone cameras'
    ],
    weaknesses: [
      'Requires a relatively large area for small data amounts',
      'Three finder patterns take up significant space',
      'Needs a quiet zone border around the code'
    ],
    useCases: ['Website URLs', 'Payment systems', 'Product tracking', 'Wi-Fi sharing', 'Digital tickets']
  },
  barcode: {
    name: 'Barcode (Code 128)',
    description: 'A 1D linear code using variable-width bars with a check digit for error detection.',
    strengths: [
      'Very fast to scan with simple laser scanners',
      'Compact for short text or numbers',
      'Universal support in retail and logistics',
      'Simple to print at any size',
      'Low computational cost to decode'
    ],
    weaknesses: [
      'Limited data capacity (~20-30 characters)',
      'Only detects errors via check digit — cannot correct them',
      'Must be scanned in correct orientation (horizontal)',
      'Easily damaged by scratches along bar direction'
    ],
    useCases: ['Retail product labels', 'Shipping labels', 'Library books', 'ID badges', 'Inventory management']
  },
  datamatrix: {
    name: 'Data Matrix',
    description: 'A 2D matrix code with an L-shape finder and clock track, optimized for small items and industrial marking.',
    strengths: [
      'Very small footprint — can be as tiny as 2mm\u00b2',
      'Strong Reed-Solomon error correction',
      'L-shape finder enables reliable detection',
      'Works well on curved surfaces',
      'Popular for industrial direct part marking'
    ],
    weaknesses: [
      'Lower maximum capacity than QR codes',
      'Less recognizable to general public',
      'Fewer phone camera apps support it natively',
      'Requires good contrast for small sizes'
    ],
    useCases: ['Electronics component marking', 'Pharmaceutical packaging', 'Mail sorting', 'Aerospace part tracking', 'Medical devices']
  },
  aztec: {
    name: 'Aztec Code',
    description: 'A 2D matrix code with a central bullseye finder pattern and no required quiet zone.',
    strengths: [
      'No quiet zone needed — saves space',
      'Central bullseye is highly detectable',
      'Efficient for small-to-medium data amounts',
      'Strong Reed-Solomon error correction',
      'Compact size for equivalent data'
    ],
    weaknesses: [
      'Less widely supported than QR codes',
      'Lower maximum capacity than QR or Data Matrix',
      'Not as commonly recognized by consumers',
      'Fewer encoding tool options'
    ],
    useCases: ['Boarding passes (airlines)', 'Train tickets', 'Government IDs', 'Healthcare wristbands', 'Secure document verification']
  }
};

let panelEl = null;

export function openComparePanel() {
  if (panelEl) {
    panelEl.hidden = false;
    return;
  }

  panelEl = document.createElement('div');
  panelEl.id = 'compare-panel';
  panelEl.innerHTML = buildComparePanelHTML();
  document.body.appendChild(panelEl);

  panelEl.querySelector('.compare-close-btn').addEventListener('click', closeComparePanel);
  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl) closeComparePanel();
  });
}

export function closeComparePanel() {
  if (panelEl) panelEl.hidden = true;
}

function buildComparePanelHTML() {
  let cardsHTML = '';
  for (const [id, info] of Object.entries(CODE_COMPARE_DATA)) {
    const colorMap = { qr: '#ff6b6b', barcode: '#4d96ff', datamatrix: '#6bcb77', aztec: '#9b59b6' };
    const color = colorMap[id] || '#fff';

    cardsHTML += `
      <div class="compare-card" style="border-color: ${color}40">
        <h3 style="color: ${color}">${info.name}</h3>
        <p class="compare-desc">${annotateText(info.description)}</p>
        <div class="compare-section">
          <h4 class="compare-section-title strengths-title">Strengths</h4>
          <ul>${info.strengths.map(s => `<li>${annotateText(s)}</li>`).join('')}</ul>
        </div>
        <div class="compare-section">
          <h4 class="compare-section-title weaknesses-title">Weaknesses</h4>
          <ul>${info.weaknesses.map(w => `<li>${annotateText(w)}</li>`).join('')}</ul>
        </div>
        <div class="compare-section">
          <h4 class="compare-section-title usecases-title">Use Cases</h4>
          <div class="compare-tags">${info.useCases.map(u => `<span class="compare-tag">${u}</span>`).join('')}</div>
        </div>
      </div>`;
  }

  return `
    <div class="compare-overlay-content">
      <div class="compare-header">
        <h2>Compare Code Types</h2>
        <button class="compare-close-btn">&times;</button>
      </div>
      <div class="compare-grid">${cardsHTML}</div>
    </div>`;
}
