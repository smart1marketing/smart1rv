// Server-side proposal PDF generation + upload to Smart 1 Suite (HighLevel) media library.
// Uses pdfkit so no headless browser is required (reliable on Render Starter).
import PDFDocument from 'pdfkit';

const NAVY = '#1A2E58';
const BLUE = '#28477F';
const MUTED = '#687386';
const TEXT = '#172033';

function num(value) {
  return Number(value || 0).toLocaleString('en-US');
}

export function safeFileName(name) {
  return String(name || 'RV Dealer').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
}

export function proposalFileName(formData) {
  return `${safeFileName(formData.dealership_name || 'RV Dealer')} Weather Marketing Proposal.pdf`;
}

// Build the proposal PDF as a Buffer.
export function buildProposalPdf(formData, estimate, dateStr) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', d => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const bottom = () => doc.page.height - doc.page.margins.bottom;
      const dealership = (formData.dealership_name || 'RV Dealer').trim();

      const rule = (color, width) => {
        const y = doc.y + 2;
        doc.moveTo(left, y).lineTo(left + pageW, y).strokeColor(color).lineWidth(width || 1).stroke();
        doc.moveDown(0.6);
      };
      const section = (title) => {
        if (doc.y > bottom() - 90) doc.addPage();
        doc.moveDown(0.5);
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(title);
        doc.moveDown(0.15);
      };
      const para = (t, opts) => {
        doc.fillColor(TEXT).font('Helvetica').fontSize(10.5).text(t || '', opts);
      };

      // ---- Header ----
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(22).text(dealership);
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(15).text('Weather Marketing Proposal');
      doc.fillColor(MUTED).font('Helvetica').fontSize(10)
        .text('Prepared by Smart 1 Marketing  ·  ' + (dateStr || ''));
      doc.moveDown(0.4);
      rule(NAVY, 2);

      // ---- Intro ----
      para(`Based on ${dealership}’s ZIP code, selected buyer radius, and regional campground density, here is your weather-triggered RV demand opportunity.`);
      doc.moveDown(0.5);

      // ---- Region ----
      if (estimate.market_climate_region) {
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(estimate.market_climate_region);
        if (estimate.market_region_reason) {
          doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(estimate.market_region_reason);
        }
        doc.moveDown(0.3);
      }

      // ---- Headline stats ----
      doc.moveDown(0.2);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14)
        .text(`${num(estimate.campground_count_low)}–${num(estimate.campground_count_high)} `, { continued: true })
        .fillColor(TEXT).font('Helvetica').fontSize(10.5).text('campgrounds & RV parks');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14)
        .text(`${num(estimate.estimated_site_count_low)}–${num(estimate.estimated_site_count_high)} `, { continued: true })
        .fillColor(TEXT).font('Helvetica').fontSize(10.5).text('estimated RV / camping sites');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14)
        .text(`${num(estimate.estimated_peak_season_reach_low)}–${num(estimate.estimated_peak_season_reach_high)} `, { continued: true })
        .fillColor(TEXT).font('Helvetica').fontSize(10.5).text('estimated peak-season camper reach');

      // ---- Market opportunity ----
      if (estimate.dealer_summary) {
        section('Your Market Opportunity');
        para(estimate.dealer_summary);
      }

      // ---- Recommended package ----
      section('Recommended Package');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(estimate.recommended_package || '');
      if (estimate.recommended_package_reason) para(estimate.recommended_package_reason);

      // ---- Channels ----
      const channels = Array.isArray(estimate.recommended_channels) ? estimate.recommended_channels : [];
      if (channels.length) {
        section('Recommended Media Channels');
        para(channels.join('  ·  '));
      }

      // ---- Audience & data targeting ----
      section('Audience & Data Targeting');
      para('Every campaign is powered by data-driven audience targeting:');
      doc.moveDown(0.15);
      [
        'In-Market RV Buyer Data — households actively shopping for RVs',
        'Campground & State-Park Geotargeting — reach campers where they camp',
        'Location Look-Back Retargeting — recent campground / RV-park visitors'
      ].forEach(t => doc.fillColor(TEXT).font('Helvetica').fontSize(10.5).text('•  ' + t));

      // ---- Best triggers ----
      const best = Array.isArray(estimate.best_weather_triggers) ? estimate.best_weather_triggers : [];
      if (best.length) {
        section('Recommended Weather Triggers for Your Market');
        para(best.join('  ·  '));
      }

      // ---- Budget ----
      section('Suggested Media Budget');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12)
        .text(`${estimate.base_monthly_budget_text || ''}/mo at peak`, { continued: true })
        .fillColor(TEXT).font('Helvetica').fontSize(10.5)
        .text(`     ${estimate.average_monthly_budget_text || ''}/mo blended     ${estimate.suggested_budget_total_text || ''} plan total (${estimate.suggested_budget_months || ''} months)`);
      if (estimate.budget_note) {
        doc.moveDown(0.2);
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(estimate.budget_note);
      }

      // ---- Month-by-month plan ----
      section('Month-by-Month Campaign Plan & Budget');
      const plan = Array.isArray(estimate.month_by_month_plan) ? estimate.month_by_month_plan : [];
      plan.forEach(row => {
        if (doc.y > bottom() - 70) doc.addPage();
        const head = [row.month, row.season, row.suggested_budget_text].filter(Boolean).join('   ·   ');
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text(head);
        if (row.campaign_focus) doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(10).text(row.campaign_focus);
        if (row.recommended_message) doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(row.recommended_message);
        if (Array.isArray(row.weather_triggers) && row.weather_triggers.length) {
          doc.fillColor(BLUE).font('Helvetica').fontSize(9).text('Triggers: ' + row.weather_triggers.join(', '));
        }
        doc.moveDown(0.4);
      });

      // ---- Disclaimer ----
      doc.moveDown(0.4);
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8.5)
        .text(estimate.estimate_disclaimer || 'This is a planning estimate based on geography, market density, and standard campground capacity assumptions. It is not an audited count.');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Upload the PDF to the Smart 1 Suite / HighLevel media library and return its public URL.
// Returns null if credentials are missing; throws on an API error (caller decides whether to swallow).
export async function uploadPdfToGhlMedia(buffer, filename) {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) return null;

  const url = process.env.GHL_MEDIA_UPLOAD_URL || 'https://services.leadconnectorhq.com/medias/upload-file';
  const version = process.env.GHL_MEDIA_API_VERSION || '2021-07-28';

  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
  fd.append('name', filename);
  if (process.env.GHL_LOCATION_ID) fd.append('locationId', process.env.GHL_LOCATION_ID);
  if (process.env.GHL_MEDIA_HOSTED) fd.append('hosted', process.env.GHL_MEDIA_HOSTED);

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Version: version },
    body: fd
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GHL media upload failed: ${response.status} ${text}`);
  }

  let data = {};
  try { data = JSON.parse(text); } catch { data = {}; }
  return (
    data.url ||
    data.fileUrl ||
    data.link ||
    (data.data && (data.data.url || data.data.fileUrl || data.data.link)) ||
    null
  );
}
