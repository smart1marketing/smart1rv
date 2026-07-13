// For local testing, leave this blank. For a Smart 1 Sites embed on another domain,
// set this to your Render service URL, for example: https://smart1rv.onrender.com
const API_BASE = window.SMART1RV_API_BASE || '';

const form = document.getElementById('rvDemandForm');
const steps = document.querySelectorAll('.srv-step');
const progressBar = document.getElementById('srvProgressBar');
const buildButton = document.getElementById('buildOpportunityBtn');
const submitStatus = document.getElementById('submitStatus');
const proposalRecipient = document.getElementById('proposalRecipient');
const alternateEmail = document.getElementById('alternateEmail');

let currentStep = 1;
let estimateData = null;
let submitCompleted = false;

function showStep(step) {
  steps.forEach(section => {
    section.classList.toggle('active', Number(section.dataset.step) === step);
  });
  currentStep = step;
  progressBar.style.width = `${Math.min((step / steps.length) * 100, 100)}%`;
}

function validateCurrentStep() {
  const activeStep = document.querySelector(`.srv-step[data-step="${currentStep}"]`);
  const requiredFields = activeStep.querySelectorAll('[required]');

  for (const field of requiredFields) {
    if (!field.value) {
      field.reportValidity();
      return false;
    }
  }
  return true;
}

function getFormPayload() {
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());

  payload.weather_triggers = Array.from(
    document.querySelectorAll('input[name="weather_triggers"]:checked')
  ).map(item => item.value);

  payload.proposal_recipient_email =
    payload.proposal_recipient === 'other' && payload.alternate_email
      ? payload.alternate_email
      : payload.email;

  return payload;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chips(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return `<div class="srv-chips">${list.map(item => `<span class="srv-chip">${escapeHtml(item)}</span>`).join('')}</div>`;
}

// Builds the full on-screen report shown before the proposal step.
function buildReportHtml(estimate) {
  const dealership = (getFormPayload().dealership_name || 'your dealership').trim();

  const region = estimate.market_climate_region
    ? `
      <div class="srv-report-section srv-region">
        <span class="srv-region-badge">${escapeHtml(estimate.market_climate_region)}</span>
        ${estimate.market_region_reason ? `<p>${escapeHtml(estimate.market_region_reason)}</p>` : ''}
      </div>`
    : '';

  const stats = `
    <div class="srv-stat-grid">
      <div class="srv-stat">
        <span class="opportunity-number">${formatNumber(estimate.campground_count_low)}–${formatNumber(estimate.campground_count_high)}</span>
        <span class="srv-stat-label">campgrounds &amp; RV parks</span>
      </div>
      <div class="srv-stat">
        <span class="opportunity-number">${formatNumber(estimate.estimated_site_count_low)}–${formatNumber(estimate.estimated_site_count_high)}</span>
        <span class="srv-stat-label">estimated RV / camping sites</span>
      </div>
      <div class="srv-stat">
        <span class="opportunity-number">${formatNumber(estimate.estimated_peak_season_reach_low)}–${formatNumber(estimate.estimated_peak_season_reach_high)}</span>
        <span class="srv-stat-label">estimated peak-season camper reach</span>
      </div>
    </div>`;

  const summary = estimate.dealer_summary
    ? `<div class="srv-report-section"><h3>Your Market Opportunity</h3><p>${escapeHtml(estimate.dealer_summary)}</p></div>`
    : '';

  const pkg = estimate.recommended_package
    ? `
      <div class="srv-report-section srv-package">
        <h3>Recommended Package</h3>
        <p class="srv-package-name">${escapeHtml(estimate.recommended_package)}</p>
        ${estimate.recommended_package_reason ? `<p>${escapeHtml(estimate.recommended_package_reason)}</p>` : ''}
      </div>`
    : '';

  const channels = (Array.isArray(estimate.recommended_channels) && estimate.recommended_channels.length)
    ? `<div class="srv-report-section"><h3>Recommended Media Channels</h3>${chips(estimate.recommended_channels)}</div>`
    : '';

  const triggers = (Array.isArray(estimate.best_weather_triggers) && estimate.best_weather_triggers.length)
    ? `<div class="srv-report-section"><h3>Best Weather Triggers for Your Market</h3>${chips(estimate.best_weather_triggers)}</div>`
    : '';

  let plan = '';
  if (Array.isArray(estimate.month_by_month_plan) && estimate.month_by_month_plan.length) {
    const rows = estimate.month_by_month_plan.map(row => `
      <tr>
        <td class="srv-plan-month">${escapeHtml(row.month)}</td>
        <td>
          <strong>${escapeHtml(row.campaign_focus)}</strong>
          <div class="srv-plan-message">${escapeHtml(row.recommended_message)}</div>
          ${chips(row.weather_triggers)}
        </td>
      </tr>`).join('');
    plan = `
      <div class="srv-report-section">
        <h3>Month-by-Month Campaign Plan</h3>
        <table class="srv-plan-table">
          <thead><tr><th>Month</th><th>Focus &amp; Triggers</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  const disclaimer = estimate.estimate_disclaimer
    ? `<p class="disclaimer">${escapeHtml(estimate.estimate_disclaimer)}</p>`
    : '';

  return `
    <p class="srv-report-intro">Based on ${escapeHtml(dealership)}’s location, selected buyer radius, and regional campground density, here’s your weather-triggered RV demand opportunity:</p>
    ${region}
    ${stats}
    ${summary}
    ${pkg}
    ${channels}
    ${triggers}
    ${plan}
    ${disclaimer}
  `;
}

function renderEstimate(estimate) {
  const box = document.getElementById('marketOpportunityResult');
  box.innerHTML = buildReportHtml(estimate);
}

async function estimateAndSubmit() {
  const payload = getFormPayload();
  const response = await fetch(`${API_BASE}/api/rv-demand/estimate-and-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.detail || result.error || 'Submission failed');
  }

  return result;
}

document.querySelectorAll('.next-btn').forEach(button => {
  button.addEventListener('click', () => {
    if (!validateCurrentStep()) return;
    showStep(currentStep + 1);
  });
});

document.querySelectorAll('.prev-btn').forEach(button => {
  button.addEventListener('click', () => {
    showStep(Math.max(currentStep - 1, 1));
  });
});

proposalRecipient.addEventListener('change', () => {
  const showAlt = proposalRecipient.value === 'other';
  alternateEmail.style.display = showAlt ? 'block' : 'none';
  alternateEmail.required = showAlt;
});

buildButton.addEventListener('click', async () => {
  if (!validateCurrentStep()) return;

  const selectedTriggers = document.querySelectorAll('input[name="weather_triggers"]:checked');
  if (selectedTriggers.length === 0) {
    alert('Please choose at least one weather trigger.');
    return;
  }

  showStep(6);
  buildButton.disabled = true;

  document.getElementById('marketOpportunityResult').innerHTML = '<p>Building your campground market estimate and sending your lead into Smart 1 Suite...</p>';

  try {
    const result = await estimateAndSubmit();
    estimateData = result.estimate;
    submitCompleted = true;
    renderEstimate(estimateData);
  } catch (error) {
    document.getElementById('marketOpportunityResult').innerHTML = `
      <p>We could not complete the automated estimate right now.</p>
      <p>Your team can still review the form details manually. Error: ${escapeHtml(error.message)}</p>
    `;
    console.error(error);
  } finally {
    buildButton.disabled = false;
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();

  if (!validateCurrentStep()) return;

  // The lead has already been submitted when the estimate was built.
  // This final step confirms to the prospect that Smart 1 Suite will handle the proposal workflow.
  if (submitCompleted) {
    submitStatus.textContent = 'Your request has been submitted. Smart 1 Suite will handle the proposal document and follow-up email.';
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  try {
    submitStatus.textContent = 'Submitting your request...';
    const result = await estimateAndSubmit();
    estimateData = result.estimate;
    submitCompleted = true;
    submitStatus.textContent = 'Your request has been submitted. Smart 1 Suite will handle the proposal document and follow-up email.';
  } catch (error) {
    submitStatus.textContent = `Submission failed: ${error.message}`;
  }
});
