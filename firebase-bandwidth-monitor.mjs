import crypto from 'node:crypto';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'pixelphyx-backendv2';
const databaseUrl = (process.env.FIREBASE_DATABASE_URL || 'https://pixelphyx-backendv2-default-rtdb.firebaseio.com').replace(/\/$/, '');
const serviceAccountRaw = process.env.GCP_SERVICE_ACCOUNT_JSON;

if (!serviceAccountRaw) throw new Error('Missing GCP_SERVICE_ACCOUNT_JSON secret.');

const serviceAccount = JSON.parse(serviceAccountRaw);
if (!serviceAccount.client_email || !serviceAccount.private_key) {
  throw new Error('Service account JSON is missing client_email or private_key.');
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: [\n      'https://www.googleapis.com/auth/cloud-platform',\n      'https://www.googleapis.com/auth/firebase.database',\n      'https://www.googleapis.com/auth/userinfo.email'\n    ].join(' '),
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + '.' + claims;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + '.' + signer.sign(serviceAccount.private_key, 'base64url');

  const response = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error('Google OAuth failed: ' + JSON.stringify(body));
  }
  return body.access_token;
}

async function readLatestMetric(accessToken, metricName) {
  const end = new Date();
  const start = new Date(end.getTime() - 8 * 60 * 60 * 1000);
  const filter = `metric.type = "firebasedatabase.googleapis.com/network/${metricName}" AND resource.type = "firebase_namespace"`;
  const url = new URL(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`);
  url.searchParams.set('filter', filter);
  url.searchParams.set('interval.startTime', start.toISOString());
  url.searchParams.set('interval.endTime', end.toISOString());
  url.searchParams.set('view', 'FULL');

  const response = await fetch(url, {
    headers: { authorization: 'Bearer ' + accessToken }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Cloud Monitoring query failed for ${metricName}: ${JSON.stringify(body)}`);
  }

  const points = (body.timeSeries || []).flatMap(series => series.points || []);
  points.sort((a, b) => Date.parse(b.interval?.endTime || 0) - Date.parse(a.interval?.endTime || 0));
  const point = points[0];
  const value = point?.value?.int64Value ?? point?.value?.doubleValue;
  const timestamp = point?.interval?.endTime;

  if (value === undefined || !timestamp) {
    throw new Error(`No data returned for ${metricName}. Check that Cloud Monitoring has populated this metric.`);
  }

  const ageMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ageMs) || ageMs > 3 * 60 * 60 * 1000) {
    throw new Error(`Latest ${metricName} sample is too old (${Math.round(ageMs / 60000)} minutes).`);
  }

  return { value: Number(value), timestamp };
}

async function main() {
  const accessToken = await getAccessToken();
  const [sent, limit] = await Promise.all([
    readLatestMetric(accessToken, 'monthly_sent'),
    readLatestMetric(accessToken, 'monthly_sent_limit')
  ]);

  if (!Number.isFinite(sent.value) || !Number.isFinite(limit.value) || limit.value <= 0) {
    throw new Error('Cloud Monitoring returned an invalid monthly bandwidth value or limit.');
  }

  const percent = Math.min(100, Math.max(0, (sent.value / limit.value) * 100));
  const status = {
    monthlyUsagePercent: Number(percent.toFixed(2)),
    monthlySentBytes: Math.round(sent.value),
    monthlyLimitBytes: Math.round(limit.value),
    monitoringStatus: 'ok',
    source: 'Google Cloud Monitoring',
    updatedAt: new Date().toISOString(),
    metricSampleTime: sent.timestamp,
    blocked: percent >= 90
  };

  const response = await fetch(databaseUrl + '/serviceStatus.json', {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer ' + accessToken,
      'content-type': 'application/json'
    },
    body: JSON.stringify(status)
  });
  const result = await response.text();
  if (!response.ok) {
    throw new Error('Firebase status update failed (' + response.status + '): ' + result);
  }

  console.log(`Pixel Phyx bandwidth: ${status.monthlyUsagePercent}% (${status.monthlySentBytes} / ${status.monthlyLimitBytes} bytes). Online lock: ${status.blocked ? 'ON' : 'OFF'}.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
