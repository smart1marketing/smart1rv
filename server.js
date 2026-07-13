import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes('*');

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (no Origin header), a blank ALLOWED_ORIGINS,
    // an explicit "*" wildcard, or an exact origin match.
    if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Do NOT throw here — throwing skips CORS headers and the browser reports a
    // generic "Failed to fetch". Instead, deny the CORS headers gracefully so the
    // request still returns a normal (blocked) response we can diagnose.
    return callback(null, false);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const requiredEnv = ['OPENAI_API_KEY', 'SMART1_SUITE_WEBHOOK_URL'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`Missing environment variable: ${key}`);
  }
}

const currentMonthIndex = new Date().getMonth();
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const nextMonthName = monthNames[(currentMonthIndex + 1) % 12];

function normalizeFormPayload(body) {
  const triggers = Array.isArray(body.weather_triggers)
    ? body.weather_triggers
    : String(body.weather_triggers || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

  return {
    dealership_name: body.dealership_name || '',
    contact_name: body.contact_name || '',
    email: body.email || '',
    phone: body.phone || '',
    proposal_recipient_email: body.proposal_recipient_email || body.alternate_email || body.email || '',
    address: body.address || '',
    city: body.city || '',
    state: body.state || '',
    zip: body.zip || '',
    website_url: body.website_url || '',
    sales_radius_miles: body.sales_radius_miles || '',
    service_radius_miles: body.service_radius_miles || '',
    multiple_locations: body.multiple_locations || '',
    primary_goal: body.primary_goal || 'All sales, trade-ins, financing, service appointments, and seasonal maintenance',
    main_service_opportunity: body.main_service_opportunity || 'Full RV demand package: service appointments, A/C service, roof/seal inspections, generator checks, de-winterization, winterization, and seasonal maintenance',
    package_level: body.package_level || '',
    preferred_start: body.preferred_start || '',
    weather_triggers: triggers,
    review_request: body.review_request || '',
    notes: body.notes || '',
    estimate_type: 'AI-generated planning estimate'
  };
}

function buildPrompt(payload) {
  return `
You are helping Smart 1 Marketing estimate campground and RV park market opportunity for an RV dealer advertising proposal.

This is not an exact database lookup. Create a reasonable marketing planning estimate based on the dealer's city, state, ZIP code, sales radius, service radius, regional density, tourism/camping patterns, and typical campground/RV park distribution.

Dealer inputs:
Dealership Name: ${payload.dealership_name}
Address: ${payload.address}
City: ${payload.city}
State: ${payload.state}
ZIP: ${payload.zip}
Website: ${payload.website_url}
Sales Radius: ${payload.sales_radius_miles} miles
Service Radius: ${payload.service_radius_miles} miles
Assumed Campaign Objectives (assume ALL of these): ${payload.primary_goal}
Assumed Service Opportunities (assume ALL of these): ${payload.main_service_opportunity}
Available Weather Triggers (assume the dealer wants ALL relevant triggers on the table): ${payload.weather_triggers.join(', ')}
Campaign start assumption: Start next month, ${nextMonthName}.

The dealer has NOT chosen a monthly package. YOU must recommend the best fit from these three levels based on market size and estimated opportunity: "$3,500/month Climate Safeguard Fund" (Starter), "$5,000/month Climate Safeguard Fund" (Growth), or "$7,500/month Climate Safeguard Fund" (Premium). Put your choice in recommended_package and explain it in recommended_package_reason.

Return conservative-to-strong marketing ranges. Do not claim exact counts. Use ranges. Assume the dealer wants the full RV demand package covering all sales and all service goals; do not ask the dealer to narrow the campaign to only one sales or service objective.

First, classify the dealer into ONE climate/market region based on state and ZIP, using this framework:
- "Southern / Coastal Year-Round RV Market" (FL, AL, TX, LA, GA, NC, SC, MS): heat, rain, storms, hurricane prep, snowbirds, year-round sales.
- "Northern / Seasonal RV Market" (OH, MI, IN, IL, PA, NY, WI, MN): spring opening, summer camping, fall service, winterization.
- "Desert / Southwest RV Market" (AZ, NM, NV, west TX, southern CA): extreme heat, mild winter camping, dust/wind, monsoon storms.
- "Mountain / Four-Season RV Market" (CO, UT, ID, MT, WY): spring thaw, summer camping, fall trips, snow/freeze prep.
- "Pacific Northwest / Rain-Influenced RV Market" (WA, OR, northern CA): rain breaks, sunny weekends, roof/seal inspections, moisture protection.
If the state does not clearly fit, choose the closest region and briefly explain why in the region reason.

Then estimate:
1. Approximate number of campgrounds/RV parks in the sales radius.
2. Approximate total camping/RV sites in the sales radius.
3. Approximate peak-season camper reach.
4. Suggested seasonal campaign plan starting next month.
5. Recommended Smart RV Demand package.
6. Best weather triggers for this dealer, tuned to the region above.
7. A short sales summary written for the dealer.

Use these assumptions unless local context strongly suggests otherwise:
- Average campground/RV park site count: 75–125 sites.
- Seasonal camper share: 35%–45%.
- Transient/daily-weekly camper share: 55%–65%.
- Average people per occupied campsite: 2.4.
- Peak-season transient turnover: 8–12 stays per site.
- Peak season generally runs spring through fall, adjusted by the dealer’s geography (year-round for southern/coastal and desert markets).
- The estimate should be useful for marketing planning, not presented as an audited count.
`;
}

const estimateSchema = {
  name: 'smart_rv_demand_estimate',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      estimate_disclaimer: { type: 'string' },
      market_climate_region: { type: 'string' },
      market_region_reason: { type: 'string' },
      campground_count_low: { type: 'number' },
      campground_count_high: { type: 'number' },
      estimated_site_count_low: { type: 'number' },
      estimated_site_count_high: { type: 'number' },
      estimated_peak_season_reach_low: { type: 'number' },
      estimated_peak_season_reach_high: { type: 'number' },
      seasonal_share_assumption: { type: 'string' },
      transient_share_assumption: { type: 'string' },
      peak_season_assumption: { type: 'string' },
      recommended_package: { type: 'string' },
      recommended_package_reason: { type: 'string' },
      recommended_channels: { type: 'array', items: { type: 'string' } },
      best_weather_triggers: { type: 'array', items: { type: 'string' } },
      dealer_summary: { type: 'string' },
      month_by_month_plan: {
        type: 'array',
        minItems: 6,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            month: { type: 'string' },
            campaign_focus: { type: 'string' },
            recommended_message: { type: 'string' },
            weather_triggers: { type: 'array', items: { type: 'string' } }
          },
          required: ['month', 'campaign_focus', 'recommended_message', 'weather_triggers']
        }
      }
    },
    required: [
      'estimate_disclaimer',
      'market_climate_region',
      'market_region_reason',
      'campground_count_low',
      'campground_count_high',
      'estimated_site_count_low',
      'estimated_site_count_high',
      'estimated_peak_season_reach_low',
      'estimated_peak_season_reach_high',
      'seasonal_share_assumption',
      'transient_share_assumption',
      'peak_season_assumption',
      'recommended_package',
      'recommended_package_reason',
      'recommended_channels',
      'best_weather_triggers',
      'dealer_summary',
      'month_by_month_plan'
    ]
  },
  strict: true
};

function buildProposalSummaryText(payload, estimate) {
  const triggers = (estimate.best_weather_triggers || []).join(', ');
  const channels = (estimate.recommended_channels || []).join(', ');
  return [
    `Smart RV Demand Package for ${payload.dealership_name}`,
    `Location: ${payload.city}, ${payload.state} ${payload.zip}`,
    `Market Type: ${estimate.market_climate_region}`,
    `Sales Radius: ${payload.sales_radius_miles} miles | Service Radius: ${payload.service_radius_miles} miles`,
    `Estimated Campgrounds/RV Parks: ${estimate.campground_count_low}–${estimate.campground_count_high}`,
    `Estimated RV/Camping Sites: ${estimate.estimated_site_count_low}–${estimate.estimated_site_count_high}`,
    `Estimated Peak-Season Camper Reach: ${estimate.estimated_peak_season_reach_low}–${estimate.estimated_peak_season_reach_high}`,
    `Recommended Package: ${estimate.recommended_package}`,
    `Recommended Channels: ${channels}`,
    `Best Weather Triggers: ${triggers}`,
    '',
    estimate.dealer_summary,
    '',
    estimate.estimate_disclaimer
  ].join('\n');
}

function buildMonthByMonthText(estimate) {
  return (estimate.month_by_month_plan || [])
    .map(row => `${row.month}: ${row.campaign_focus} — ${row.recommended_message} [Triggers: ${(row.weather_triggers || []).join(', ')}]`)
    .join('\n');
}

async function createOpenAIEstimate(payload) {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a marketing strategy estimator. Return only the requested JSON.' },
      { role: 'user', content: buildPrompt(payload) }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: estimateSchema
    }
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  return JSON.parse(content);
}

async function sendToSmart1Suite(payload) {
  const response = await fetch(process.env.SMART1_SUITE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Smart 1 Suite webhook failed: ${response.status} ${text}`);
  }

  return { status: response.status, body: text };
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'smart1rv', timestamp: new Date().toISOString() });
});

app.post('/api/rv-demand/estimate-and-submit', async (req, res) => {
  try {
    const formData = normalizeFormPayload(req.body);

    if (!formData.email || !formData.dealership_name || !formData.zip) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: dealership_name, email, and zip are required.'
      });
    }

    const estimate = await createOpenAIEstimate(formData);

    const suitePayload = {
      source: 'Smart RV Demand Estimate Form',
      lead_type: 'Smart RV Demand Package',
      lead_status: 'New RV Demand Lead',
      submitted_at: new Date().toISOString(),
      ...formData,
      selected_weather_triggers: formData.weather_triggers,
      selected_weather_triggers_text: formData.weather_triggers.join(', '),
      ...estimate,
      // Text-friendly ranges for easy Smart 1 Suite document merge fields
      campground_estimate_range: `${estimate.campground_count_low}–${estimate.campground_count_high} campgrounds and RV parks`,
      estimated_site_range: `${estimate.estimated_site_count_low}–${estimate.estimated_site_count_high} estimated RV/camping sites`,
      estimated_peak_season_reach_range: `${estimate.estimated_peak_season_reach_low}–${estimate.estimated_peak_season_reach_high} estimated peak-season camper reach`,
      recommended_channels_text: (estimate.recommended_channels || []).join(', '),
      best_weather_triggers_text: (estimate.best_weather_triggers || []).join(', '),
      month_by_month_plan_text: buildMonthByMonthText(estimate),
      proposal_summary_text: buildProposalSummaryText(formData, estimate)
    };

    const suiteResult = await sendToSmart1Suite(suitePayload);

    return res.json({
      ok: true,
      estimate,
      suite_webhook_status: suiteResult.status
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: 'Estimate or webhook submission failed.',
      detail: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`smart1rv running on port ${PORT}`);
});
